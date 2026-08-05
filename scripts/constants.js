export const MODULE_ID = "fbl-roll-dialog-plus";
export const MODULE_VERSION = "0.7.0";
export const SYSTEM_ID = "forbidden-lands";

export const ATTRIBUTES = [
  {
    key: "strength",
    labelKey: "Attribute.Strength",
    fallback: "Strength",
    shortKey: "Attribute.StrengthShort",
    shortFallback: "STR",
    aliases: ["strength", "str", "сила", "сил"]
  },
  {
    key: "agility",
    labelKey: "Attribute.Agility",
    fallback: "Agility",
    shortKey: "Attribute.AgilityShort",
    shortFallback: "AGI",
    aliases: ["agility", "agi", "ловкость", "ловк"]
  },
  {
    key: "wits",
    labelKey: "Attribute.Wits",
    fallback: "Wits",
    shortKey: "Attribute.WitsShort",
    shortFallback: "WITS",
    aliases: ["wits", "wit", "смекалка", "разум", "ум"]
  },
  {
    key: "empathy",
    labelKey: "Attribute.Empathy",
    fallback: "Empathy",
    shortKey: "Attribute.EmpathyShort",
    shortFallback: "EMP",
    aliases: ["empathy", "emp", "эмпатия"]
  }
];

export const ARTIFACT_DICE = ["d8", "d10", "d12"];

export const QUICK_MODIFIERS = [
  {
    groupKey: "Quick.Difficulty",
    groupFallback: "Difficulty",
    key: "difficulty",
    mode: "exclusive",
    initiallyExpanded: true,
    items: [
      { id: "difficulty-trivial", labelKey: "Quick.Trivial", fallback: "Trivial", value: 3, hintKey: "QuickHint.Trivial", hintFallback: "Trivial task" },
      { id: "difficulty-simple", labelKey: "Quick.Simple", fallback: "Simple", value: 2, hintKey: "QuickHint.Simple", hintFallback: "Simple task" },
      { id: "difficulty-easy", labelKey: "Quick.Easy", fallback: "Easy", value: 1, hintKey: "QuickHint.Easy", hintFallback: "Easy task" },
      { id: "difficulty-demanding", labelKey: "Quick.Demanding", fallback: "Demanding", value: -1, hintKey: "QuickHint.Demanding", hintFallback: "Demanding task" },
      { id: "difficulty-hard", labelKey: "Quick.Hard", fallback: "Hard", value: -2, hintKey: "QuickHint.Hard", hintFallback: "Hard task" },
      { id: "difficulty-formidable", labelKey: "Quick.Formidable", fallback: "Formidable", value: -3, hintKey: "QuickHint.Formidable", hintFallback: "Formidable task" }
    ]
  },
  {
    groupKey: "Quick.Range",
    groupFallback: "Range",
    key: "range",
    mode: "exclusive",
    initiallyExpanded: true,
    items: [
      { id: "range-arm-penalty", labelKey: "Quick.ArmsLengthRanged", fallback: "Arm's Length (ranged)", value: -3, display: "−3", hintKey: "QuickHint.ArmsLengthRanged", hintFallback: "Ranged attack at Arm's Length" },
      { id: "range-arm-bonus", labelKey: "Quick.ArmsLengthMelee", fallback: "Arm's Length (melee)", value: 3, display: "+3", hintKey: "QuickHint.ArmsLengthMelee", hintFallback: "Arm's Length melee bonus when applicable" },
      { id: "range-near", labelKey: "Quick.Near", fallback: "Near", value: 0, hintKey: "QuickHint.Near", hintFallback: "Near range" },
      { id: "range-short", labelKey: "Quick.Short", fallback: "Short", value: -1, hintKey: "QuickHint.Short", hintFallback: "Short range" },
      { id: "range-long", labelKey: "Quick.Long", fallback: "Long", value: -2, hintKey: "QuickHint.Long", hintFallback: "Long range" },
      { id: "range-distant", labelKey: "Quick.Distant", fallback: "Distant", value: -3, hintKey: "QuickHint.Distant", hintFallback: "Distant range, usually requires Aim" }
    ]
  },
  {
    groupKey: "Quick.Light",
    groupFallback: "Light",
    key: "light",
    mode: "exclusive",
    initiallyExpanded: false,
    items: [
      { id: "light-bright", labelKey: "Quick.Bright", fallback: "Bright", value: 0, hintKey: "QuickHint.Bright", hintFallback: "Bright light" },
      { id: "light-dim", labelKey: "Quick.Dim", fallback: "Dim", value: -1, hintKey: "QuickHint.Dim", hintFallback: "Dim light" },
      { id: "light-dark", labelKey: "Quick.Darkness", fallback: "Darkness", value: -2, hintKey: "QuickHint.Darkness", hintFallback: "Darkness" }
    ]
  },
  {
    groupKey: "Quick.HelpAndHindrance",
    groupFallback: "Help and hindrance",
    key: "help",
    mode: "counter",
    initiallyExpanded: false,
    min: -5,
    max: 5,
    labelKey: "Quick.HelpCounter",
    labelFallback: "Net help",
    hintKey: "QuickHint.HelpCounter",
    hintFallback: "Positive values are helpers, negative values are hindrances"
  }
];

