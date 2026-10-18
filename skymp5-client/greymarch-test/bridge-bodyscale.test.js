"use strict";
// RaceMenu's body scales, the game's half (src/greymarch/bridge.ts): read from the player and sent when the race menu closes; the server's list drawn on every
// character (the player too), left alone while RaceMenu is open, put back to the default size when a character leaves the list.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make(opts = {}) {
  const log = { lines: [], sent: [], calls: [] };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (opts.others || {})[id] || 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  let menuOpen = false;
  const mine = opts.mine || {}; // what RaceMenu set on the player: node -> scale
  const actor = (name, sex) => ({ name, loaded: true, is3DLoaded() { return this.loaded; }, getBaseObject: () => ({ sex }) });
  const player = actor("me", 1);
  const other = actor("them", 0);
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript() {} },
    Ui: { isMenuOpen: (name) => name === "RaceSex Menu" && menuOpen },
    Game: { getPlayer: () => player, getFormEx: (id) => (id === 0x5000 ? other : null), getFormFromFile: () => null },
    Actor: { from: (f) => f || null }, ActorBase: { from: (b) => ({ getSex: () => b.sex }) },
    callNative: (cls, fn, self, ...args) => {
      assert.strictEqual(cls, "NiOverride");
      if (fn === "GetNodeTransformScale") return mine[args[3]] || 0;
      log.calls.push([fn, args[0].name, ...args.slice(1)]);
      return undefined;
    },
    Debug: { notification() {} }, on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit: (n, m) => { if (n === "sendMessage") { const c = JSON.parse(m.message.contentJsonDump); if (c.customPacketType === "greymarchLog") log.lines.push(c); else log.sent.push(c); } } } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  gm.greymarchMeActor = 0xff000010;
  let t = 100000;
  return { gm, log, player, other, step: (ms = 2100) => { t += ms; gm.greymarchBodyScales(t); }, menu: (on) => { menuOpen = on; }, say: (m) => gm.greymarchPacket(m) };
}
const adds = (calls, who) => calls.filter((c) => c[0] === "AddNodeTransformScale" && c[1] === who).map((c) => [c[2], c[3], c[4], c[6]]);

test("closing the race menu sends every RaceMenu body scale of the player (0, never set, is the default 1)", () => {
  const s = make({ mine: { "NPC": 1.104, "NPC Head [Head]": 0.9 } });
  s.menu(true); s.step();
  assert.strictEqual(s.log.sent.length, 0);
  s.menu(false); s.step();
  assert.strictEqual(s.log.sent.length, 1);
  const m = s.log.sent[0];
  assert.strictEqual(m.customPacketType, "greymarchBodyScales");
  assert.strictEqual(m.scales["NPC"], 1.1);
  assert.strictEqual(m.scales["NPC Head [Head]"], 0.9);
  assert.strictEqual(m.scales["WEAPON"], 1);
  assert.strictEqual(Object.keys(m.scales).length, 20);
});

test("the server's list is drawn on other players with their sex and RaceMenu's key, first and third person", () => {
  const s = make({ others: { 0xff000020: 0x5000 } });
  s.say({ customPacketType: "greymarchBodyScales", list: [{ actor: 0xff000020, scales: { "NPC": 1.2 } }] });
  s.step();
  assert.deepStrictEqual(adds(s.log.calls, "them"), [[false, false, "NPC", 1.2], [true, false, "NPC", 1.2]]);
  assert.ok(s.log.calls.some((c) => c[0] === "RemoveNodeTransformScale" && c[1] === "them" && c[4] === "NPC Head [Head]"), "the other nodes are put to the default");
  assert.ok(s.log.calls.some((c) => c[0] === "UpdateNodeTransform" && c[1] === "them" && c[4] === "NPC"));
  s.log.calls.length = 0;
  s.step();
  assert.strictEqual(s.log.calls.length, 0, "not applied again until something changes");
  s.other.loaded = false; s.step();
  s.other.loaded = true; s.step();
  assert.deepStrictEqual(adds(s.log.calls, "them"), [[false, false, "NPC", 1.2], [true, false, "NPC", 1.2]], "applied again when their 3D is back");
});

test("the player's own scales come from the server too, but not while RaceMenu is open or just after it closed", () => {
  const s = make();
  const list = { customPacketType: "greymarchBodyScales", list: [{ actor: 0xff000010, scales: { "NPC Head [Head]": 1.5 } }] };
  s.say(list); s.step();
  assert.deepStrictEqual(adds(s.log.calls, "me"), [[false, true, "NPC Head [Head]", 1.5], [true, true, "NPC Head [Head]", 1.5]]);
  s.log.calls.length = 0;
  s.menu(true); s.say(list); s.step(31000);
  assert.strictEqual(s.log.calls.length, 0, "RaceMenu is the editor while it is open");
  s.menu(false); s.step(100);
  s.say({ customPacketType: "greymarchBodyScales", list: [] }); s.step(2100);
  assert.strictEqual(s.log.calls.length, 0, "the old list does not undo the new sliders before the server answered");
  s.step(5000);
  assert.ok(s.log.calls.some((c) => c[0] === "RemoveNodeTransformScale" && c[1] === "me"), "left the list: back to the default size");
});

test("a character who leaves the list is put back to the default size", () => {
  const s = make({ others: { 0xff000020: 0x5000 } });
  s.say({ customPacketType: "greymarchBodyScales", list: [{ actor: 0xff000020, scales: { "NPC": 0.9 } }] });
  s.step();
  s.log.calls.length = 0;
  s.say({ customPacketType: "greymarchBodyScales", list: [] });
  s.step();
  assert.deepStrictEqual(adds(s.log.calls, "them"), []);
  assert.strictEqual(s.log.calls.filter((c) => c[0] === "RemoveNodeTransformScale" && c[1] === "them").length, 40);
});
