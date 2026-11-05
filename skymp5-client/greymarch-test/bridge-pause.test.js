"use strict";
// Tests for the pause menu of the Greymarch bridge (src/greymarch/bridge.ts, 2026-11-05): Esc with no window open shows greymarch-pause.html instead of the game's Journal
// menu, which is shut the frame it opens; an Esc that closed something else does not open it; Skyrim settings lets the Journal open once; Quit asks the game to close.
//   node --test skymp5-client/greymarch-test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make({ closeMenu = true, journalKey = false } = {}) {
  const log = { sent: [], lines: [], closed: [], taps: [], pages: [], visible: [], focused: [], quit: 0, journalKey: [], opened: [] };
  const misc = { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0, getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const open = new Set();
  let focus = false;
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => null, quitGame: () => { log.quit++; } },
    Ui: { isMenuOpen: (name) => open.has(name) },
    Input: { tapKey: (k) => { log.taps.push(k); if (k === 1) { if (open.has("Journal Menu")) open.delete("Journal Menu"); else open.add("Journal Menu"); } } },
    callNative: (cls, fn, self, name) => {
      if (cls === "GreymarchCam" && fn === "CloseMenu" && closeMenu) { log.closed.push(name); open.delete(name); return true; }
      if (cls === "GreymarchCam" && fn === "SetJournalKey" && journalKey) { log.journalKey.push(name); return true; }
      if (cls === "GreymarchCam" && fn === "OpenMenu" && journalKey) { log.opened.push(name); open.add(name); return true; }
      throw new Error("no such native");
    },
    browser: {
      setVisible: (v) => log.visible.push(v), setFocused: (f) => { focus = f; log.focused.push(f); }, isFocused: () => focus,
      executeJavaScript: (code) => { const m = /__gmPauseRun\((\{.*\})\);$/.exec(code); if (m) log.pages.push(JSON.parse(m[1])); },
    },
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => log.sent.push([n, p]) } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const esc = () => { gm.greymarchKey({ code: 1, isDown: () => true }); gm.greymarchKey({ code: 1, isDown: () => false, isUp: true }); };
  return { gm, log, open, esc, setFocus: (f) => { focus = f; } };
}

test("Esc with nothing open: the game's Journal is shut the frame it is seen and the pause menu shows instead, with the character's name", () => {
  const { gm, log, open } = make();
  gm.greymarchPlayingName = "Kodlak Whitemane"; gm.greymarchPlayingId = "#KDKK";
  open.add("Journal Menu"); // the game opened its own menu on Esc
  gm.greymarchPauseTick(Date.now());
  assert.deepStrictEqual(log.closed, ["Journal Menu"]);
  assert.strictEqual(gm.greymarchPauseOn, true);
  assert.deepStrictEqual(log.pages.pop(), { fn: "show", arg: { name: "Kodlak Whitemane", id: "#KDKK" } });
  assert.ok(log.focused.includes(true), "the page takes the keyboard and the mouse");
});

test("the Esc press that opened it does not close it again (2026-11-05, in game: it opened and closed at once)", () => {
  const { gm, open, esc } = make();
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  esc(); // the same press reaching the key handler after the menu came up
  assert.strictEqual(gm.greymarchPauseOn, true);
});

test("Esc closes the pause menu, and the Journal that same Esc opens is shut without showing the pause menu again", () => {
  const { gm, log, open, esc } = make();
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  assert.strictEqual(gm.greymarchPauseOn, true);
  gm.greymarchPauseShownAt -= 1000; // a moment later
  esc();
  assert.strictEqual(gm.greymarchPauseOn, false);
  assert.deepStrictEqual(log.pages.pop(), { fn: "hide", arg: true });
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  assert.ok(!open.has("Journal Menu"), "shut");
  assert.strictEqual(gm.greymarchPauseOn, false, "not reopened by the Esc that closed it");
});

test("an Esc that closed the chat input or another window does not open the pause menu as well", () => {
  const { gm, open, esc } = make();
  gm.greymarchChatTyping = true; gm.greymarchChatClose = () => { gm.greymarchChatTyping = false; };
  esc();
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  assert.strictEqual(!!gm.greymarchPauseOn, false);
  const b = make();
  b.gm.greymarchProfOn = true; b.gm.greymarchProfHide = () => { b.gm.greymarchProfOn = false; };
  b.esc();
  b.open.add("Journal Menu"); b.gm.greymarchPauseTick(Date.now());
  assert.strictEqual(!!b.gm.greymarchPauseOn, false);
});

test("without the DLL's CloseMenu the Journal is shut with an Esc tap, and that tap does not close the pause menu it made way for", () => {
  const { gm, log, open, esc } = make({ closeMenu: false });
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  assert.deepStrictEqual(log.taps, [1]);
  assert.ok(!open.has("Journal Menu"));
  esc(); // the tap reaching the key handler
  assert.strictEqual(gm.greymarchPauseOn, true);
});

test("Skyrim settings: the pause menu closes and the game's own menu opens once on purpose and is left open until the player closes it", () => {
  const { gm, log, open } = make();
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  gm.greymarchBrowserMessage ? gm.greymarchBrowserMessage({ arguments: [JSON.stringify({ type: "pause", op: "skyrim" })] }) : null;
  if (gm.greymarchPauseOn) gm.greymarchPauseAction({ op: "skyrim" });
  assert.strictEqual(gm.greymarchPauseOn, false);
  const later = Date.now() + 1000;
  gm.greymarchPauseTick(later);
  assert.ok(open.has("Journal Menu"), "opened by an Esc tap");
  log.closed.length = 0;
  gm.greymarchPauseTick(later + 50); gm.greymarchPauseTick(later + 5000);
  assert.deepStrictEqual(log.closed, [], "left open");
  assert.strictEqual(gm.greymarchPauseOn, false);
  open.delete("Journal Menu"); gm.greymarchPauseTick(later + 5100); // the player closed it
  open.add("Journal Menu"); gm.greymarchPauseTick(later + 9000); // the next Esc
  assert.ok(!open.has("Journal Menu"));
  assert.strictEqual(gm.greymarchPauseOn, true, "back to the pause menu");
});

