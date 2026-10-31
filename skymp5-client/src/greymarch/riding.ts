// GREYMARCH: RIDING (2026-10-31, the owner: players buy and ride horses). SkyMP sends no "on a horse" state: a rider showed up on the other games standing
// upright, sliding along at the horse's speed, with no horse under them. This is the riding test (stables and owned horses come after it):
//   * THE RIDER'S GAME (bridge.ts greymarchRideTick) tells the server which horse its player sits on, by the horse's server id, when that changes and every
//     RIDE_REPORT_EVERY_MS while riding; 0 when they got off (greymarchRide). It runs the horse itself (formView.ts: no server movement is played on the horse
//     it rides, and it asks to host it).
//   * THE SERVER (gamemode riding.js) checks the horse (an NPC, near the rider, alive, nobody else on it) and sets the rider's custom property greymarchRiding
//     to the horse's server id (0: on foot), which every game that has the rider loaded gets.
//   * EVERY OTHER GAME (formView.ts gmRideStep): a rider's character is put on that horse (the horse is activated by it, the way an NPC mounts), at most every
//     SEAT_TRY_EVERY_MS until it sits; while it sits, its own movement is not played (the horse carries it); off the horse it gets down (Dismount). A game that
//     hosts a horse someone else rides lets it go, so the rider's game becomes its host.
// Breadcrumbs: "ride", "seat", "unseat", "horse let go".
export const RIDE_REPORT_EVERY_MS = 5000;
export const RIDE_CHECK_EVERY_MS = 250;
export const SEAT_TRY_EVERY_MS = 3000;
export const HORSE_RACE = 0x131fd;
export const RIDE_FLING_UP = 1000; // units a second upward no horse makes (a jump is about 400)
export const RIDE_FLING_SIDE = 3600; // units a second sideways no horse makes (a sprint is about 1100) // HorseRace (Skyrim.esm): only a horse is ever mounted on another player's word

export interface RideReportState { sent: number; at: number }

// what the rider's game reports now: the horse's server id (0: got off), or null for nothing. mounted: the horse it sits on (0: on foot, or a horse the
// server does not know)
export function rideReport(st: RideReportState, now: number, mounted: number): number | null {
  const changed = mounted !== st.sent;
  if (!changed && !(mounted && now - st.at >= RIDE_REPORT_EVERY_MS)) return null;
  st.sent = mounted;
  st.at = now;
  return mounted;
}

// the riding property of a model: the horse's server id, 0 on foot
export function ridingOf(model: any): number {
  const v = model ? Number(model.greymarchRiding) : 0;
  return Number.isFinite(v) && v > 0 ? v >>> 0 : 0;
}

// which horse each other player rides (horse server id -> rider server id), kept on the global so every FormView and the bridge see the same map
export function ridersMap(): Record<number, number> {
  const g: any = Function("return this")();
  return g.__gmRiders || (g.__gmRiders = {});
}

// a rider's model was updated: the map follows it (a rider is on at most one horse)
export function noteRider(map: Record<number, number>, riderId: number, horseId: number): void {
  for (const k of Object.keys(map)) if (map[Number(k)] === riderId && Number(k) !== horseId) delete map[Number(k)];
  if (horseId) map[horseId] = riderId;
}

// is this horse ridden by another player (so the game that hosts it lets it go)?
export function riddenByOther(map: Record<number, number>, horseId: number): boolean {
  return !!horseId && !!map[horseId];
}

// the other player's character, seen here: what to do with it now. riding: the horse the server says (0: none); seated: it sits on a horse here;
// horseReady: that horse is loaded here and is a horse; lastTry: when it was last put on
export type SeatStep = "seat" | "unseat" | "wait" | "none";
export function seatStep(riding: number, seated: boolean, horseReady: boolean, lastTry: number, now: number): SeatStep {
  if (!riding) return seated ? "unseat" : "none";
  if (seated) return "none";
  if (!horseReady) return "wait";
  return now - lastTry >= SEAT_TRY_EVERY_MS ? "seat" : "wait";
}
