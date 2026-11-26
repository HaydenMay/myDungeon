// =====================================================================
// Rendering. Pure-ish: reads MD.Game.state, writes DOM.
// =====================================================================
window.MD = window.MD || {};

MD.UI = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const signed = (n) => (n >= 0 ? "+" + n : String(n));
  const pct = (a, b) => Math.max(0, Math.min(100, b ? (a / b) * 100 : 0));
  const G = () => MD.Game;

  function applyTheme() {
    for (const [k, v] of Object.entries(MD.CONFIG.theme)) document.documentElement.style.setProperty(k, v);
  }

  // ---------- feed ----------
  let lastLogLen = 0;
  function renderFeed() {
    const st = G().state, feed = $("feed");
    feed.innerHTML = st.log.map((l) => `<div class="msg ${l.role}">${esc(l.text)}</div>`).join("") +
      (MD.DM.busy ? `<div class="msg thinking">The DM is thinking</div>` : "");
    if (st.log.length !== lastLogLen || MD.DM.busy) feed.scrollTop = feed.scrollHeight;
    lastLogLen = st.log.length;
  }

  // ---------- bars ----------
  function renderBars() {
    const st = G().state, ch = st.character, busy = MD.DM.busy;
    const alive = ch.status === "ok";

    // combat
    const cb = $("combatBar");
    if (st.enemies.length && ch.status !== "dead") {
      cb.classList.remove("hidden");
      cb.innerHTML = st.enemies.map((e) => `
        <div class="foe">
          <div class="name"><span>${esc(e.name)}</span><span class="muted">AC ${e.ac} · ${e.hp}/${e.maxHp}</span></div>
          <div class="bar ${e.hp / e.maxHp < .35 ? "hp-bad" : ""}"><div style="width:${pct(e.hp, e.maxHp)}%"></div></div>
          <button class="tiny" data-attack="${esc(e.id)}" ${busy || !alive || st.pending ? "disabled" : ""}>Attack (${esc(G().equippedWeapon().name)})</button>
        </div>`).join("");
    } else cb.classList.add("hidden");

    // pending roll
    const pb = $("pendingBar"), p = st.pending;
    if (p && alive) {
      pb.classList.remove("hidden");
      let label;
      if (p.type === "attack") {
        const e = G().findEnemy(p.target);
        label = `Attack roll vs <b>${esc(e?.name || p.target)}</b> (AC ${e?.ac ?? "?"}) — ${signed(G().attackBonus(G().equippedWeapon()))} to hit`;
      } else if (p.type === "save") {
        label = `<b>${esc(p.ability)} saving throw</b> · DC ${esc(p.dc)} · ${signed(G().saveMod(String(p.ability).toUpperCase()))}`;
      } else {
        const m = p.skill && MD.DATA.skills[p.skill] ? G().skillMod(p.skill) : G().mod(ch.abilities[String(p.ability || "STR").toUpperCase()] || 10);
        label = `<b>${esc(p.skill || p.ability)} check</b> · DC ${esc(p.dc)} · ${signed(m)}`;
      }
      if (p.reason) label += ` <span class="muted">— ${esc(p.reason)}</span>`;
      const forced = p.mode && p.mode !== "normal" ? ` <span class="muted">(${esc(p.mode)})</span>` : "";
      pb.innerHTML = `<div class="label">🎲 ${label}${forced}</div>
        <button class="primary" data-roll="normal" ${busy ? "disabled" : ""}>Roll d20</button>`;
    } else pb.classList.add("hidden");

    // death saves
    const db = $("deathBar");
    if (ch.status === "down") {
      db.classList.remove("hidden");
      db.innerHTML = `<div class="label">💀 You're unconscious. Successes ${ch.deathSaves.s}/${MD.CONFIG.rules.deathSavesToStabilize} · Failures ${ch.deathSaves.f}/${MD.CONFIG.rules.deathSavesToDie}</div>
        <button class="primary" id="deathSaveBtn" ${busy ? "disabled" : ""}>Roll death save</button>`;
    } else if (ch.status === "dead") {
      db.classList.remove("hidden");
      db.innerHTML = `<div class="label">☠️ ${esc(ch.name)} has fallen. The tale is over.</div>
        <button class="primary" id="restartBtn">Start a new adventure</button>`;
    } else db.classList.add("hidden");

    // suggestions
    $("suggestions").innerHTML = (!p && alive && !busy ? st.suggestions : [])
      .map((s) => `<button data-suggest="${esc(s)}">${esc(s)}</button>`).join("");

    const blocked = busy || !alive || !!p;
    $("sendBtn").disabled = blocked;
    $("actionInput").disabled = blocked;
    $("actionInput").placeholder = p ? "Roll first…" : !alive ? "…" : "What do you do?";
  }

  // ---------- sheet ----------
  function renderSheet() {
    const ch = G().state.character, D = MD.DATA, K = D.classes[ch.cls];
    const nextXp = D.xpTable[ch.level];
    const prevXp = D.xpTable[ch.level - 1];
    const ab = D.abilities.map((a) => `<div class="ab"><div class="k">${a}</div><div class="v">${ch.abilities[a]}</div><div class="m">${signed(G().mod(ch.abilities[a]))}</div></div>`).join("");
    const w = G().equippedWeapon();
    const inv = ch.inventory.map((i) => {
      const meta = i.type === "weapon" ? `${i.damage}${i.bonus ? " +" + i.bonus : ""} ${i.ability}` :
        i.type === "armor" ? `AC ${i.ac}${i.bonus ? " +" + i.bonus : ""}` : i.type === "shield" ? "+2 AC" :
        i.heal ? `heals ${i.heal}` : "";
      const btn = i.type === "consumable" ? `<button class="tiny" data-use="${i.id}" ${MD.DM.busy || ch.status === "dead" ? "disabled" : ""}>Use</button>` :
        ["weapon", "armor", "shield"].includes(i.type) ? `<button class="tiny ghost" data-equip="${i.id}">${i.equipped ? "Unequip" : "Equip"}</button>` : "";
      return `<div class="inv-item" title="${esc(i.desc || "")}"><span class="nm">${i.qty > 1 ? i.qty + "× " : ""}${esc(i.name)} ${i.equipped ? '<span class="eq">●</span>' : ""}<br><span class="meta">${esc(meta)}</span></span>${btn}</div>`;
    }).join("");
    const skills = Object.keys(D.skills).map((s) => {
      const p = ch.skills.includes(s);
      return `<span class="${p ? "p" : ""}">${p ? "● " : ""}${s}</span><span class="${p ? "p" : ""}">${signed(G().skillMod(s))}</span>`;
    }).join("");
    const abilities = [];
    if (ch.cls === "Fighter") abilities.push(`<button class="tiny" data-ability="secondWind" ${!ch.secondWindReady || MD.DM.busy || ch.status !== "ok" ? "disabled" : ""}>Second Wind ${ch.secondWindReady ? "" : "(used)"}</button>`);
    if (K.heals) abilities.push(`<button class="tiny" data-ability="heal" ${ch.healUses < 1 || MD.DM.busy || ch.status === "dead" ? "disabled" : ""}>${K.heals.name} (${ch.healUses} left)</button>`);

    $("sheet").innerHTML = `<div class="sheet">
      <h2>${esc(ch.name)}</h2>
      <div class="sub">Level ${ch.level} ${esc(ch.race)} ${esc(ch.cls)}${ch.conditions?.length ? " · " + esc(ch.conditions.join(", ")) : ""}</div>
      <div class="stat-row"><span>HP</span><span>${ch.hp} / ${ch.maxHp}</span></div>
      <div class="bar ${ch.hp / ch.maxHp < .35 ? "hp-bad" : ""}"><div style="width:${pct(ch.hp, ch.maxHp)}%"></div></div>
      <div class="stat-row"><span>XP</span><span>${ch.xp}${nextXp ? " / " + nextXp : " (max)"}</span></div>
      <div class="bar xp"><div style="width:${nextXp ? pct(ch.xp - prevXp, nextXp - prevXp) : 100}%"></div></div>
      <div class="abilities">${ab}</div>
      <div class="big-stats">
        <div><b>${G().armorClass()}</b><span>AC</span></div>
        <div><b>${ch.gold}</b><span>Gold</span></div>
        <div><b>${signed(G().prof(ch.level))}</b><span>Prof</span></div>
      </div>
      <h3>Attack</h3>
      <div class="feature">${esc(w.name)}: ${signed(G().attackBonus(w))} to hit, ${esc(G().damageExpr(w))} damage</div>
      ${abilities.length ? `<h3>Abilities</h3><div class="row wrap">${abilities.join("")}</div>` : ""}
      <h3>Inventory</h3>${inv || '<div class="muted small">Empty</div>'}
      <h3>Skills</h3><div class="skills">${skills}</div>
      <h3>Features</h3>
      <div class="feature">${esc(K.feature)}<br>${esc(D.races[ch.race].trait)}</div>
    </div>`;
  }

  // ---------- journal ----------
  const SECTION_NAMES = { quests: "Quests", npcs: "People", places: "Places", notes: "Notes", plot: "DM: Plot", secrets: "DM: Secrets" };
  function renderJournal() {
    const st = G().state, showDm = MD.Settings.get().showDmJournal;
    const visible = st.journal.filter((j) => showDm || j.visibility === "player");
    let html = `<h3>Story so far</h3><div class="story-recap">${esc(st.storySoFar || "Your story is just beginning.")}</div>`;
    for (const sec of G().SECTIONS) {
      const items = visible.filter((j) => j.section === sec).sort((a, b) => a.resolved - b.resolved);
      if (!items.length) continue;
      html += `<div class="jsec"><h3>${SECTION_NAMES[sec]}</h3>${items.map((j) =>
        `<div class="jentry ${j.resolved ? "resolved" : ""} ${j.visibility === "dm_only" ? "dm" : ""}"><b>${esc(j.title)}</b>${esc(j.text)}</div>`).join("")}</div>`;
    }
    $("journal").innerHTML = html;
  }

  function renderAll() {
    if (!G().state) return;
    renderFeed(); renderBars(); renderSheet(); renderJournal();
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 6000);
  }

  return { applyTheme, renderAll, toast, esc };
})();
