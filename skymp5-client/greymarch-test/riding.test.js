"use strict";
// Riding (src/greymarch/riding.ts, the riding test of 2026-10-31): the rider's game reports its horse, other games seat the rider on it, and the game that
// hosts a ridden horse lets it go to the rider's game.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "riding.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
const R = mod.exports;
const formView = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("the rider's game reports a new horse at once, the same horse again every 5 s, and 0 once when it gets off", () => {
  const st = { sent: 0, at: 0 };
  assert.strictEqual(R.rideReport(st, 1000, 0), null); // on foot from the start: nothing
  assert.strictEqual(R.rideReport(st, 1000, 0xff000123), 0xff000123);
  assert.strictEqual(R.rideReport(st, 1250, 0xff000123), null);
  assert.strictEqual(R.rideReport(st, 1000 + R.RIDE_REPORT_EVERY_MS, 0xff000123), 0xff000123);
  assert.strictEqual(R.rideReport(st, 7000, 0), 0);
  assert.strictEqual(R.rideReport(st, 20000, 0), null);
  assert.strictEqual(R.rideReport(st, 20250, 0xff000200), 0xff000200); // another horse
});

test("the riding property: a server id, anything else is on foot", () => {
  assert.strictEqual(R.ridingOf({ greymarchRiding: 0xff000123 }), 0xff000123);
  for (const v of [undefined, null, 0, -5, "x", NaN]) assert.strictEqual(R.ridingOf({ greymarchRiding: v }), 0);
  assert.strictEqual(R.ridingOf(null), 0);
});

test("the riders map: one horse per rider, cleared when they get off; a ridden horse is let go by its host", () => {
  const m = {};
  R.noteRider(m, 0xff000001, 0xff000100);
  assert.ok(R.riddenByOther(m, 0xff000100));
  R.noteRider(m, 0xff000001, 0xff000200); // changed horses
  assert.ok(!R.riddenByOther(m, 0xff000100));
  assert.ok(R.riddenByOther(m, 0xff000200));
  R.noteRider(m, 0xff000002, 0xff000300);
  R.noteRider(m, 0xff000001, 0); // got off
  assert.deepStrictEqual(Object.keys(m).map(Number), [0xff000300]);
  assert.ok(!R.riddenByOther(m, 0));
});

test("seating: put on once the horse is here, tried again every 3 s until it sits, got down with no horse", () => {
  assert.strictEqual(R.seatStep(0, false, false, 0, 1000), "none");
  assert.strictEqual(R.seatStep(0, true, false, 0, 1000), "unseat");
  assert.strictEqual(R.seatStep(7, false, false, 0, 10000), "wait"); // the horse is not loaded here (yet)
  assert.strictEqual(R.seatStep(7, false, true, 0, 10000), "seat");
  assert.strictEqual(R.seatStep(7, false, true, 10000, 11000), "wait");
  assert.strictEqual(R.seatStep(7, false, true, 10000, 10000 + R.SEAT_TRY_EVERY_MS), "seat");
  assert.strictEqual(R.seatStep(7, true, true, 0, 99999), "none");
});

test("only a horse is mounted on another player's word (HorseRace), and the hooks are in place", () => {
  assert.strictEqual(R.HORSE_RACE, 0x131fd);
  assert.ok(formView.includes("r.getFormID() === HORSE_RACE"));
  assert.ok(formView.includes("horse.activate(ac, true)"));
  assert.ok(formView.includes("ac.dismount()"));
  // a seated rider and the horse this game rides: no server movement played on them
  assert.ok(formView.includes("} else if (model.movement && !gmMyMount && !gmSeated) {"));
  assert.ok(formView.includes("if (alreadyHosted && riddenByOther(ridersMap(), this.remoteRefrId as number)) {"));
  assert.ok(formView.includes("if (Date.now() - (lastTryHost[gmMr] || 0) >= 1000) { lastTryHost[gmMr] = Date.now(); tryHost(gmMr); }"));
  assert.ok(bridge.includes('customPacketType: "greymarchRide", horse: send'));
  assert.ok(bridge.includes("this.greymarchRideTick(Date.now());"));
  assert.ok(bridge.includes("sp.Game.getPlayersLastRiddenHorse()"));
});

test("someone else's horse: the server's greymarchRideRefused gets this player off (in the update phase) and says why; authService lets it through", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  assert.ok(auth.includes("case 'greymarchRideRefused':"));
  assert.ok(bridge.includes('if (type === "greymarchRideRefused") { this.greymarchRideOff = {'));
  assert.ok(bridge.includes("if (opl && opl.isOnMount()) opl.dismount();"));
  // before the 250 ms gate, so it is not held back
  assert.ok(bridge.indexOf("var off = this.greymarchRideOff;") < bridge.indexOf("if (now < (this.greymarchRideNext || 0)) return;"));
});

