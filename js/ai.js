// =====================================================================
// AI providers. Each takes (system, messages) and returns raw text.
// Keys are stored only in this browser's localStorage and sent straight
// to the provider — there's no server in between.
// =====================================================================
window.MD = window.MD || {};

MD.Settings = (() => {
  const KEY = "myDungeon.settings.v1";
  const defaults = () => {
    const c = MD.CONFIG;
    return {
      provider: c.ai.provider,
      openaiKey: "", openaiModel: c.ai.openai.model, openaiBaseUrl: c.ai.openai.baseUrl,
      anthropicKey: "", anthropicModel: c.ai.anthropic.model,
      tone: c.narrator.tone, length: c.narrator.length, difficulty: c.narrator.difficulty,
      showDmJournal: false,
    };
  };
  let s = null;
  function get() {
    if (!s) { try { s = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { s = defaults(); } }
    return s;
  }
  function set(patch) { s = { ...get(), ...patch }; localStorage.setItem(KEY, JSON.stringify(s)); return s; }
  const hasKey = () => { const v = get(); return v.provider === "mock" || (v.provider === "openai" ? !!v.openaiKey : !!v.anthropicKey); };
  return { get, set, hasKey };
})();

MD.AI = (() => {
  async function callOpenAI(system, messages, s) {
    const res = await fetch(s.openaiBaseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + s.openaiKey },
      body: JSON.stringify({
        model: s.openaiModel,
        messages: [{ role: "system", content: system }, ...messages],
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
    return data.choices?.[0]?.message?.content || "";
  }

  async function callAnthropic(system, messages, s) {
    const res = await fetch(MD.CONFIG.ai.anthropic.baseUrl + "/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": s.anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: s.anthropicModel,
        max_tokens: MD.CONFIG.ai.anthropic.maxTokens,
        system,
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `Anthropic error ${res.status}`);
    return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  // Pull the first JSON object out of a reply, tolerating ```json fences or chatter
  function parseJson(text) {
    const t = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(t); } catch {}
    const start = t.indexOf("{"), end = t.lastIndexOf("}");
    if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch {} }
    return null;
  }

  async function ask(system, messages) {
    const s = MD.Settings.get();
    const call = s.provider === "anthropic" ? callAnthropic : s.provider === "mock" ? MD.MockAI.call : callOpenAI;
    let msgs = messages;
    for (let attempt = 0; attempt <= MD.CONFIG.ai.jsonRetries; attempt++) {
      const raw = await call(system, msgs, s);
      const parsed = parseJson(raw);
      if (parsed) return parsed;
      msgs = [...messages, { role: "assistant", content: raw }, { role: "user", content: "That was not valid JSON. Reply again with ONLY the JSON object, no other text." }];
    }
    throw new Error("The DM's reply couldn't be understood (bad JSON). Try again.");
  }

  return { ask, parseJson };
})();

// ---------------------------------------------------------------------
// Offline test DM — no API key needed. Dumb, but exercises every system.
// ---------------------------------------------------------------------
MD.MockAI = (() => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  async function call(system, messages) {
    await new Promise((r) => setTimeout(r, 250));
    const last = messages[messages.length - 1]?.content || "";
    const snap = (() => { try { return JSON.parse(last.match(/<state>([\s\S]*?)<\/state>/)?.[1] || "{}"); } catch { return {}; } })();
    const enemies = snap.enemies || [];
    const action = (last.match(/<player_action>([\s\S]*?)<\/player_action>/)?.[1] || "").toLowerCase();
    const r = { narration: "", changes: {}, enemies: {}, journal: [], suggested_actions: [] };

    if (last.includes("<compact_journal>")) {
      return JSON.stringify({ story_so_far: "(mock) The hero has had adventures.", journal: [{ section: "quests", title: "Find the lost lantern", text: "Still searching.", visibility: "player" }] });
    }
    if (last.includes("<new_campaign>")) {
      r.narration = "Rain hammers the shingles of the Crooked Lantern inn. The barkeep, a one-eyed woman named Mira, slides you a mug and a rumor: something has been taking sheep from the hills — and last night, a shepherd.";
      r.journal = [
        { op: "add", section: "plot", title: "Outline", text: "Hook: missing shepherd. Beat 1: hills. Beat 2: cave of the wolf-cult. Twist: Mira's brother leads the cult. Finale: moonrise ritual.", visibility: "dm_only" },
        { op: "add", section: "secrets", title: "Mira's brother", text: "Mira's brother Tobin leads the cult.", visibility: "dm_only" },
        { op: "add", section: "npcs", title: "Mira", text: "One-eyed barkeep of the Crooked Lantern. Friendly, worried.", visibility: "player" },
        { op: "add", section: "places", title: "The Crooked Lantern", text: "Inn in the village of Hollowmere.", visibility: "player" },
        { op: "add", section: "quests", title: "The Missing Shepherd", text: "Find out what took the shepherd in the hills.", visibility: "player" },
      ];
      r.story_so_far = "The hero arrived at the Crooked Lantern and heard of a missing shepherd.";
      r.suggested_actions = ["Ask Mira for details", "Head for the hills", "Search the inn for clues"];
      return JSON.stringify(r);
    }
    if (last.includes("<roll_result>")) {
      const ok = /SUCCESS|hit!|HIT/.test(last);
      r.narration = ok ? "Your effort pays off — the moment turns in your favor." : "It doesn't go your way, and the world pushes back.";
      if (ok && !enemies.length) { r.changes.xp = 50; r.changes.gold = 7; }
      if (enemies.length) r.enemy_attacks = enemies.map((e) => ({ enemy_id: e.id }));
      if (last.includes("defeated") && !enemies.length) { r.changes.xp = 100; r.changes.add_items = [{ name: "Wolf Pelt", type: "misc", qty: 1 }]; }
      r.suggested_actions = enemies.length ? ["Attack again", "Defend", "Flee"] : ["Press on", "Look around"];
      return JSON.stringify(r);
    }
    if (/search|look|inspect|investigate/.test(action)) {
      r.narration = "You crouch and study your surroundings carefully...";
      r.request = { type: "check", skill: "Perception", dc: 12, reason: "spot hidden tracks" };
      return JSON.stringify(r);
    }
    if (/hill|explore|fight|go|head/.test(action) && !enemies.length) {
      r.narration = "A snarl from the bracken — two gaunt wolves with cult-brand scars circle you!";
      r.enemies.spawn = [
        { id: "wolf_1", name: "Scarred Wolf", hp: 11, ac: 13, attack_bonus: 4, damage: "2d4+2" },
        { id: "wolf_2", name: "Scarred Wolf", hp: 11, ac: 13, attack_bonus: 4, damage: "2d4+2" },
      ];
      r.journal = [{ op: "add", section: "places", title: "Hollowmere Hills", text: "Wolves with cult brands roam here.", visibility: "player" }];
      r.suggested_actions = ["Attack the nearest wolf", "Climb a rock", "Throw a ration as a distraction"];
      return JSON.stringify(r);
    }
    if (/attack|strike|hit|shoot/.test(action) && enemies.length) {
      r.narration = "You lunge into the fray!";
      r.request = { type: "attack", target: enemies[0].id };
      return JSON.stringify(r);
    }
    if (/rest|sleep/.test(action) && !enemies.length) {
      r.narration = "You bed down by a low fire. The night passes quietly.";
      r.changes.rest = "long";
      return JSON.stringify(r);
    }
    if (/mira|talk|ask/.test(action)) {
      r.narration = "Mira lowers her voice. \"There's a cave past the second ridge. Don't go at moonrise.\" She glances away a little too fast.";
      r.journal = [{ op: "update", title: "Mira", section: "npcs", text: "One-eyed barkeep. Told you about a cave past the second ridge. Seemed nervous." }];
      r.changes.add_items = [{ name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 1 }];
      r.suggested_actions = ["Ask why she's nervous", "Head for the hills"];
      return JSON.stringify(r);
    }
    r.narration = pick(["The wind shifts. Somewhere far off, a wolf howls.", "Nothing much happens, but you feel watched.", "You do it. The world takes note."]);
    if (enemies.length) r.enemy_attacks = enemies.map((e) => ({ enemy_id: e.id }));
    r.suggested_actions = ["Look around", "Head for the hills"];
    return JSON.stringify(r);
  }
  return { call };
})();
