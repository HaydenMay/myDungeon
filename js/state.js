// =====================================================================
// Game state + rules engine. The AI never edits this directly — it
// proposes changes, and everything here validates and applies them.
// =====================================================================
window.MD = window.MD || {};

MD.Game = (() => {
  const C = () => MD.CONFIG;
  const D = () => MD.DATA;
  const SAVE_KEY = "myDungeon.save.v1";
  const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 8);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

  let state = null;

  // ---------- derived stats ----------
  const mod = (score) => Math.floor((score - 10) / 2);
  const prof = (level) => 2 + Math.floor((level - 1) / 4);
  const abil = (a) => mod(state.character.abilities[a] || 10);

  function armorClass(ch = state.character) {
    const dex = mod(ch.abilities.DEX);
    const armor = ch.inventory.find((i) => i.type === "armor" && i.equipped);
    const shield = ch.inventory.find((i) => i.type === "shield" && i.equipped);
    let ac = armor ? armor.ac + Math.min(dex, armor.maxDex ?? 99) + (armor.bonus || 0) : 10 + dex;
    if (shield) ac += (shield.ac || 2) + (shield.bonus || 0);
    return ac;
  }

  const skillMod = (skill) => {
    const ab = D().skills[skill];
    if (!ab) return null;
    return abil(ab) + (state.character.skills.includes(skill) ? prof(state.character.level) : 0);
  };
  const saveMod = (a) => abil(a) + (state.character.saves.includes(a) ? prof(state.character.level) : 0);

  const equippedWeapon = () =>
    state.character.inventory.find((i) => i.type === "weapon" && i.equipped) ||
    { name: "Unarmed Strike", damage: "1", ability: "STR", bonus: 0 };

  const attackBonus = (w) => abil(w.ability || "STR") + prof(state.character.level) + (w.bonus || 0);
  const damageExpr = (w) => {
    const m = abil(w.ability || "STR") + (w.bonus || 0);
    return w.damage + (m ? (m > 0 ? "+" + m : String(m)) : "");
  };

  // ---------- creation ----------
  function createCharacter({ name, race, cls }) {
    const R = D().races[race], K = D().classes[cls];
    const abilities = {};
    for (const a of D().abilities) abilities[a] = (K.array[a] || 10) + (R.bonus[a] || 0);
    const conMod = mod(abilities.CON);
    const maxHp = K.hitDie + conMod;
    return {
      name: name || "Nameless",
      race, cls, level: 1, xp: 0,
      abilities, maxHp, hp: maxHp,
      gold: K.gold + C().rules.startingGoldBonus,
      inventory: K.gear.map((g) => ({ id: uid("item"), qty: 1, ...g })),
      skills: [...K.skills], saves: [...K.saves],
      hitDiceLeft: 1,
      healUses: K.heals ? K.heals.usesPerLongRest : 0,
      secondWindReady: cls === "Fighter",
      status: "ok",                       // ok | down | stable | dead
      deathSaves: { s: 0, f: 0 },
      conditions: [],
    };
  }

  function newGame({ name, race, cls, premise }) {
    state = {
      version: 1, id: uid("game"), createdAt: Date.now(),
      premise: premise || "",
      character: createCharacter({ name, race, cls }),
      enemies: [],
      journal: [],
      storySoFar: "",
      log: [],
      pending: null,
      suggestions: [],
      turn: 0,
      lastRecapTurn: 0,
    };
    save();
    return state;
  }

  // ---------- log ----------
  function log(role, text) {
    state.log.push({ role, text, turn: state.turn, t: Date.now() });
    return text;
  }

  // ---------- leveling ----------
  function gainXp(amount, msgs) {
    const ch = state.character;
    ch.xp += amount;
    msgs.push(`+${amount} XP`);
    while (ch.level < C().rules.maxLevel && ch.xp >= D().xpTable[ch.level]) {
      ch.level += 1;
      const K = D().classes[ch.cls];
      const gain = Math.max(1, Math.floor(K.hitDie / 2) + 1 + mod(ch.abilities.CON));
      ch.maxHp += gain; ch.hp += gain; ch.hitDiceLeft += 1;
      msgs.push(`⭐ LEVEL UP! You are now level ${ch.level} (+${gain} max HP).`);
    }
  }

  // ---------- damage / healing ----------
  function damagePlayer(amount, msgs, source = "") {
    const ch = state.character;
    if (amount <= 0 || ch.status === "dead") return;
    if (ch.status === "down" || ch.status === "stable") {
      ch.status = "down";
      ch.deathSaves.f += 1;
      msgs.push(`You take damage while down — a death save failure (${ch.deathSaves.f}/${C().rules.deathSavesToDie}).`);
      checkDeath(msgs);
      return;
    }
    ch.hp = Math.max(0, ch.hp - amount);
    msgs.push(`-${amount} HP${source ? " (" + source + ")" : ""} → ${ch.hp}/${ch.maxHp}`);
    if (ch.hp === 0) {
      ch.status = "down";
      ch.deathSaves = { s: 0, f: 0 };
      msgs.push("💀 You drop to 0 HP and fall unconscious! Make death saving throws.");
    }
  }

  function healPlayer(amount, msgs, source = "") {
    const ch = state.character;
    if (amount <= 0 || ch.status === "dead") return;
    const before = ch.hp;
    ch.hp = Math.min(ch.maxHp, ch.hp + amount);
    if (ch.status !== "ok") { ch.status = "ok"; ch.deathSaves = { s: 0, f: 0 }; msgs.push("You regain consciousness!"); }
    msgs.push(`+${ch.hp - before} HP${source ? " (" + source + ")" : ""} → ${ch.hp}/${ch.maxHp}`);
  }

  function checkDeath(msgs) {
    const ch = state.character;
    if (ch.deathSaves.f >= C().rules.deathSavesToDie) {
      ch.status = "dead";
      msgs.push("☠️ You have died. Your story ends here.");
    }
  }

  function deathSave() {
    const ch = state.character;
    const msgs = [];
    if (ch.status !== "down") return msgs;
    const r = MD.Dice.rollDie(20);
    if (r === 20) { ch.hp = 1; ch.status = "ok"; ch.deathSaves = { s: 0, f: 0 }; msgs.push(`Death save: natural 20! You surge back to 1 HP.`); }
    else if (r === 1) { ch.deathSaves.f += 2; msgs.push(`Death save: natural 1 — two failures (${ch.deathSaves.f}/${C().rules.deathSavesToDie}).`); }
    else if (r >= 10) { ch.deathSaves.s += 1; msgs.push(`Death save: ${r} — success (${ch.deathSaves.s}/${C().rules.deathSavesToStabilize}).`); }
    else { ch.deathSaves.f += 1; msgs.push(`Death save: ${r} — failure (${ch.deathSaves.f}/${C().rules.deathSavesToDie}).`); }
    if (ch.status === "down" && ch.deathSaves.s >= C().rules.deathSavesToStabilize) {
      ch.status = "stable"; msgs.push("You stabilize, unconscious but alive. You'll come to with 1 HP shortly.");
      ch.hp = 1; ch.status = "ok"; ch.deathSaves = { s: 0, f: 0 };
    }
    checkDeath(msgs);
    msgs.forEach((m) => log("roll", m));
    save();
    return msgs;
  }

  // ---------- items ----------
  const findItem = (q) => {
    const inv = state.character.inventory;
    return inv.find((i) => i.id === q) || inv.find((i) => i.name.toLowerCase() === String(q).toLowerCase());
  };

  function sanitizeItem(raw) {
    const g = C().guards;
    const lvl = state.character.level;
    const maxBonus = g.maxMagicBonusByLevel[clamp(lvl - 1, 0, g.maxMagicBonusByLevel.length - 1)];
    const types = ["weapon", "armor", "shield", "consumable", "misc"];
    const item = {
      id: uid("item"),
      name: String(raw.name || "Mysterious Trinket").slice(0, 60),
      type: types.includes(raw.type) ? raw.type : "misc",
      qty: clamp(Math.round(num(raw.qty, 1)), 1, 20),
      desc: raw.desc ? String(raw.desc).slice(0, 200) : "",
    };
    const bonus = clamp(Math.round(num(raw.bonus, 0)), 0, maxBonus);
    if (bonus) item.bonus = bonus;
    if (item.type === "weapon") {
      item.damage = MD.Dice.isValid(raw.damage) ? raw.damage : "1d6";
      if (MD.Dice.average(item.damage) > 7) item.damage = "1d12"; // no AI-invented 4d10 daggers
      item.ability = ["STR", "DEX", "INT", "WIS", "CHA"].includes(raw.ability) ? raw.ability : "STR";
    }
    if (item.type === "armor") { item.ac = clamp(num(raw.ac, 11), 11, 18); item.maxDex = clamp(num(raw.maxDex, 99), 0, 99); }
    if (item.type === "shield") item.ac = 2;
    if (item.type === "consumable" && raw.heal) {
      item.heal = MD.Dice.isValid(raw.heal) && MD.Dice.average(raw.heal) <= 6 * lvl + 6 ? raw.heal : "2d4+2";
    }
    return item;
  }

  function addItem(raw, msgs) {
    const item = sanitizeItem(raw);
    const existing = state.character.inventory.find((i) => i.name.toLowerCase() === item.name.toLowerCase() && !item.bonus);
    if (existing && (item.type === "consumable" || item.type === "misc")) { existing.qty += item.qty; }
    else state.character.inventory.push(item);
    msgs.push(`🎒 Gained ${item.qty > 1 ? item.qty + "× " : ""}${item.name}${item.bonus ? ` (+${item.bonus})` : ""}`);
  }

  function removeItem(q, qty, msgs) {
    const it = findItem(q);
    if (!it) return;
    it.qty -= Math.max(1, num(qty, 1));
    if (it.qty <= 0) state.character.inventory = state.character.inventory.filter((i) => i !== it);
    msgs.push(`🎒 Lost ${it.name}`);
  }

  function useItem(id) {
    const msgs = [];
    const it = findItem(id);
    if (!it || it.type !== "consumable") return msgs;
    if (state.character.status === "dead") return msgs;
    if (it.heal) {
      const r = MD.Dice.roll(it.heal);
      log("roll", `${it.name}: ${r.text}`);
      healPlayer(r.total, msgs, it.name);
    } else msgs.push(`Used ${it.name}.`);
    removeItem(it.id, 1, []);
    msgs.forEach((m) => log("system", m));
    save();
    return msgs;
  }

  function toggleEquip(id) {
    const it = findItem(id);
    if (!it || !["weapon", "armor", "shield"].includes(it.type)) return;
    if (!it.equipped && it.type !== "shield") {
      state.character.inventory.forEach((i) => { if (i.type === it.type) i.equipped = false; });
    }
    it.equipped = !it.equipped;
    save();
  }

  // ---------- class abilities ----------
  function useClassAbility(kind) {
    const ch = state.character, msgs = [];
    if (ch.status === "dead") return msgs;
    if (kind === "secondWind" && ch.secondWindReady) {
      const r = MD.Dice.roll(`1d10+${ch.level}`);
      log("roll", `Second Wind: ${r.text}`);
      healPlayer(r.total, msgs, "Second Wind");
      ch.secondWindReady = false;
    }
    const H = D().classes[ch.cls].heals;
    if (kind === "heal" && H && ch.healUses > 0) {
      const m = abil(H.ability);
      const r = MD.Dice.roll(`${H.dice}+${Math.max(0, m)}`);
      log("roll", `${H.name}: ${r.text}`);
      healPlayer(r.total, msgs, H.name);
      ch.healUses -= 1;
    }
    msgs.forEach((m) => log("system", m));
    save();
    return msgs;
  }

  // ---------- rest ----------
  function rest(kind, msgs) {
    const ch = state.character;
    if (ch.status === "dead") return;
    const K = D().classes[ch.cls];
    if (kind === "long") {
      ch.hp = ch.maxHp; ch.status = "ok"; ch.deathSaves = { s: 0, f: 0 };
      ch.hitDiceLeft = ch.level;
      ch.healUses = K.heals ? K.heals.usesPerLongRest : 0;
      ch.secondWindReady = ch.cls === "Fighter";
      msgs.push("🌙 Long rest: HP and abilities fully restored.");
    } else if (kind === "short") {
      const n = Math.min(ch.hitDiceLeft, C().rules.shortRestHealDice);
      if (n > 0) {
        const r = MD.Dice.roll(`${n}d${K.hitDie}+${n * mod(ch.abilities.CON)}`);
        ch.hitDiceLeft -= n;
        log("roll", `Short rest hit dice: ${r.text}`);
        healPlayer(Math.max(1, r.total), msgs, "short rest");
      }
      ch.secondWindReady = ch.cls === "Fighter";
      msgs.push("☕ Short rest taken.");
    }
  }

  // ---------- enemies ----------
  function spawnEnemies(list, msgs) {
    const g = C().guards, lvl = state.character.level;
    for (const e of (list || []).slice(0, g.maxEnemiesPerSpawn)) {
      const hp = clamp(Math.round(num(e.hp, 7)), 1, g.maxEnemyHpPerLevel * lvl);
      const enemy = {
        id: String(e.id || uid("foe")).slice(0, 30).replace(/\s+/g, "_"),
        name: String(e.name || "Foe").slice(0, 40),
        hp, maxHp: hp,
        ac: clamp(Math.round(num(e.ac, 12)), 8, 20),
        attackBonus: clamp(Math.round(num(e.attack_bonus ?? e.attackBonus, 3)), 0, g.maxEnemyAttackBonus),
        damage: MD.Dice.isValid(e.damage) ? e.damage : "1d6+1",
      };
      if (state.enemies.some((x) => x.id === enemy.id)) enemy.id += "_" + Math.random().toString(36).slice(2, 4);
      state.enemies.push(enemy);
      msgs.push(`⚔️ ${enemy.name} appears! (AC ${enemy.ac}, ${enemy.hp} HP)`);
    }
  }

  function findEnemy(q) {
    if (!q) return state.enemies[0];
    const s = String(q).toLowerCase();
    return state.enemies.find((e) => e.id.toLowerCase() === s) || state.enemies.find((e) => e.name.toLowerCase().includes(s));
  }

  function enemyAttack(enemyId, msgs) {
    const e = findEnemy(enemyId);
    const ch = state.character;
    if (!e || ch.status === "dead") return;
    const d = MD.Dice.d20();
    const total = d.natural + e.attackBonus;
    const ac = armorClass();
    const crit = d.natural >= C().rules.critRange;
    if (ch.status !== "ok") {
      // Attacks on a downed character auto-hit and count as a failed save (two if crit-range melee in 5e; keep it simple)
      msgs.push(`${e.name} strikes your unconscious body!`);
      damagePlayer(1, msgs);
      return;
    }
    if (d.natural === 1 || (!crit && total < ac)) {
      msgs.push(`${e.name} attacks: ${d.natural}+${e.attackBonus} = ${total} vs AC ${ac} — miss.`);
      return;
    }
    const dmg = MD.Dice.roll(e.damage, { crit });
    msgs.push(`${e.name} attacks: ${d.natural}+${e.attackBonus} = ${total} vs AC ${ac} — ${crit ? "CRITICAL HIT" : "hit"}! ${dmg.text}`);
    damagePlayer(Math.max(1, dmg.total), msgs, e.name);
  }

  function playerAttack(enemyId, mode = "normal") {
    const msgs = [];
    const e = findEnemy(enemyId);
    if (!e) { msgs.push("No such target."); return { msgs }; }
    const w = equippedWeapon();
    const bonus = attackBonus(w);
    const d = MD.Dice.d20(mode);
    const total = d.natural + bonus;
    const crit = d.natural >= C().rules.critRange;
    const rollsTxt = d.rolls.length > 1 ? `[${d.rolls.join(",")}]→${d.natural}` : d.natural;
    let hit = false, killed = false;
    if (d.natural === 1 || (!crit && total < e.ac)) {
      msgs.push(`You attack ${e.name} with ${w.name}: ${rollsTxt}+${bonus} = ${total} vs AC ${e.ac} — miss.`);
    } else {
      hit = true;
      let expr = damageExpr(w);
      const ch = state.character;
      if (ch.cls === "Rogue" && mode === "advantage") expr += `+${Math.ceil(ch.level / 2)}d6`;
      const dmg = MD.Dice.roll(expr, { crit });
      const amount = Math.max(1, dmg.total);
      e.hp = Math.max(0, e.hp - amount);
      msgs.push(`You attack ${e.name} with ${w.name}: ${rollsTxt}+${bonus} = ${total} vs AC ${e.ac} — ${crit ? "CRITICAL HIT" : "hit"}! ${dmg.text} damage. (${e.name}: ${e.hp}/${e.maxHp} HP)`);
      if (e.hp === 0) {
        killed = true;
        msgs.push(`🗡️ ${e.name} is defeated!`);
        state.enemies = state.enemies.filter((x) => x !== e);
      }
    }
    msgs.forEach((m) => log("roll", m));
    save();
    return { msgs, hit, killed, enemy: e };
  }

  // ---------- checks & saves ----------
  function resolveCheck(req, mode = "normal") {
    let modifier = 0, label = "";
    if (req.type === "save") {
      const a = (req.ability || "DEX").toUpperCase();
      modifier = saveMod(a); label = `${a} save`;
    } else if (req.skill && D().skills[req.skill] !== undefined) {
      modifier = skillMod(req.skill); label = `${req.skill} (${D().skills[req.skill]})`;
    } else {
      const a = (req.ability || "STR").toUpperCase();
      modifier = abil(a); label = `${a} check`;
    }
    const m = req.mode || mode;
    const d = MD.Dice.d20(m);
    const total = d.natural + modifier;
    const dc = clamp(num(req.dc, 12), 5, 30);
    const success = total >= dc; // 5e: nat 1/20 only auto-fail/succeed on attacks
    const rollsTxt = d.rolls.length > 1 ? `[${d.rolls.join(",")}]→${d.natural}` : d.natural;
    const text = `${label}: ${rollsTxt}${modifier >= 0 ? "+" : ""}${modifier} = ${total} vs DC ${dc} — ${success ? "SUCCESS" : "FAILURE"}${d.natural === 20 ? " (natural 20!)" : d.natural === 1 ? " (natural 1!)" : ""}`;
    log("roll", text);
    save();
    return { text, success, total, natural: d.natural };
  }

  // ---------- applying the DM's proposed changes ----------
  function applyDmResponse(r) {
    const msgs = [];
    const g = C().guards, lvl = state.character.level;
    const ch = state.character;
    const c = r.changes || {};

    if (num(c.gold)) {
      const cap = g.maxGoldPerTurnPerLevel * lvl;
      const amt = clamp(Math.round(num(c.gold)), -ch.gold, cap);
      ch.gold += amt;
      if (amt) msgs.push(`${amt > 0 ? "💰 +" : "💸 "}${amt} gold → ${ch.gold}`);
    }
    if (num(c.xp) > 0) gainXp(clamp(Math.round(num(c.xp)), 0, g.maxXpPerTurnPerLevel * lvl), msgs);
    if (num(c.damage) > 0) damagePlayer(clamp(Math.round(num(c.damage)), 0, g.maxAiDamagePerTurnPerLevel * lvl), msgs, c.damage_source || "");
    if (num(c.heal) > 0) healPlayer(clamp(Math.round(num(c.heal)), 0, g.maxAiHealPerTurnPerLevel * lvl), msgs);
    (c.add_items || []).slice(0, g.maxItemsPerTurn).forEach((it) => addItem(it, msgs));
    (c.remove_items || []).forEach((it) => removeItem(it.name || it.id || it, it.qty, msgs));
    if (c.rest === "short" || c.rest === "long") rest(c.rest, msgs);
    if (Array.isArray(c.conditions)) ch.conditions = c.conditions.map(String).slice(0, 5);

    const E = r.enemies || {};
    spawnEnemies(E.spawn, msgs);
    (E.update || []).forEach((u) => {
      const e = findEnemy(u.id); if (!e) return;
      if (num(u.hp_delta)) e.hp = clamp(e.hp + Math.round(num(u.hp_delta)), 0, e.maxHp);
      if (e.hp === 0) { msgs.push(`${e.name} is defeated!`); state.enemies = state.enemies.filter((x) => x !== e); }
    });
    (E.remove || []).forEach((id) => {
      const e = findEnemy(id);
      if (e) { state.enemies = state.enemies.filter((x) => x !== e); msgs.push(`${e.name} is gone (${E.remove_reason || "fled or resolved"}).`); }
    });

    applyJournal(r.journal || []);
    if (r.story_so_far && typeof r.story_so_far === "string") { state.storySoFar = r.story_so_far.slice(0, 2500); state.lastRecapTurn = state.turn; }
    state.suggestions = Array.isArray(r.suggested_actions) ? r.suggested_actions.slice(0, 4).map(String) : [];

    msgs.forEach((m) => log("system", m));
    return msgs;
  }

  // Enemy turn runs after narration (the DM narrates the attempt, code decides the hit)
  function runEnemyTurn(r) {
    const msgs = [];
    (r.enemy_attacks || []).slice(0, 6).forEach((a) => enemyAttack(a.enemy_id || a.id || a, msgs));
    msgs.forEach((m) => log("roll", m));
    return msgs;
  }

  // ---------- journal ----------
  const SECTIONS = ["quests", "npcs", "places", "notes", "plot", "secrets"];
  function applyJournal(ops) {
    for (const op of ops.slice(0, 12)) {
      if (!op || typeof op !== "object") continue;
      const kind = op.op || "add";
      const target = op.id ? state.journal.find((j) => j.id === op.id) :
        op.title ? state.journal.find((j) => j.title.toLowerCase() === String(op.title).toLowerCase() && (!op.section || j.section === op.section)) : null;
      if (kind === "add" && !target) {
        state.journal.push({
          id: uid("j"),
          section: SECTIONS.includes(op.section) ? op.section : "notes",
          title: String(op.title || "Untitled").slice(0, 80),
          text: String(op.text || "").slice(0, 600),
          visibility: op.visibility === "dm_only" || ["plot", "secrets"].includes(op.section) ? "dm_only" : "player",
          resolved: false,
          turn: state.turn,
        });
      } else if (target && (kind === "update" || kind === "add")) {
        if (op.text) target.text = String(op.text).slice(0, 600);
        if (op.visibility === "player" && !["plot"].includes(target.section)) target.visibility = "player";
        if (op.resolved !== undefined) target.resolved = !!op.resolved;
      } else if (target && kind === "reveal") {
        target.visibility = "player";
        if (target.section === "secrets") target.section = "notes";
      } else if (target && kind === "resolve") {
        target.resolved = true;
        if (op.text) target.text = String(op.text).slice(0, 600);
      } else if (target && kind === "remove") {
        state.journal = state.journal.filter((j) => j !== target);
      }
    }
  }

  const journalChars = () => state.journal.reduce((n, j) => n + j.title.length + j.text.length, 0) + state.storySoFar.length;

  function replaceJournal(entries, story) {
    if (!Array.isArray(entries) || !entries.length) return;
    state.journal = [];
    applyJournal(entries.map((e) => ({ ...e, op: "add" })));
    // keep resolved flags from the compacted version
    entries.forEach((e, i) => { if (state.journal[i] && e.resolved) state.journal[i].resolved = true; });
    if (story) state.storySoFar = String(story).slice(0, 2500);
  }

  // ---------- persistence ----------
  function save() { if (state) try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { console.warn("save failed", e); } }
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) state = JSON.parse(raw); } catch (e) { state = null; }
    return state;
  }
  function clear() { localStorage.removeItem(SAVE_KEY); state = null; }
  const exportJson = () => JSON.stringify(state, null, 2);
  function importJson(text) {
    const s = JSON.parse(text);
    if (!s || !s.character || !Array.isArray(s.log)) throw new Error("Not a myDungeon save file");
    state = s; save(); return state;
  }

  // compact snapshot for the AI
  function snapshot() {
    const ch = state.character;
    return {
      character: {
        name: ch.name, race: ch.race, class: ch.cls, level: ch.level, xp: ch.xp,
        next_level_xp: D().xpTable[ch.level] ?? null,
        hp: ch.hp, max_hp: ch.maxHp, ac: armorClass(), gold: ch.gold, status: ch.status,
        conditions: ch.conditions,
        abilities: ch.abilities,
        proficient_skills: ch.skills,
        class_feature: D().classes[ch.cls].feature,
        race_trait: D().races[ch.race].trait,
        equipped_weapon: equippedWeapon().name,
        inventory: ch.inventory.map((i) => `${i.qty > 1 ? i.qty + "× " : ""}${i.name}${i.bonus ? " +" + i.bonus : ""}${i.equipped ? " (equipped)" : ""}`),
      },
      enemies: state.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, max_hp: e.maxHp, ac: e.ac })),
      turn: state.turn,
    };
  }

  return {
    get state() { return state; },
    newGame, load, save, clear, exportJson, importJson, log,
    mod, prof, armorClass, skillMod, saveMod, equippedWeapon, attackBonus, damageExpr,
    applyDmResponse, runEnemyTurn, resolveCheck, playerAttack, deathSave,
    useItem, toggleEquip, useClassAbility, findEnemy,
    journalChars, replaceJournal, snapshot, SECTIONS,
  };
})();
