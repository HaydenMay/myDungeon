// Dice: parse and roll expressions like "2d6+3", "1d20", "d8-1", "4"
window.MD = window.MD || {};

MD.Dice = (() => {
  const rollDie = (sides) => 1 + Math.floor(Math.random() * sides);

  function parse(expr) {
    const s = String(expr || "0").replace(/\s+/g, "").toLowerCase();
    const terms = s.match(/[+-]?[^+-]+/g) || ["0"];
    return terms.map((t) => {
      const sign = t.startsWith("-") ? -1 : 1;
      const body = t.replace(/^[+-]/, "");
      const m = body.match(/^(\d*)d(\d+)$/);
      if (m) return { sign, count: Math.min(parseInt(m[1] || "1", 10), 50), sides: parseInt(m[2], 10) };
      return { sign, flat: parseInt(body, 10) || 0 };
    });
  }

  // roll("2d6+3") -> { total, rolls:[4,2], text:"2d6+3 → [4,2]+3 = 9" }
  // opts.crit doubles the dice
  function roll(expr, opts = {}) {
    const terms = parse(expr);
    let total = 0;
    const rolls = [];
    const parts = [];
    for (const t of terms) {
      if (t.flat !== undefined) {
        total += t.sign * t.flat;
        if (t.flat) parts.push((t.sign < 0 ? "-" : "+") + t.flat);
      } else {
        const n = opts.crit ? t.count * 2 : t.count;
        const r = Array.from({ length: n }, () => rollDie(t.sides));
        rolls.push(...r);
        total += t.sign * r.reduce((a, b) => a + b, 0);
        parts.push((t.sign < 0 ? "-" : "+") + "[" + r.join(",") + "]");
      }
    }
    const shown = parts.join("").replace(/^\+/, "");
    return { total, rolls, text: `${expr}${opts.crit ? " (crit)" : ""} → ${shown} = ${total}` };
  }

  // d20 with advantage/disadvantage: mode = "normal" | "advantage" | "disadvantage"
  function d20(mode = "normal") {
    const a = rollDie(20);
    if (mode === "normal") return { natural: a, rolls: [a] };
    const b = rollDie(20);
    const natural = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
    return { natural, rolls: [a, b] };
  }

  const average = (expr) =>
    parse(expr).reduce((sum, t) => sum + (t.flat !== undefined ? t.sign * t.flat : t.sign * t.count * (t.sides + 1) / 2), 0);

  const isValid = (expr) => /^\s*\d*d\d+(\s*[+-]\s*\d+)?\s*$|^\s*\d+\s*$/i.test(String(expr || ""));

  return { roll, d20, rollDie, average, isValid };
})();
