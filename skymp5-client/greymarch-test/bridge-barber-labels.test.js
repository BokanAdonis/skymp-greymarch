"use strict";
// src/greymarch/bridge.ts greymarchBarberLabels: every barber spot the server lists is named "Barber's <its name> (<price> gold)" on this game (2026-11-02, the owner:
// "make it so the assigned barber spots are easily identified"); a spot taken off the list gets its own name back.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
function make() {
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": { remoteIdToLocalId: (id) => (id === 0xff000123 ? 0xff000aaa : 0), localIdToRemoteId: (id) => id } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  const mk = (name) => { const r = { shown: name, getBaseObject: () => ({ getName: () => name }), getDisplayName: () => r.shown, setDisplayName: (n, force) => { assert.strictEqual(force, true); r.shown = n; } }; return r; };
  const chair = mk("Chair"), mirror = mk("Mirror");
  const sp = { printConsole() {}, writeLogs() {}, on() {}, storage: {}, ObjectReference: { from: (f) => f || null },
    Game: { getFormFromFile: (id, file) => (id === 0x1a2b && file === "Skyrim.esm" ? chair : null), getFormEx: (id) => (id === 0xff000aaa ? mirror : null) } };
  const gm = new mod.exports.GreymarchBridge(sp, { on() {}, emitter: { on() {}, emit() {} } });
  gm.greymarchLog = () => {};
  return { gm, chair, mirror };
}

test("barber spots are named with the price, a placed one too; taken off the list, the old name is back", () => {
  const { gm, chair, mirror } = make();
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["1a2b:Skyrim.esm", "ff:ff000123", "99:Missing.esp"], price: 100 });
  gm.greymarchBarberLabels(1000);
  assert.strictEqual(chair.shown, "Barber's Chair (100 gold)");
  assert.strictEqual(mirror.shown, "Barber's Mirror (100 gold)");
  chair.shown = "Chair"; // the cell loaded again
  gm.greymarchBarberLabels(1500);
  assert.strictEqual(chair.shown, "Chair", "every 2 s, not every frame");
  gm.greymarchBarberLabels(3100);
  assert.strictEqual(chair.shown, "Barber's Chair (100 gold)", "named again");
  gm.greymarchPacket({ customPacketType: "greymarchBarberSpots", spots: ["ff:ff000123"], price: 0 });
  gm.greymarchBarberLabels(3200);
  assert.strictEqual(chair.shown, "Chair", "no longer a spot: its own name");
  assert.strictEqual(mirror.shown, "Barber's Mirror", "free: no price shown");
});
