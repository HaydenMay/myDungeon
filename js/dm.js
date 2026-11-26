// =====================================================================
// The AI Dungeon Master: prompt building + the turn loop.
// =====================================================================
window.MD = window.MD || {};

MD.DM = (() => {
  const G = () => MD.Game;
  let busy = false;
  let onUpdate = () => {};
  let onError = () => {};

  function systemPrompt() {
    const s = MD.Settings.get(), N = MD.CONFIG.narrator;
    return `You are the Dungeon Master of a solo, text-based Dungeons & Dragons 5e-style campaign.
You invent the world, the adventure, the NPCs and the challenges as play goes on. You are the storyteller and the referee of fiction.
The GAME ENGINE (not you) owns all numbers: HP, AC, gold, XP, inventory, enemy HP, dice. You PROPOSE changes; the engine applies and may cap them.

STYLE
- Tone: ${N.tones[s.tone] || N.tones.classic}
- Length: ${N.lengths[s.length] || N.lengths.medium}
- Difficulty: ${N.difficulties[s.difficulty] || N.difficulties.normal}
- Second person ("you"). Vivid but readable. End with something the player can react to.
- Never decide what the player character does, says or feels beyond tiny reactions. Ask, don't assume.
- Respect the player's agency: if a plan is clever, let it work or nearly work.

RUNNING THE GAME
- Use the journal. Entries tagged dm_only are your private notes (plot outline, secrets). Steer the story toward the outline's beats, but improvise when the player goes elsewhere and update the outline.
- Keep the journal current: add NPCs, places and quests when they appear; update them when they change; resolve finished quests; reveal secrets when the player discovers them.
- Never mention dm_only info in narration until the player discovers it.
- Use the current state exactly. Don't invent items the player doesn't have. Don't state HP or gold numbers that differ from the state.
- When an outcome is uncertain, ask for a roll with "request" and STOP the scene right before the outcome. Don't narrate the result — you'll get the roll back.
  - Skill/ability check: {"type":"check","skill":"Stealth","dc":13,"reason":"..."}   (or "ability":"STR" instead of skill)
  - Saving throw: {"type":"save","ability":"DEX","dc":13,"reason":"..."}
  - Player attack: {"type":"attack","target":"<enemy id>"}
  - Optional "mode":"advantage" or "disadvantage".
- Combat: spawn enemies with stats appropriate to the character's level. When enemies act, narrate their ATTEMPT only (e.g. "the orc swings at you") and list them in enemy_attacks; the engine rolls to hit and reports results next turn. Don't list enemy_attacks in the same reply as a request.
- Roll results arrive as <roll_result>. Narrate the outcome faithfully (a hit is a hit; a miss is a miss). If an enemy was defeated it's already removed.
- Reward progress: XP for overcoming challenges (roughly 25-100 per encounter at low level, more for big milestones), gold and items for loot. Be fair, not stingy, not a loot piñata.
- If the character is down (0 HP), narrate tension; the player is rolling death saves.

OUTPUT — reply with ONLY a JSON object (no markdown, no text outside it). All keys optional except narration:
{
  "narration": "string — what the player sees",
  "request": null | { "type": "check"|"save"|"attack", ... },
  "enemy_attacks": [ { "enemy_id": "goblin_1" } ],
  "changes": {
    "gold": 0, "xp": 0,
    "damage": 0, "damage_source": "trap/fall/poison (non-attack damage only)",
    "heal": 0,
    "add_items": [ { "name": "", "type": "weapon|armor|shield|consumable|misc", "qty": 1, "desc": "", "damage": "1d8", "ability": "STR|DEX", "ac": 12, "heal": "2d4+2", "bonus": 0 } ],
    "remove_items": [ { "name": "", "qty": 1 } ],
    "rest": "short|long",
    "conditions": ["poisoned"]
  },
  "enemies": {
    "spawn": [ { "id": "goblin_1", "name": "Goblin", "hp": 7, "ac": 13, "attack_bonus": 4, "damage": "1d6+2" } ],
    "update": [ { "id": "goblin_1", "hp_delta": -3 } ],
    "remove": [ "goblin_1" ], "remove_reason": "fled"
  },
  "journal": [
    { "op": "add|update|resolve|reveal|remove", "section": "quests|npcs|places|notes|plot|secrets", "title": "", "text": "", "visibility": "player|dm_only" }
  ],
  "story_so_far": "only when asked: a 3-6 sentence recap of the whole campaign so far",
  "suggested_actions": ["2-4 short ideas the player might try"]
}
Journal entries are matched by title (and section). Sections "plot" and "secrets" are always dm_only.`;
  }

  function journalText() {
    const st = G().state;
    if (!st.journal.length) return "(empty)";
    return st.journal.map((j) =>
      `[${j.section}${j.visibility === "dm_only" ? ", dm_only" : ""}${j.resolved ? ", resolved" : ""}] ${j.title}: ${j.text}`
    ).join("\n");
  }

  function recentLog() {
    const st = G().state;
    const n = MD.CONFIG.memory.recentTurns;
    const tag = { dm: "DM", player: "PLAYER", roll: "ROLL", system: "ENGINE" };
    return st.log.slice(-n * 2).map((l) => `${tag[l.role] || l.role}: ${l.text}`).join("\n") || "(start of campaign)";
  }

  function buildUserMessage(trigger) {
    const st = G().state;
    const wantRecap = st.turn - (st.lastRecapTurn || 0) >= MD.CONFIG.memory.storyRecapEveryTurns;
    return `<story_so_far>${st.storySoFar || "(nothing yet)"}</story_so_far>
<journal>
${journalText()}
</journal>
<state>${JSON.stringify(G().snapshot())}</state>
<recent_log>
${recentLog()}
</recent_log>
${trigger}${wantRecap ? "\n(Include an updated story_so_far this turn.)" : ""}`;
  }

  async function run(trigger, { countsAsTurn = true } = {}) {
    const st = G().state;
    if (countsAsTurn) st.turn += 1;
    const r = await MD.AI.ask(systemPrompt(), [{ role: "user", content: buildUserMessage(trigger) }]);
    if (r.narration) G().log("dm", String(r.narration));
    G().applyDmResponse(r);

    const req = r.request && typeof r.request === "object" ? r.request : null;
    if (req && ["check", "save", "attack"].includes(req.type) && st.character.status === "ok") {
      if (req.type === "attack" && !G().findEnemy(req.target)) {
        st.pending = null;
      } else st.pending = req;
    } else {
      st.pending = null;
      G().runEnemyTurn(r);
    }
    G().save();
    maybeCompact(); // fire and forget
  }

  async function guarded(fn) {
    if (busy) return;
    busy = true; onUpdate();
    try { await fn(); }
    catch (e) { console.error(e); onError(e.message || String(e)); }
    finally { busy = false; onUpdate(); }
  }

  const startCampaign = (premise) => guarded(async () => {
    const st = G().state;
    await run(`<new_campaign>
Start a brand-new campaign for this character${premise ? ` with this premise: "${premise}"` : " with a premise you invent that fits the character"}.
First, privately plan it: add a dm_only "plot" entry titled "Outline" (hook, 3-5 story beats, a main antagonist, an ending) and 1-3 "secrets" entries.
Then narrate an evocative opening scene that sets up the hook. Add the starting place, any NPCs met and the first quest to the journal (player-visible).
Include story_so_far and suggested_actions. Don't start with combat.
</new_campaign>`);
    st.lastRecapTurn = st.turn;
  });

  const playerAction = (text) => guarded(async () => {
    G().log("player", text);
    await run(`<player_action>${text}</player_action>`);
  });

  // Player clicks the roll button for a pending request
  const resolvePending = (mode = "normal") => guarded(async () => {
    const st = G().state;
    const req = st.pending; if (!req) return;
    st.pending = null;
    let resultText;
    if (req.type === "attack") {
      const res = G().playerAttack(req.target, req.mode || mode);
      resultText = res.msgs.join(" ");
    } else {
      resultText = G().resolveCheck(req, mode).text + (req.reason ? ` (for: ${req.reason})` : "");
    }
    await run(`<roll_result>${resultText}</roll_result>`, { countsAsTurn: false });
  });

  // Quick-attack button in combat (skips asking the DM first)
  const quickAttack = (enemyId) => guarded(async () => {
    const st = G().state;
    st.pending = null;
    const e = G().findEnemy(enemyId);
    G().log("player", `I attack ${e ? e.name : "the enemy"} with my ${G().equippedWeapon().name}.`);
    const res = G().playerAttack(enemyId);
    await run(`<roll_result>${res.msgs.join(" ")}</roll_result>`);
  });

  // After a death save resolves, let the DM react
  const afterDeathSave = (msgs) => guarded(async () => {
    const ch = G().state.character;
    if (ch.status === "ok" || ch.status === "dead") {
      await run(`<roll_result>${msgs.join(" ")}</roll_result>`, { countsAsTurn: false });
    }
  });

  // Tell the DM about something the player did through the UI (potion, ability)
  const notify = (msgs) => guarded(async () => {
    if (!msgs.length) return;
    G().log("player", msgs.join(" "));
    await run(`<player_action>(Used from the character sheet) ${msgs.join(" ")}</player_action>`);
  });

  let compacting = false;
  async function maybeCompact() {
    if (compacting || G().journalChars() < MD.CONFIG.memory.journalCompactChars) return;
    compacting = true;
    try {
      const r = await MD.AI.ask(
        "You maintain a D&D campaign journal. Reply with ONLY JSON.",
        [{ role: "user", content: `<compact_journal>
Compress this journal to about half its length. Merge duplicates, shorten resolved quests to one line, drop trivia, keep every important NPC, place, open quest, plot beat and secret.
Keep sections and visibility exactly as tagged. Reply: {"story_so_far": "...", "journal": [{"section":"","title":"","text":"","visibility":"player|dm_only","resolved":false}]}
STORY SO FAR: ${G().state.storySoFar}
JOURNAL:
${journalText()}
</compact_journal>` }]
      );
      G().replaceJournal(r.journal, r.story_so_far);
      G().save(); onUpdate();
    } catch (e) { console.warn("compaction failed", e); }
    finally { compacting = false; }
  }

  return {
    startCampaign, playerAction, resolvePending, quickAttack, afterDeathSave, notify,
    get busy() { return busy; },
    setHandlers(u, e) { onUpdate = u; onError = e; },
    systemPrompt, buildUserMessage,
  };
})();