test("getting on (2026-10-31): SkyMP blocks E on NPCs, so the server's greymarchMount has the game unblock the horse and mount; other games unblock before seating", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  assert.ok(auth.includes("case 'greymarchMount':"));
  assert.ok(bridge.includes('else if (Number(msg.horse) > 0) this.greymarchMountWanted = { id: Number(msg.horse) >>> 0,'), "a server horse (an event's): mounted as before");
  assert.ok(bridge.indexOf("mh.blockActivation(false);") > 0 && bridge.indexOf("mh.blockActivation(false);") < bridge.indexOf("mh.activate(mpl, true);"));
  assert.ok(bridge.indexOf("var mw = this.greymarchMountWanted;") < bridge.indexOf("if (now < (this.greymarchRideNext || 0)) return;"), "not held back by the 250 ms gate");
  assert.ok(formView.includes("horse.blockActivation(false); horse.activate(ac, true);"));
});

test("a ridden horse is left alone by the host's NPC care (2026-10-31: a galloping horse was rebuilt under its rider, flew about, and the game crashed on the deleted horse)", () => {
  const tick = formView.slice(formView.indexOf("private gmHostedTick(refr: ObjectReference): string {"));
  assert.ok(tick.indexOf('if (npc.isBeingRidden()) return "";') > 0 && tick.indexOf('if (npc.isBeingRidden()) return "";') < tick.indexOf("flatStep("), "before the rebuild, the ground fix and the nudge");
  assert.ok(formView.includes("if (alreadyHosted && !this.gmWasHost && !gmMyMount) {"), "no stop and animation reset on the horse this player sits on");
  assert.ok(formView.indexOf("const gmMyMount =") < formView.indexOf("if (alreadyHosted && !this.gmWasHost && !gmMyMount) {"));
});

test("another player near the rider (2026-10-31: the horse flew off when someone logged on): the rider's horse keeps its animations whoever runs it, and no other game asks to run a horse someone rides", () => {
  assert.ok(formView.includes("setDefaultAnimsDisabled(this.refrId, alreadyHosted || gmMyMount ? false : true);"));
  const host = formView.slice(formView.indexOf("private tryHostIfNeed(ac: Actor, remoteId: number) {"));
  assert.ok(host.indexOf("if (riddenByOther(ridersMap(), remoteId)) return false;") > 0 && host.indexOf("if (riddenByOther(ridersMap(), remoteId)) return false;") < host.indexOf("tryHost(remoteId);"));
});

test("no SkyMP move left on the horse under its rider (2026-10-31, the owner's clip: the horse climbed rocks, flew and landed on a tower): keepOffsetFromActor and translateTo are cleared on getting on and every second while riding", () => {
  assert.ok(formView.includes("if (gmMyMount && Date.now() - this.gmMountClearAt >= 1000) {"));
  assert.ok(formView.includes("if (gmMa) { gmMa.clearKeepOffsetFromActor(); gmMa.stopTranslation(); }"));
  assert.ok(bridge.indexOf("mh.clearKeepOffsetFromActor(); mh.stopTranslation();") < bridge.indexOf("mh.activate(mpl, true);"));
});

test("RIDDEN AS THEIR OWN (2026-10-31: no game shares the horse any more): the rider's game spawns a horse of the breed, protected, and mounts; off it, it tells the server where it stands and removes it; other games put a horse of the breed of their own under the rider and move it with the rider's movement", () => {
  assert.ok(bridge.includes('if (Number(msg.base) > 0) this.greymarchMountWanted = { id: 0, base: Number(msg.base) >>> 0,'));
  assert.ok(bridge.includes("opl2.placeAtMe(obase, 1, false, false)"));
  assert.ok(bridge.includes("modWcProtection(oid, 1)") && bridge.includes("modWcProtection(oh.id, -1)"));
  assert.ok(bridge.includes('customPacketType: "greymarchDismount", pos: pos, rot: rot'));
  assert.ok(bridge.includes("if (this.greymarchOwnHorseTick(now)) return;"), "no ride report while on a horse of its own");
  assert.ok(formView.includes("if (ownBase) return this.gmLocalMountStep(ac, model, ownBase, seated);"));
  assert.ok(formView.includes("applyMovement(horse, model.movement, false)"));
  assert.ok(formView.includes('this.gmRemoveLocalMount("the rider is gone");'));
  assert.ok(formView.includes("const GM_NPC_BASE_TYPE = 43;"));
});
