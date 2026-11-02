// GREYMARCH: which parts of a player's look differ between two appearance updates (formView.ts writes it when a look change makes a copy be built again).
// The name is left out (a name change is applied in place). Arrays (headparts, tints, options ...) give their lengths; other values the start of each.
export const gmLookDiff = (a: any, b: any): string => {
  const keys = new Set<string>([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out: string[] = [];
  keys.forEach((k) => {
    if (k === "name") return;
    const x = JSON.stringify((a || {})[k]), y = JSON.stringify((b || {})[k]);
    if (x === y) return;
    const av = (a || {})[k], bv = (b || {})[k];
    if (Array.isArray(av) || Array.isArray(bv)) out.push(k + " (" + (Array.isArray(av) ? av.length : "-") + " -> " + (Array.isArray(bv) ? bv.length : "-") + " entries)");
    else out.push(k + " " + String(x).slice(0, 24) + " -> " + String(y).slice(0, 24));
  });
  return out.length ? out.join(", ") : "nothing but the name";
};
