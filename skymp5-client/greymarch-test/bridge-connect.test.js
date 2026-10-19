"use strict";
// Straight into the server (src/greymarch/bridge.ts greymarchConnectCover): started by the launcher, the select page covers Skyrim's main menu with
// "Connecting to Greymarch" and the browser holds the mouse and keyboard until the character select arrives; without the launcher nothing changes.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make(autoplay) {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./launchGuard": { launchGuard: { refused: "", joinedWith: null }, TITLE: "", HINT: "" }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id }, "../sync/appearance": { applyAppearanceToPlayer() {} }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const page = [], state = { visible: false, focused: false };
  const sp = {
    settings: { "skymp5-client": autoplay ? { "greymarch-autoplay": true } : {} },
    printConsole() {}, writeLogs() {}, storage: {}, on() {},
    browser: {
      executeJavaScript: (code) => { const m = /window\.__gmSend\((.*)\);$/.exec(code); if (m) page.push(JSON.parse(m[1])); },
      setVisible: (v) => { state.visible = v; }, setFocused: (v) => { state.focused = v; }, isFocused: () => state.focused, isVisible: () => state.visible,
    },
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  return { gm, page, state };
}

test("started by the launcher: the connecting screen covers the main menu and holds the input, once a second, until the character select", () => {
  const { gm, page, state } = make(true);
  gm.greymarchConnectCover(1000);
  assert.deepStrictEqual(page.at(-1), { fn: "connecting", arg: { on: true, text: "Connecting to Greymarch", failed: false } });
  assert.strictEqual(state.visible, true);
  assert.strictEqual(state.focused, true);
  gm.greymarchConnectCover(1500);
  assert.strictEqual(page.length, 1, "not more than once a second");
  gm.greymarchConnectCover(2100);
  assert.strictEqual(page.length, 2, "sent again (the page may have been loading)");
  gm.greymarchConnectCover(1000 + 50000);
  assert.strictEqual(page.at(-1).arg.text, "Still connecting to Greymarch");
  gm.greymarchConnectCover(1000 + 91000);
  assert.strictEqual(page.at(-1).arg.failed, true, "after 90 s it says what to do");

  gm.greymarchPacket({ customPacketType: "greymarchSelect", max: 2, account: "Tie", characters: [] });
  assert.ok(page.some((m) => m.fn === "show"), "the character select is shown");
  const n = page.length;
  gm.greymarchConnectCover(1000 + 200000);
  assert.strictEqual(page.length, n, "the connecting screen's job is over");
});

test("started without the launcher: nothing is covered, SkyMP's own login and the main menu work as before", () => {
  const { gm, page, state } = make(false);
  gm.greymarchConnectCover(1000);
  gm.greymarchConnectCover(5000);
  assert.deepStrictEqual(page, []);
  assert.strictEqual(state.focused, false);
});
