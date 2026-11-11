// GREYMARCH: HEAD TRACKING SYNC (2026-11-10, the owner: "We need to sync head tracking from TDM"). True Directional Movement turns the player's head towards
// where their camera looks, but only in their own game: SkyMP's movement carries a "lookAt" point (sync/movement.ts), filled only for an NPC's combat target,
// and the games that draw the player only turned a head towards an ACTOR standing at that point (findClosestActor, 128 units).
//   Sent: the player's own movement carries a point LOOK_DIST ahead of their head along the camera's direction (GreymarchCamera.dll GetCamera 3..5, the
//   direction the camera looks in, in the world; the same reading magicSyncService.getPlayerLook uses). Nothing when the DLL cannot read the camera.
//   Drawn: another game's copy of them, when no actor stands at that point, looks at an invisible marker (an XMarker placed for that copy) moved to it.
//   The marker moves only when the point moved more than MOVE_MIN, at most every MOVE_GAP_MS; the head is pointed at it again every RELOOK_MS. One marker
//   a copy, at most MAX_MARKERS (the oldest is deleted), placed again when the copy is in another world or cell than its marker.
// The server only passes the point on (UpdateMovementMessage lookAt); nothing about it is trusted there.

export const LOOK_DIST = 1000; // units ahead of the head (about 14 m)
export const HEAD_UP = 120; // the head above the feet
export const MOVE_MIN = 40;
export const MOVE_GAP_MS = 200;
export const RELOOK_MS = 1000;
export const MAX_MARKERS = 48;
export const XMARKER = 0x3b;

type P3 = [number, number, number];

let cameraWorks: boolean | null = null;
let cameraRetryAt = 0; // a failed camera read is tried again after CAMERA_RETRY_MS (it once stayed off for the whole session)
export const CAMERA_RETRY_MS = 10000;
// DIAGNOSTICS (2026-11-10, the owner: "Head tracking still not synced"): a few lines to the server log from each end (greymarchStage), so a test shows which
// end loses it: what this game sends, what it does with another player's point, and whether that copy's AI runs (the engine turns no head without it)
let say: (text: string) => void = () => {};
export function setSay(fn: (text: string) => void): void { say = fn; }
let sentSaid = 0, failSaid = 0, drawSaid = 0, sentSaidAt = 0;

// the point the player looks at, or undefined when the camera cannot be read
export function ownLookAt(sp: any, player: any, now: number = Date.now()): P3 | undefined {
  if (cameraWorks === false && now < cameraRetryAt) return undefined;
  try {
    const x = Number(sp.callNative("GreymarchCam", "GetCamera", undefined, 3));
    const y = Number(sp.callNative("GreymarchCam", "GetCamera", undefined, 4));
    const z = Number(sp.callNative("GreymarchCam", "GetCamera", undefined, 5));
    const len = Math.sqrt(x * x + y * y + z * z);
    if (!isFinite(len) || len < 0.5) { if (failSaid < 3) { failSaid++; say("head: the camera reads no direction (" + x + "," + y + "," + z + "): no look point sent"); } return undefined; }
    cameraWorks = true;
    const px = player.getPositionX(), py = player.getPositionY(), pz = player.getPositionZ() + HEAD_UP;
    const out: P3 = [px + (x / len) * LOOK_DIST, py + (y / len) * LOOK_DIST, pz + (z / len) * LOOK_DIST];
    if (sentSaid < 2 && now >= (sentSaidAt || 0)) { sentSaid++; sentSaidAt = now + 60000; say("head: sending my look point " + out.map(Math.round).join(",") + " (camera " + [x, y, z].map((v) => Math.round(v * 100) / 100).join(",") + ")"); }
    return out;
  } catch (e) {
    cameraWorks = false;
    cameraRetryAt = now + CAMERA_RETRY_MS;
    if (failSaid < 3) { failSaid++; say("head: the camera could not be read (" + e + "); tried again in 10 s"); }
    return undefined;
  }
}

interface Mark { ref: any; place: number; at: P3; movedAt: number; lookedAt: number; used: number }
const marks: Map<number, Mark> = new Map();

const placeOf = (r: any): number => { try { const w = r.getWorldSpace() || r.getParentCell(); return w ? w.getFormID() : 0; } catch (e) { return 0; } };

function drop(id: number, m: Mark): void {
  marks.delete(id);
  try { m.ref.disable(false); m.ref.delete(); } catch (e) { /* gone already */ }
}

