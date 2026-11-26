// =====================================================================
// myDungeon — tunables
// Everything you might want to tweak lives here. Settings the player can
// change in-game (API key, model, narrator style) are saved to
// localStorage and override the defaults below.
// =====================================================================
window.MD = window.MD || {};

MD.CONFIG = {
  // ---- AI provider defaults (overridable in Settings) ----------------
  ai: {
    provider: "openai",            // "openai" | "anthropic" | "mock"
    openai: {
      baseUrl: "https://api.openai.com/v1", // any OpenAI-compatible endpoint works
      model: "gpt-5-mini",
    },
    anthropic: {
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-5-5",
      maxTokens: 2500,
    },
    jsonRetries: 1,                 // re-ask once if the DM returns broken JSON
  },

  // ---- Narrator style (presets the player can pick in Settings) -------
  narrator: {
    tone: "classic",               // key into tones below
    length: "medium",              // key into lengths below
    difficulty: "normal",          // key into difficulties below
    tones: {
      classic: "Classic high fantasy. Earnest, adventurous, a touch of wonder.",
      grim: "Grimdark. Gritty, dangerous, morally grey, consequences stick.",
      silly: "Lighthearted and comedic. Absurd NPCs, puns welcome, still a real story.",
      horror: "Gothic horror. Dread, atmosphere, slow-burn mysteries.",
      pulp: "Pulpy swashbuckling action. Big set pieces, daring escapes, cliffhangers.",
    },
    lengths: {
      short: "Keep narration to 1 short paragraph (40-80 words).",
      medium: "Keep narration to 1-2 paragraphs (80-160 words).",
      long: "Narration can run 2-3 rich paragraphs (150-260 words).",
    },
    difficulties: {
      easy: "Forgiving. DCs mostly 8-12. Enemies are few and weak.",
      normal: "Standard 5e feel. DCs 10-15. Fair but real danger.",
      hard: "Punishing. DCs 13-18. Enemies hit hard and fight smart.",
    },
  },

  // ---- Memory / context sizes -----------------------------------------
  memory: {
    recentTurns: 12,               // DM sees the last (this × 2) log lines verbatim
    journalCompactChars: 6000,     // compress the journal when it grows past this
    storyRecapEveryTurns: 6,       // DM rewrites "story so far" this often
  },

  // ---- Guardrails: the AI proposes, these limits decide ---------------
  guards: {
    maxGoldPerTurnPerLevel: 60,    // gold gain cap = this * level
    maxXpPerTurnPerLevel: 150,     // xp gain cap = this * level
    maxAiDamagePerTurnPerLevel: 8, // non-combat damage (traps etc.) cap = this * level
    maxAiHealPerTurnPerLevel: 12,
    maxItemsPerTurn: 3,
    maxEnemiesPerSpawn: 4,
    maxEnemyHpPerLevel: 18,        // spawned enemy hp cap = this * party level
    maxEnemyAttackBonus: 9,
    // highest magic bonus allowed on loot: index = level - 1
    maxMagicBonusByLevel: [0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3],
  },

  // ---- Rules knobs -----------------------------------------------------
  rules: {
    maxLevel: 12,
    startingGoldBonus: 0,          // added on top of class starting gold
    deathSavesToStabilize: 3,
    deathSavesToDie: 3,
    shortRestHealDice: 1,          // hit dice spent on a short rest
    critRange: 20,                 // 19 = crit on 19-20
  },

  // ---- Theme: applied to CSS variables at load -------------------------
  theme: {
    "--bg": "#14110f",
    "--panel": "#1e1a17",
    "--panel-2": "#28221e",
    "--border": "#3a312a",
    "--text": "#e9e1d6",
    "--muted": "#a39584",
    "--accent": "#d4a24c",
    "--accent-2": "#8c5a2b",
    "--good": "#6fbf73",
    "--bad": "#d9534f",
    "--info": "#5fa8d3",
    "--dm-text": "#efe6d8",
    "--player-text": "#9fc9e8",
    "--roll-text": "#d4a24c",
    "--font-body": "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
    "--font-ui": "system-ui, -apple-system, 'Segoe UI', sans-serif",
    "--radius": "10px",
  },
};
