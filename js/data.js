// =====================================================================
// Rules data (based on the D&D 5e SRD, simplified). Add races/classes
// or tweak numbers here — the rest of the game reads from this file.
// =====================================================================
window.MD = window.MD || {};

MD.DATA = {
  abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],

  skills: {
    Acrobatics: "DEX", "Animal Handling": "WIS", Arcana: "INT", Athletics: "STR",
    Deception: "CHA", History: "INT", Insight: "WIS", Intimidation: "CHA",
    Investigation: "INT", Medicine: "WIS", Nature: "INT", Perception: "WIS",
    Performance: "CHA", Persuasion: "CHA", Religion: "INT", "Sleight of Hand": "DEX",
    Stealth: "DEX", Survival: "WIS",
  },

  // XP needed to reach each level (index = level - 1)
  xpTable: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000],

  races: {
    Human:    { bonus: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, speed: 30, trait: "Versatile and ambitious." },
    Elf:      { bonus: { DEX: 2, INT: 1 }, speed: 30, trait: "Darkvision, keen senses, resistant to charm." },
    Dwarf:    { bonus: { CON: 2, WIS: 1 }, speed: 25, trait: "Darkvision, poison resilience, stonecunning." },
    Halfling: { bonus: { DEX: 2, CHA: 1 }, speed: 25, trait: "Lucky, brave, nimble." },
    Orc:      { bonus: { STR: 2, CON: 1 }, speed: 30, trait: "Darkvision, relentless, menacing." },
    Tiefling: { bonus: { CHA: 2, INT: 1 }, speed: 30, trait: "Darkvision, fire resistance, infernal heritage." },
  },

  classes: {
    Fighter: {
      hitDie: 10, primary: ["STR", "CON"],
      array: { STR: 15, CON: 14, DEX: 13, WIS: 12, CHA: 10, INT: 8 },
      saves: ["STR", "CON"],
      skills: ["Athletics", "Perception", "Intimidation"],
      gold: 15,
      gear: [
        { name: "Longsword", type: "weapon", damage: "1d8", ability: "STR", equipped: true },
        { name: "Chain Mail", type: "armor", ac: 16, maxDex: 0, equipped: true },
        { name: "Shield", type: "shield", ac: 2, equipped: true },
        { name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 2 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Second Wind: once per short rest, heal 1d10 + level.",
    },
    Rogue: {
      hitDie: 8, primary: ["DEX"],
      array: { DEX: 15, CON: 14, INT: 13, CHA: 12, WIS: 10, STR: 8 },
      saves: ["DEX", "INT"],
      skills: ["Stealth", "Sleight of Hand", "Perception", "Deception"],
      gold: 20,
      gear: [
        { name: "Shortsword", type: "weapon", damage: "1d6", ability: "DEX", equipped: true },
        { name: "Leather Armor", type: "armor", ac: 11, maxDex: 99, equipped: true },
        { name: "Thieves' Tools", type: "misc", qty: 1 },
        { name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 1 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Sneak Attack: +1d6 damage per 2 levels when you have advantage or an ally nearby.",
    },
    Wizard: {
      hitDie: 6, primary: ["INT"],
      array: { INT: 15, CON: 14, DEX: 13, WIS: 12, CHA: 10, STR: 8 },
      saves: ["INT", "WIS"],
      skills: ["Arcana", "History", "Investigation"],
      gold: 10,
      gear: [
        { name: "Fire Bolt (cantrip)", type: "weapon", damage: "1d10", ability: "INT", equipped: true },
        { name: "Quarterstaff", type: "weapon", damage: "1d6", ability: "STR" },
        { name: "Spellbook", type: "misc", qty: 1 },
        { name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 1 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Spellcasting: narrate spells freely; the DM decides effects. Fire Bolt is your go-to attack.",
    },
    Cleric: {
      hitDie: 8, primary: ["WIS"],
      array: { WIS: 15, CON: 14, STR: 13, CHA: 12, INT: 10, DEX: 8 },
      saves: ["WIS", "CHA"],
      skills: ["Religion", "Medicine", "Insight"],
      gold: 15,
      gear: [
        { name: "Mace", type: "weapon", damage: "1d6", ability: "STR", equipped: true },
        { name: "Scale Mail", type: "armor", ac: 14, maxDex: 2, equipped: true },
        { name: "Shield", type: "shield", ac: 2, equipped: true },
        { name: "Holy Symbol", type: "misc", qty: 1 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Healing Word: 3 uses per long rest, heal 1d4 + WIS mod.",
      heals: { name: "Healing Word", dice: "1d4", ability: "WIS", usesPerLongRest: 3 },
    },
    Ranger: {
      hitDie: 10, primary: ["DEX", "WIS"],
      array: { DEX: 15, WIS: 14, CON: 13, STR: 12, INT: 10, CHA: 8 },
      saves: ["STR", "DEX"],
      skills: ["Survival", "Perception", "Stealth", "Nature"],
      gold: 15,
      gear: [
        { name: "Longbow", type: "weapon", damage: "1d8", ability: "DEX", equipped: true },
        { name: "Shortsword", type: "weapon", damage: "1d6", ability: "DEX" },
        { name: "Leather Armor", type: "armor", ac: 11, maxDex: 99, equipped: true },
        { name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 1 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Favored Enemy & Natural Explorer: advantage tracking beasts and navigating wilds.",
    },
    Bard: {
      hitDie: 8, primary: ["CHA"],
      array: { CHA: 15, DEX: 14, CON: 13, WIS: 12, INT: 10, STR: 8 },
      saves: ["DEX", "CHA"],
      skills: ["Performance", "Persuasion", "Deception", "Insight"],
      gold: 20,
      gear: [
        { name: "Rapier", type: "weapon", damage: "1d8", ability: "DEX", equipped: true },
        { name: "Leather Armor", type: "armor", ac: 11, maxDex: 99, equipped: true },
        { name: "Lute", type: "misc", qty: 1 },
        { name: "Potion of Healing", type: "consumable", heal: "2d4+2", qty: 1 },
        { name: "Rations", type: "misc", qty: 5 },
      ],
      feature: "Bardic Inspiration: talk your way through anything; the DM rewards style.",
      heals: { name: "Healing Word", dice: "1d4", ability: "CHA", usesPerLongRest: 2 },
    },
  },

  // Premise ideas shown on the new-game screen
  premises: [
    "A village where every child vanished on the same moonless night.",
    "A heist on a floating casino owned by a dragon in human form.",
    "Escort a mute oracle across a war-torn kingdom.",
    "The local lord hired you to clear goblins from a mine. The goblins say he's lying.",
    "Wake up in a shipwreck with no memory and a stranger's signet ring.",
  ],
};