export const ARMOR_QUICK_MODIFIERS = [
  {
    groupKey: "Quick.ArmorAdjustment",
    groupFallback: "Armor adjustment",
    key: "armor-adjustment",
    mode: "exclusive",
    initiallyExpanded: true,
    items: [
      { id: "armor-plus-1", labelKey: "Common.PlusOne", fallback: "+1", value: 1, display: "+1", hintKey: "QuickHint.AddArmorOne", hintFallback: "Add 1 armor die" },
      { id: "armor-plus-2", labelKey: "Common.PlusTwo", fallback: "+2", value: 2, display: "+2", hintKey: "QuickHint.AddArmorTwo", hintFallback: "Add 2 armor dice" },
      { id: "armor-plus-3", labelKey: "Common.PlusThree", fallback: "+3", value: 3, display: "+3", hintKey: "QuickHint.AddArmorThree", hintFallback: "Add 3 armor dice" },
      { id: "armor-minus-1", labelKey: "Common.MinusOne", fallback: "−1", value: -1, display: "−1", hintKey: "QuickHint.RemoveArmorOne", hintFallback: "Remove 1 armor die" },
      { id: "armor-minus-2", labelKey: "Common.MinusTwo", fallback: "−2", value: -2, display: "−2", hintKey: "QuickHint.RemoveArmorTwo", hintFallback: "Remove 2 armor dice" },
      { id: "armor-minus-3", labelKey: "Common.MinusThree", fallback: "−3", value: -3, display: "−3", hintKey: "QuickHint.RemoveArmorThree", hintFallback: "Remove 3 armor dice" }
    ]
  },
  {
    groupKey: "Quick.Firearms",
    groupFallback: "Firearms",
    key: "firearms",
    mode: "toggle",
    initiallyExpanded: true,
    items: [
      {
        id: "armor-bp-half",
        labelKey: "Quick.ArmorPiercingHalf",
        fallback: "AP ×0.5",
        value: 0,
        display: "×0.5",
        kind: "armor-half",
        factor: 0.5,
        hintKey: "QuickHint.ArmorPiercingHalf",
        hintFallback: "Halve all rolled armor dice using the configured rounding rule"
      }
    ]
  }
];

export const SKILL_LABEL_TO_KEY = {
  "might": "might",
  "мощь": "might",
  "сила-навык": "might",
  "endurance": "endurance",
  "стойкость": "endurance",
  "выносливость": "endurance",
  "melee": "melee",
  "ближний-бой": "melee",
  "рукопашный-бой": "melee",
  "crafting": "crafting",
  "ремесло": "crafting",
  "крафт": "crafting",
  "stealth": "stealth",
  "скрытность": "stealth",
  "sleight-of-hand": "sleight-of-hand",
  "ловкость-рук": "sleight-of-hand",
  "move": "move",
  "движение": "move",
  "проворство": "move",
  "marksmanship": "marksmanship",
  "стрельба": "marksmanship",
  "scouting": "scouting",
  "разведка": "scouting",
  "наблюдательность": "scouting",
  "lore": "lore",
  "знания": "lore",
  "survival": "survival",
  "выживание": "survival",
  "insight": "insight",
  "проницательность": "insight",
  "manipulation": "manipulation",
  "манипуляция": "manipulation",
  "performance": "performance",
  "выступление": "performance",
  "исполнение": "performance",
  "healing": "healing",
  "лечение": "healing",
  "animal-handling": "animal-handling",
  "уход-за-животными": "animal-handling",
  "обращение-с-животными": "animal-handling",
  "armor": "armor",
  "armour": "armor",
  "доспех": "armor",
  "броня": "armor"
};
