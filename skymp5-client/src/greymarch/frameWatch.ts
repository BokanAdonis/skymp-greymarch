// GREYMARCH: FRAME-DROP LOG (2026-11-09, the owner: "a lot of frame loss around the college", only since that day; nothing in the code or the data showed why).
// Every frame (the "update" phase) the time since the last one is measured. Over each WINDOW_MS: how many frames, the average rate, the worst frame, how many
// were slow (over SLOW_MS) or hitches (over HITCH_MS), and how much of that our own per-frame world update took (worldView: every form the server sends,
// the slowest single form named). When the rate fell under LOW_FPS or there were HITCHES_TO_LOG hitches, one line goes to the server log (greymarchLog):
// where the player stands (world or cell, its name, x y z), the weather, how many characters are in the cell. At most one line every REPORT_GAP_MS and
// MAX_LINES a game, so it never floods. A gap over PAUSE_MS (loading, a menu that stops the update phase, alt-tab) is not counted as a frame.
// Diagnostic only: it never changes the game; every game call is in a try.

export const WINDOW_MS = 10000;
export const SLOW_MS = 50; // under 20 fps
export const HITCH_MS = 150;
export const PAUSE_MS = 2000;
export const LOW_FPS = 30;
export const HITCHES_TO_LOG = 3;
export const REPORT_GAP_MS = 30000;
export const MAX_LINES = 40;

interface Window {
  start: number; frames: number; sum: number; worst: number; slow: number; hitches: number;
  js: number; jsWorst: number; formWorst: number; formWorstId: number; forms: number;
}

const fresh = (now: number): Window => ({ start: now, frames: 0, sum: 0, worst: 0, slow: 0, hitches: 0, js: 0, jsWorst: 0, formWorst: 0, formWorstId: 0, forms: 0 });

let last = 0;
let win: Window = fresh(0);
let lastReport = -REPORT_GAP_MS; // the first bad window is logged at once
let linesLeft = MAX_LINES;

// worldView: how long this frame's world update took and how many forms it went through
export function frameWatchWorld(ms: number, forms: number): void {
  win.js += ms;
  if (ms > win.jsWorst) win.jsWorst = ms;
  if (forms > win.forms) win.forms = forms;
}

// formViewArray: one form's update time (only the slowest of the window is kept)
export function frameWatchForm(ms: number, refrId: number): void {
  if (ms > win.formWorst) { win.formWorst = ms; win.formWorstId = refrId; }
}

const hex = (n: number): string => (n >>> 0).toString(16);

function where(sp: any): string {
  try {
    const p = sp.Game.getPlayer();
    const ws = p.getWorldSpace();
    const cell = p.getParentCell();
    let s = ws ? "world " + hex(ws.getFormID()) + " \"" + (ws.getName() || "") + "\"" : "";
    if (cell) s += (s ? ", " : "") + "cell " + hex(cell.getFormID()) + (cell.getName() ? " \"" + cell.getName() + "\"" : "");
    s += " at " + Math.round(p.getPositionX()) + "," + Math.round(p.getPositionY()) + "," + Math.round(p.getPositionZ());
    let actors = -1; try { actors = cell ? cell.getNumRefs(62) : -1; } catch (e) { actors = -1; }
    if (actors >= 0) s += "; " + actors + " characters in the cell";
    try { const w = sp.Weather.getCurrentWeather(); if (w) s += "; weather " + hex(w.getFormID()); } catch (e) { /* no weather */ }
    return s;
  } catch (e) {
    return "(place unknown)";
  }
}

export function lineFor(w: Window, spent: number, place: string): string {
  const fps = w.sum > 0 ? Math.round(w.frames * 1000 / w.sum) : 0;
  return "frames: " + Math.round(spent / 1000) + " s at " + fps + " fps, worst frame " + Math.round(w.worst) + " ms, " + w.slow + " over " + SLOW_MS + " ms, " + w.hitches + " over " + HITCH_MS + " ms"
    + "; our world update " + (w.frames ? (w.js / w.frames).toFixed(1) : "0") + " ms a frame, worst " + Math.round(w.jsWorst) + " ms"
    + (w.formWorstId ? " (slowest form " + hex(w.formWorstId) + " " + Math.round(w.formWorst) + " ms)" : "") + ", " + w.forms + " forms"
    + "; " + place;
}

// whether a window is bad enough to log
export function isBad(w: Window): boolean {
  if (w.frames < 10 || w.sum <= 0) return false;
  return w.frames * 1000 / w.sum < LOW_FPS || w.hitches >= HITCHES_TO_LOG;
}

// called once a frame from the update phase
export function frameWatchTick(sp: any, now: number, log: (text: string) => void): void {
  if (!last) { last = now; win = fresh(now); return; }
  const dt = now - last;
  last = now;
  if (dt > PAUSE_MS) { win = fresh(now); return; } // a pause, not a frame
  win.frames++; win.sum += dt;
  if (dt > win.worst) win.worst = dt;
  if (dt > SLOW_MS) win.slow++;
  if (dt > HITCH_MS) win.hitches++;
  if (now - win.start < WINDOW_MS) return;
  const done = win;
  win = fresh(now);
  if (!isBad(done) || linesLeft <= 0 || now - lastReport < REPORT_GAP_MS) return;
  lastReport = now; linesLeft--;
  try { log(lineFor(done, now - done.start, where(sp)) + (linesLeft === 0 ? " (the last frame line this game)" : "")); } catch (e) { /* diagnostics only */ }
}
