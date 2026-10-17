"use strict";
// A new character (src/greymarch/bridge.ts greymarchTick, the starting-clothes watch): the game's default gear (the iron armor) is REMOVED when the race menu
// opens, the watch lasts for as long as the player stays in the race menu, and closing it brings clean-ups that leave only the starting kit.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const IRON_ARMOR = 0x12e49, TROUSERS = 0x8f19a, PICKAXE = 0xe3c16;

function make() {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "./launchGuard": { launchGuard: { refused: "", joinedWith: null }, TITLE: "", HINT: "" }, "../view/worldViewMisc": { remoteIdToLocalId: () => 0, localIdToRemoteId: (id) => id }, "../sync/appearance": { applyAppearanceToPlayer() {} }, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const inv = new Map([[IRON_ARMOR, 1]]);
  const lines = [];
  let menu = false;
  const player = {
    unequipAll() {}, equipItem() {},
    removeAllItems() { inv.clear(); },
    addItem(f, n) { inv.set(f.id, (inv.get(f.id) || 0) + n); },
    getItemCount(f) { return inv.get(f.id) || 0; },
  };
  const sp = { Game: { getPlayer: () => player, getFormEx: (id) => ({ id, getName: () => String(id), getFormID: () => id }) }, Ui: { isMenuOpen: (n) => n === "RaceSex Menu" && menu } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = (t) => lines.push(t);
  // only the starting-clothes part of the tick is exercised here
  const tick = () => { gm.greymarchReveal = null; gm.greymarchTrace = null; gm.greymarchBeat = null; const t = gm.greymarchTick; try { t.call(Object.assign(Object.create(gm), { greymarchConnectCover() {}, greymarchDoorNamesApply() {}, greymarchDoorPrompt() {}, greymarchChatPending() {}, greymarchChatWatch() {}, greymarchWorldViewGuard() {}, greymarchToastTick() {}, greymarchEffects() {}, greymarchShapeTick() {}, greymarchWolfTick() {}, greymarchVampTick() {} })); } catch (e) { /* the other parts of the tick need a real game */ } };
  return { gm, inv, lines, tick, setMenu: (v) => { menu = v; } };
}

test("the iron armor is removed (not only taken off) when the race menu opens, and again after it closes, even after minutes in it", () => {
  const g = make();
  const realNow = Date.now;
  let t = 1000000;
  Date.now = () => t;
  try {
    g.gm.greymarchEquip = { at: t, ids: [TROUSERS], all: [TROUSERS], kit: [{ baseId: TROUSERS, count: 1 }, { baseId: PICKAXE, count: 1 }], pending: [], resets: 0, menuOpened: false, menuClosed: false };
    g.setMenu(true);
    t += 1000; g.tick();
    assert.strictEqual(g.inv.get(IRON_ARMOR) || 0, 0, "removed when the race menu opens");
    assert.ok(g.lines.some((l) => /race menu opened/.test(l)));
    g.inv.set(IRON_ARMOR, 1); // the game puts its default gear back while the face is built
    t += 5 * 60 * 1000; g.tick(); // five minutes in the race menu: still watching
    assert.ok(g.gm.greymarchEquip, "the watch did not give up at 30 seconds");
    g.setMenu(false);
    t += 100; g.tick(); // closed: clean-ups scheduled
    t += 700; g.tick();
    assert.strictEqual(g.inv.get(IRON_ARMOR) || 0, 0, "removed again after the race menu closed");
    assert.strictEqual(g.inv.get(PICKAXE), 1, "the starting kit is there");
  } finally { Date.now = realNow; }
});
