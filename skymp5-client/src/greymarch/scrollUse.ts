// SCROLLS READ (2026-11-12, the owner: "Scrolls are still respawning in players inventory", "right away"). The live log: a Firebolt scroll read, its hit
// reported, yet no cast ever reached the server: the game sends no spell cast event for a scroll, so the server never took the read scroll out and the
// game's inventory was put back to the server's 5 s later (remoteServer pcInv). A read is now seen by the count: a scroll held in a hand whose count drops
// by exactly one, with no menu open and no change from the server, was read. magicSyncService then sends the cast the game did not (the server program
// takes the scroll out as that cast comes in: ActionListener::OnSpellCast).

// one look at a scroll: how many the game holds, the hand it is in (-1 none, 0 left, 1 right), how many the server's last inventory has
export interface ScrollSeen { count: number; hand: number; server: number }

// the scrolls read between two looks: held in a hand at the first, one fewer at the second, the server's count unchanged
export function scrollReads(prev: { [id: string]: ScrollSeen }, now: { [id: string]: ScrollSeen }, menuOpen: boolean): Array<{ id: number, hand: number }> {
  if (menuOpen) return [];
  const out: Array<{ id: number, hand: number }> = [];
  for (const key of Object.keys(prev)) {
    const p = prev[key], n = now[key];
    if (!p || p.hand < 0 || !n) continue;
    if (n.server !== p.server) continue; // the server changed it (a trade, staff, a take): not a read
    if (p.count - n.count !== 1) continue;
    out.push({ id: Number(key) >>> 0, hand: p.hand });
  }
  return out;
}

// the server's count of one item in the last inventory it sent (storage pcInv)
export function serverCount(pcInv: any, id: number): number {
  const entries = pcInv && Array.isArray(pcInv.entries) ? pcInv.entries : [];
  let n = 0;
  for (const e of entries) if (e && (e.baseId >>> 0) === (id >>> 0) && typeof e.count === "number") n += e.count;
  return n;
}
