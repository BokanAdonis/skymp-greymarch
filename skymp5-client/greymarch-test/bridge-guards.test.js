"use strict";
// Guards, the game's half (src/greymarch/bridge.ts): the cuffs worn and the bound pose on the server's word, other cuffed players posed, the chain drawn on the HUD
// from the prisoner's hands to the holder's, the cuffing bar, and the frisk request opening the X menu by itself.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

const CUFFS = 0x103941;
function make() {
  const log = { hud: [], events: [], equipped: [], visible: [], lines: [] };
  const others = { 0xff000200: 0x5000, 0xff000201: 0x5001 };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => others[id] || 0 }, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const items = new Map([[CUFFS, 1]]); const worn = new Set();
  const at = (x) => ({ getPositionX: () => x, getPositionY: () => 0, getPositionZ: () => 0 });
  const player = Object.assign(at(0), { name: "me", getItemCount: (f) => items.get(f.id) || 0, isEquipped: (f) => worn.has(f.id), equipItem: (f, keep, silent) => { worn.add(f.id); log.equipped.push([f.id, keep, silent]); }, getDistance: () => 100 });
  const actors = { 0x5000: Object.assign(at(100), { name: "guard" }), 0x5001: Object.assign(at(200), { name: "other prisoner" }) };
  const sp = {
    printConsole() {}, writeLogs: (n, l) => log.lines.push(l),
    browser: { executeJavaScript: (s) => { const m = /__gmHudSend\((.*)\);$/.exec(s); if (m) log.hud.push(JSON.parse(m[1])); }, setVisible: (v) => log.visible.push(v), setFocused() {} },
    Game: { getPlayer: () => player, getFormEx: (id) => actors[id] || { id } },
    Actor: { from: (f) => (f && f.name ? f : null) },
    Debug: { sendAnimationEvent: (ref, name) => log.events.push([ref.name, name]), notification() {} },
    NetImmerse: { getNodeWorldPositionX: (a) => a.getPositionX(), getNodeWorldPositionY: () => 0, getNodeWorldPositionZ: () => 100 },
    worldPointToScreenPoint: (...pts) => pts.map((p) => [0.5 + p[0] / 1000, 0.4, 1]), // in front of the camera
    on() {},
  };
  const controller = { on() {}, emitter: { on() {}, emit() {} } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  gm.greymarchMeActor = 0xff000100;
  let t = 1_000_000;
  return { gm, log, worn, say: (m) => gm.greymarchPacket(m), tick: (ms = 600) => { t += ms; gm.greymarchCuffsTick(t); } };
}

test("the game hears the three new packets (authService.ts)", () => {
  for (const p of ["greymarchCuffs", "greymarchChains", "greymarchProgress"]) assert.ok(auth.includes(`case '${p}':`), p);
});

test("in cuffs: the Prisoner's Cuffs are worn and kept on, the bound pose plays, and both stop when the server frees them", () => {
  const s = make();
  s.say({ customPacketType: "greymarchCuffs", on: true, bound: true, gagged: false, cuffs: CUFFS });
  s.tick();
  assert.deepStrictEqual(s.log.equipped, [[CUFFS, true, true]], "preventRemoval");
  assert.deepStrictEqual(s.log.events, [["me", "OffsetBoundStandingStart"]]);
  s.tick();
  assert.strictEqual(s.log.events.length, 1, "not every half second");
  s.tick(10500);
  assert.strictEqual(s.log.events.length, 2, "again after 10 seconds: another animation may have ended it");
  s.say({ customPacketType: "greymarchCuffs", on: false });
  s.tick();
  assert.deepStrictEqual(s.log.events.pop(), ["me", "OffsetStop"]);
});

test("other players in cuffs are posed too, and let go when they are free", () => {
  const s = make();
  s.say({ customPacketType: "greymarchChains", chains: [], cuffed: [0xff000201, 0xff000100] });
  s.tick();
  assert.deepStrictEqual(s.log.events, [["other prisoner", "OffsetBoundStandingStart"]], "not me: my own cuffs come in greymarchCuffs");
  s.say({ customPacketType: "greymarchChains", chains: [], cuffed: [] });
  s.tick();
  assert.deepStrictEqual(s.log.events.pop(), ["other prisoner", "OffsetStop"]);
});

test("the chain is drawn on the HUD from the prisoner's hands to the holder's, the page layer is shown, and it goes when the chain does", () => {
  const s = make();
  s.say({ customPacketType: "greymarchChains", chains: [{ from: 0xff000100, to: 0xff000200 }], cuffed: [0xff000100] });
  s.tick();
  const c = s.log.hud.filter((m) => m.fn === "chains").pop();
  assert.deepStrictEqual(c.arg.list, [[0.5, 0.6, 0.6, 0.6]]);
  assert.ok(s.log.visible.includes(true));
  const n = s.log.hud.length; s.tick(40);
  assert.strictEqual(s.log.hud.length, n, "nothing moved: nothing sent");
  s.say({ customPacketType: "greymarchChains", chains: [], cuffed: [] });
  s.tick();
  assert.deepStrictEqual(s.log.hud.filter((m) => m.fn === "chains").pop().arg.list, []);
});

test("the cuffing bar goes to the HUD, and stops on the server's word", () => {
  const s = make();
  s.say({ customPacketType: "greymarchProgress", text: "Cuffing Stranger...", ms: 7000 });
  assert.deepStrictEqual(s.log.hud.pop(), { fn: "progress", arg: { on: true, ms: 7000, text: "Cuffing Stranger..." } });
  assert.ok(s.log.visible.includes(true));
  s.say({ customPacketType: "greymarchProgress", off: true });
  assert.deepStrictEqual(s.log.hud.pop(), { fn: "progress", arg: { on: false } });
});

test("a guard's request to frisk and what the frisk found open the X menu by themselves", () => {
  for (const type of ["frisk_invite", "guard_view"]) {
    const s = make(); const shown = []; const toPage = [];
    s.gm.greymarchMenuShow = (a) => shown.push(a); s.gm.greymarchMenuToPage = (k, m) => toPage.push([k, m.type]);
    s.say({ customPacketType: "greymarchMenuEvent", type });
    assert.deepStrictEqual(shown, [{ mode: "invite", looking: 0 }], type);
    assert.deepStrictEqual(toPage, [["event", type]]);
  }
});
