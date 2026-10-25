// GREYMARCH: NPC HOSTING THAT FOLLOWS THE PLAYERS (2026-10-23). An NPC's AI runs only in its host's game (the first game that asked), and there it ignored every
// other player: the other players' characters are NPCs in that game, outside the player's factions, so a bandit or a draugr there only ever fought the host.
// The server hands an NPC to another game only after its host has sent nothing for 2 seconds, and a host's game sends every 130 ms. So when someone walked into
// a dungeon where another player was (or had been, still in the cell), its NPCs stood still for the newcomer ("NPCs standing still when someone enters a dungeon").
// Rules, all in the host's game:
//   * HAND-OFF: an NPC that another player is clearly closer to is let go (its movement stops going out). That player's game sees no movement, asks to host it,
//     and the server gives it to them about 2 to 3 seconds later. The game that let go does not ask for it back for RELEASE_HOLD_MS.
//   * EVERY PLAYER COUNTS: a hostile NPC that is not fighting anyone and detects another player starts combat with that player's character. Its hits come from
//     its host's game, so the server takes them as it does for the host's own player.
//   * FLOATING NPCs (2026-10-24): an NPC whose body the host's game has not loaded (its player walked on, 2+ cells away) is let go too. There the game moves
//     it with no ground under it, and every other game played that place: deer, bandits and draugr walking in the air or half in the ground. A game that has
//     it loaded asks for it and runs it on real ground; if no game has it loaded, nobody sees it.
// BODIES (2026-10-24), in every game: a body vanished when the movement of a game that still had the NPC alive (its host, a moment behind) arrived after the
// death. SkyMP took that as a resurrection, which it does by rebuilding the NPC, and it never builds a dead one: the body was gone for good. Now the server's
// death wins over any movement, and a dead NPC (not a player) IS built, then made dead, so a body also shows for a player who comes later.
export const RELEASE_MIN_DIST = 1500; // the host's player must be at least this far from the NPC before it is handed on (about 21 m)
export const RELEASE_MARGIN = 600; // and another player this much closer than the host's player
export const RELEASE_HOLD_MS = 8000; // a game that let an NPC go does not ask for it again for this long
export const ENGAGE_MAX_DIST = 3000; // another player farther than this from the NPC is never made its target
export const CHECK_EVERY_MS = 1000;
export const UNLOADED_RELEASE_MS = 2000; // a hosted NPC whose body this game has not loaded for this long is let go (FLOATING NPCs above)
export const BODY_KILL_EVERY_MS = 1000; // a dead NPC's body shown here is made dead at most this often (BODIES above)

// hand the NPC on? dMe: the host's own player to the NPC; others: the other players (same cell, loaded, alive) to the NPC
export function shouldRelease(dMe: number, others: number[]): boolean {
  if (!(dMe > RELEASE_MIN_DIST)) return false;
  let nearest = Infinity;
  for (const d of others) if (Number.isFinite(d) && d < nearest) nearest = d;
  return nearest + RELEASE_MARGIN < dMe;
}

// the other player a hostile, idle NPC should go for: the nearest one it detects, within ENGAGE_MAX_DIST; -1 for none
export function pickTarget(candidates: { d: number, detected: boolean }[]): number {
  let best = -1;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.detected || !(c.d <= ENGAGE_MAX_DIST)) continue;
    if (best < 0 || c.d < candidates[best].d) best = i;
  }
  return best;
}

// let go a hosted NPC this game has not had loaded since unloadedSince (0: it is loaded)?
export function shouldReleaseUnloaded(unloadedSince: number, now: number): boolean {
  return unloadedSince > 0 && now - unloadedSince >= UNLOADED_RELEASE_MS;
}

// the death to play from a movement: the server's death wins over a movement that still has the NPC alive
export function movementDead(serverDead: unknown, moveDead: boolean): boolean {
  return serverDead === true || moveDead;
}

// build this form though it is dead? SkyMP never built a dead one; a dead NPC is built (its body), a dead player is not (their own game brings them back)
export function buildWhileDead(isPlayerLook: boolean): boolean {
  return !isPlayerLook;
}

const releasedUntil = new Map<number, number>(); // remote id -> until when this game does not ask to host it
export function markReleased(remoteId: number, now: number): void { releasedUntil.set(remoteId >>> 0, now + RELEASE_HOLD_MS); }
export function isReleased(remoteId: number, now: number): boolean {
  const until = releasedUntil.get(remoteId >>> 0);
  if (until === undefined) return false;
  if (now >= until) { releasedUntil.delete(remoteId >>> 0); return false; }
  return true;
}
// the hosted list without this NPC (SkyMP keeps an NPC made from a game record as id + 0x100000000)
export function withoutHosted(hosted: unknown, remoteId: number): number[] {
  const list = Array.isArray(hosted) ? hosted as number[] : [];
  return list.filter((x) => x !== remoteId && x !== remoteId + 0x100000000);
}