// NO STRAIGHT UP OR DOWN, NO OWL HEAD (2026-11-10, the owner: "make sure the looking straight up or down bug doesn't happen"): the point is never used as
// sent. From the copy's own head (its head node; a body without one: its feet plus HEAD_UP) it becomes a direction, clamped to MAX_UP degrees up and
// MAX_DOWN down (a head pointed at a spot high above or right below bent all the way back, or into the chest), MAX_SIDE to either side of the body, and a
// look behind them (over BEHIND) is no look: the head faces forward, as TDM does. Then it is put SHOW_DIST out again, so a point close to the head (their
// own feet) cannot flip it. -> the point to look at, or null for none. bodyDeg: the copy's Z angle (0 = north, clockwise).
export const MAX_UP = 30, MAX_DOWN = 35, MAX_SIDE = 70, BEHIND = 110, SHOW_DIST = 1000;
const fin = (n: number) => typeof n === "number" && isFinite(n);
export function clampLook(head: P3 | null, pt: P3, bodyDeg: number): P3 | null {
  if (!head || !Array.isArray(pt) || !pt.every(fin) || !fin(bodyDeg)) return null;
  const dx = pt[0] - head[0], dy = pt[1] - head[1], dz = pt[2] - head[2];
  const flat = Math.sqrt(dx * dx + dy * dy);
  if (!(flat + Math.abs(dz) > 1)) return null;
  let rel = ((Math.atan2(dx, dy) * 180 / Math.PI - bodyDeg) % 360 + 540) % 360 - 180;
  if (Math.abs(rel) > BEHIND) return null;
  rel = Math.max(-MAX_SIDE, Math.min(MAX_SIDE, rel));
  const pitch = Math.max(-MAX_DOWN, Math.min(MAX_UP, Math.atan2(dz, flat) * 180 / Math.PI));
  const yaw = (bodyDeg + rel) * Math.PI / 180, pr = pitch * Math.PI / 180;
  return [head[0] + Math.sin(yaw) * Math.cos(pr) * SHOW_DIST, head[1] + Math.cos(yaw) * Math.cos(pr) * SHOW_DIST, head[2] + Math.sin(pr) * SHOW_DIST];
}
const HEAD_NODE = "NPC Head [Head]";
function headOf(sp: any, ac: any): P3 | null {
  try {
    const n = sp.NetImmerse;
    const h: P3 = [Number(n.getNodeWorldPositionX(ac, HEAD_NODE, false)), Number(n.getNodeWorldPositionY(ac, HEAD_NODE, false)), Number(n.getNodeWorldPositionZ(ac, HEAD_NODE, false))];
    if (h.every(fin) && !(h[0] === 0 && h[1] === 0 && h[2] === 0)) return h;
  } catch (e) { /* no node: below */ }
  try { const f: P3 = [Number(ac.getPositionX()), Number(ac.getPositionY()), Number(ac.getPositionZ()) + HEAD_UP]; return f.every(fin) ? f : null; } catch (e) { return null; }
}
const offIds = new Set<number>(); // copies whose head was turned off because the look went behind them

// another game's copy `ac` looks at the point `p` (no actor stands there). Returns true when its head was pointed at the marker this call.
export function lookAtPoint(sp: any, ac: any, sent: P3, now: number): boolean {
  const id = ac.getFormID() >>> 0;
  let m = marks.get(id);
  // NO STRAIGHT UP OR DOWN (clampLook): the sent point, seen from this copy's own head, clamped; looking behind them: the head faces forward
  const p = clampLook(headOf(sp, ac), sent, Number(ac.getAngleZ()));
  if (!p) {
    if (!offIds.has(id)) { offIds.add(id); try { ac.clearLookAt(); } catch (e) { /* gone */ } try { ac.setHeadTracking(false); } catch (e) { /* gone */ } }
    if (m) m.lookedAt = 0; // pointed again at once when the look comes back in front
    return false;
  }
  if (offIds.delete(id) && m) m.lookedAt = 0;
  const place = placeOf(ac);
  if (m && (m.place !== place || !place)) { drop(id, m); m = undefined; }
  if (!m) {
    if (marks.size >= MAX_MARKERS) {
      let oldId = 0, old: Mark | undefined;
      marks.forEach((v, k) => { if (!old || v.used < old.used) { old = v; oldId = k; } });
      if (old) drop(oldId, old);
    }
    const base = sp.Game.getFormEx(XMARKER);
    const ref = base ? ac.placeAtMe(base, 1, false, false) : null;
    if (!ref) { if (drawSaid < 6) { drawSaid++; say("head: " + id.toString(16) + ": no marker could be placed"); } return false; }
    ref.setPosition(p[0], p[1], p[2]);
    m = { ref, place, at: [p[0], p[1], p[2]], movedAt: now, lookedAt: 0, used: now };
    marks.set(id, m);
  }
  m.used = now;
  const moved = Math.sqrt((p[0] - m.at[0]) ** 2 + (p[1] - m.at[1]) ** 2 + (p[2] - m.at[2]) ** 2);
  if (moved > MOVE_MIN && now - m.movedAt >= MOVE_GAP_MS) { m.ref.setPosition(p[0], p[1], p[2]); m.at = [p[0], p[1], p[2]]; m.movedAt = now; }
  if (now - m.lookedAt < RELOOK_MS) return false;
  m.lookedAt = now;
  ac.setHeadTracking(true);
  ac.setLookAt(m.ref, false);
  if (drawSaid < 6) {
    drawSaid++;
    let ai = "?"; try { ai = ac.isAIEnabled() ? "on" : "OFF"; } catch (e) { ai = "?"; }
    let dist = -1; try { dist = Math.round(ac.getDistance(m.ref)); } catch (e) { dist = -1; }
    say("head: " + id.toString(16) + " looks at its marker " + dist + " away (point " + p.map(Math.round).join(",") + "), its AI " + ai);
  }
  return true;
}

// for tests
export function _reset(): void { cameraWorks = null; cameraRetryAt = 0; marks.clear(); offIds.clear(); sentSaid = failSaid = drawSaid = sentSaidAt = 0; }
export function _markers(): number { return marks.size; }