test("Quit asks the game to close from the update phase; the logo switch goes to the HUD page", () => {
  const { gm, log } = make();
  let logo = 0; gm.greymarchHudToPage = (fn) => { if (fn === "logoToggle") logo++; };
  gm.greymarchPauseAction({ op: "logo" });
  assert.strictEqual(logo, 1);
  gm.greymarchPauseAction({ op: "quit" });
  assert.strictEqual(log.quit, 0, "not from the message itself");
  gm.greymarchPauseTick(Date.now() + 500);
  assert.strictEqual(log.quit, 1);
});

test("the open pause menu takes the keyboard back when SkyMP lets it go, and counts as a window that has the keys", () => {
  const { gm, open, setFocus, log } = make();
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now());
  setFocus(false); log.focused.length = 0;
  gm.greymarchPauseTick(Date.now() + 1000);
  assert.deepStrictEqual(log.focused, [true]);
  assert.strictEqual(gm.greymarchPanelHasKeys(), true);
});

test("the page's messages reach the bridge: pause-close and pause", () => {
  assert.match(src, /if \(data && data\.type === "pause-close"\) \{ this\.greymarchPauseHide\(\); return; \}/);
  assert.match(src, /if \(data && data\.type === "pause"\) \{ this\.greymarchPauseAction\(data\); return; \}/);
  assert.match(src, /const PAUSE_SCRIPT = PROF_SCRIPT\.split\("__gmProfSend"\)\.join\("__gmPauseRun"\)\.split\("greymarch-prof"\)\.join\("greymarch-pause"\)/);
});

test("health, magicka, stamina: the game's own meters are hidden and the three percentages go to the HUD page when they move; they come back when our page is not up", () => {
  const { gm, log } = make();
  const set = []; const vit = [];
  gm.sp.Ui.setBool = (menu, target, v) => set.push([target, v]);
  gm.sp.Ui.getBool = () => true;
  gm.greymarchHudToPage = (fn, arg) => { if (fn === "vitals") vit.push(arg); };
  let pct = { Health: 0.5, Magicka: 1, Stamina: 0.25 };
  gm.sp.Game.getPlayer = () => ({ getActorValuePercentage: (n) => pct[n] });
  gm.greymarchChatOn = true;
  const t = Date.now() + 10000;
  gm.greymarchVitalsTick(t);
  assert.deepStrictEqual(set, [["_root.HUDMovieBaseInstance.Health._visible", false], ["_root.HUDMovieBaseInstance.Magica._visible", false], ["_root.HUDMovieBaseInstance.Stamina._visible", false]]);
  assert.deepStrictEqual(vit, [{ h: 0.5, m: 1, s: 0.25 }]);
  gm.greymarchVitalsTick(t + 150);
  assert.strictEqual(vit.length, 1, "nothing moved: nothing sent");
  pct.Health = 0.4; gm.greymarchVitalsTick(t + 300);
  assert.deepStrictEqual(vit[1], { h: 0.4, m: 1, s: 0.25 });
  set.length = 0; gm.greymarchScreenUp = true; gm.greymarchVitalsTick(t + 450);
  assert.ok(set.every(([, v]) => v === true) && set.length === 3, "the game's bars are back while the select screen is up");
  assert.deepStrictEqual(vit.pop(), { off: true });
  assert.ok(log.lines.some((l) => /vitals: the game's bars hidden/.test(l)));
});

test("no flash (GreymarchCamera.dll 1.14): Esc's Journal binding is taken off once, Esc then opens the pause menu itself, and Skyrim settings opens the game's menu by name", () => {
  const { gm, log, open, esc } = make({ journalKey: true });
  const t = Date.now();
  gm.greymarchPauseTick(t);
  assert.deepStrictEqual(log.journalKey, [false]);
  assert.strictEqual(gm.greymarchJournalKeyOff, true);
  gm.greymarchPauseTick(t + 5000);
  assert.deepStrictEqual(log.journalKey, [false], "once");
  esc();
  assert.ok(!open.has("Journal Menu"), "the game's menu never opened");
  gm.greymarchPauseTick(Date.now());
  assert.strictEqual(gm.greymarchPauseOn, true);
  assert.deepStrictEqual(log.closed, [], "nothing to shut");
  gm.greymarchPauseAction({ op: "skyrim" });
  gm.greymarchPauseTick(Date.now() + 1000);
  assert.deepStrictEqual(log.opened, ["Journal Menu"]);
  assert.deepStrictEqual(log.taps, [], "no Esc tap needed");
  assert.ok(open.has("Journal Menu"));
});

test("an older DLL without SetJournalKey: tried five times, then the old way (the Journal shut when it opens)", () => {
  const { gm, log, open } = make();
  for (let i = 0; i < 6; i++) gm.greymarchPauseTick(Date.now() + i * 4000);
  assert.ok(!gm.greymarchJournalKeyOff);
  assert.ok(log.lines.some((l) => /SetJournalKey not there/.test(l)));
  open.add("Journal Menu"); gm.greymarchPauseTick(Date.now() + 30000);
  assert.strictEqual(gm.greymarchPauseOn, true);
});
