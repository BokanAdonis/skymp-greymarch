"use strict";
// NPC hosting that follows the players (src/greymarch/npcHosting.ts and its use in src/view/formView.ts): the host's game hands an NPC to a clearly closer player,
// does not ask for it back for a while, and makes a hostile NPC that fights nobody go for another player it detects (2026-10-23: dungeon NPCs stood still).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "npcHosting.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
const H = mod.exports;
const formView = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");

test("hand-off: only when the host's player is far AND another player is clearly closer", () => {
  assert.strictEqual(H.shouldRelease(4000, [500]), true, "the newcomer is next to it, the host across the dungeon");
  assert.strictEqual(H.shouldRelease(1200, [100]), false, "the host's player is still close: it keeps it");
  assert.strictEqual(H.shouldRelease(2000, [1600]), false, "not clearly closer (a margin, so two players at a similar distance do not pass it back and forth)");
  assert.strictEqual(H.shouldRelease(2000, [1300]), true);
  assert.strictEqual(H.shouldRelease(5000, []), false, "nobody else: it stays");
  assert.strictEqual(H.shouldRelease(5000, [NaN, Infinity]), false);
  assert.strictEqual(H.shouldRelease(NaN, [10]), false);
});

test("a game that let an NPC go does not ask for it again for 8 s; the hosted list loses both spellings of its id", () => {
  H.markReleased(0xff000123, 1000);
  assert.strictEqual(H.isReleased(0xff000123, 1000 + 7999), true);
  assert.strictEqual(H.isReleased(0xff000123, 1000 + 8000), false);
  assert.strictEqual(H.isReleased(0xff000123, 1000 + 100), false, "forgotten once it ran out");
  assert.deepStrictEqual(H.withoutHosted([0xff000123, 5, 0x100012345], 0xff000123), [5, 0x100012345]);
  assert.deepStrictEqual(H.withoutHosted([0x12345 + 0x100000000, 7], 0x12345), [7], "a game record's NPC is kept as id + 0x100000000");
  assert.deepStrictEqual(H.withoutHosted(undefined, 1), []);
});

test("a hostile NPC fighting nobody goes for the nearest other player it DETECTS, within reach", () => {
  assert.strictEqual(H.pickTarget([{ d: 900, detected: true }, { d: 400, detected: true }]), 1);
  assert.strictEqual(H.pickTarget([{ d: 400, detected: false }, { d: 900, detected: true }]), 1, "a sneaking player it has not noticed is left alone");
  assert.strictEqual(H.pickTarget([{ d: 4000, detected: true }]), -1, "too far");
  assert.strictEqual(H.pickTarget([]), -1);
});

test("formView: the check runs once a second for NPCs this game hosts; a released NPC is no longer treated as hosted; tryHostIfNeed respects the release", () => {
  const upd = formView.slice(formView.indexOf("this.gmIsPlayerLook = !!model.appearance"), formView.indexOf("setDefaultAnimsDisabled(this.refrId, alreadyHosted ? false : true);"));
  assert.ok(upd.includes("alreadyHosted && refr.is3DLoaded()") && upd.includes("GM_HOST_CHECK_MS"), "only for what this game hosts, once a second");
  assert.ok(upd.includes('=== "released") alreadyHosted = false'), "let go at once (default animations back off, no movement sent)");
  const tryHost = formView.slice(formView.indexOf("private tryHostIfNeed("), formView.indexOf("private tryHostIfNeed(") + 400);
  assert.ok(tryHost.indexOf("isReleased(remoteId") > 0 && tryHost.indexOf("isReleased(remoteId") < tryHost.indexOf("lastTryHost[remoteId]"), "checked first");
  const tick = formView.slice(formView.indexOf("private gmHostedTick("), formView.indexOf("public gmIsPlayerLook"));
  assert.ok(tick.includes('storage["hosted"] = withoutHosted(') && tick.includes("markReleased("), "the hand-off drops it from the hosted list and remembers it");
  assert.ok(tick.includes("npc.getCombatState() === 0 && npc.isHostileToActor(me)") && tick.includes("isDetectedBy(npc)") && tick.includes("npc.startCombat("), "engage only when hostile, idle and detected");
  assert.ok(tick.includes("placeOf(ac) !== myPlace"), "only players in the same cell or worldspace");
});

// 2026-10-24: deer, bandits and draugr walked in the air or half in the ground, and some bodies vanished when killed
test("floating NPCs: a hosted NPC this game has not had loaded for 2 s is let go, so a game that has it loaded runs it on real ground", () => {
  assert.strictEqual(H.shouldReleaseUnloaded(0, 99999), false, "loaded: kept");
  assert.strictEqual(H.shouldReleaseUnloaded(1000, 2999), false, "a moment unloaded (a cell loading): kept");
  assert.strictEqual(H.shouldReleaseUnloaded(1000, 3000), true);
  const at = formView.indexOf("if (alreadyHosted && !refr.is3DLoaded()) {");
  assert.ok(at > 0 && at < formView.indexOf("setDefaultAnimsDisabled(this.refrId, alreadyHosted ? false : true);"), "decided before this game sends its movement");
  const block = formView.slice(at, formView.indexOf("} else this.gmUnloadedSince = 0;", at));
  assert.ok(block.includes('storage["hosted"] = withoutHosted(') && block.includes("markReleased(") && block.includes("alreadyHosted = false"), "dropped from the hosted list, not asked for again at once");
});

test("bodies: the server's death wins over a movement that still has the NPC alive; a dead NPC is built (a dead player is not), then made dead", () => {
  assert.strictEqual(H.movementDead(true, false), true, "the host a moment behind: not taken as a resurrection (that rebuilt the NPC and the body was gone)");
  assert.strictEqual(H.movementDead(false, false), false);
  assert.strictEqual(H.movementDead(undefined, true), true);
  assert.strictEqual(H.buildWhileDead(false), true, "an NPC's body");
  assert.strictEqual(H.buildWhileDead(true), false, "a player");
  assert.ok(formView.includes("model.movement.isDead = movementDead(model.isDead, model.movement.isDead);") && formView.includes("model.movement.isDead = gmDeadBackup;"), "around applyMovement, put back after");
  assert.ok(formView.indexOf("model.movement.isDead = movementDead(") < formView.indexOf("applyMovement(refr, model.movement, !!model.isMyClone);"));
  assert.ok(formView.includes("if (this.refrId === 0 && !buildWhileDead("), "the dead-spawn rule");
  const kill = formView.slice(formView.indexOf("this.applyAll(refr, model);"), formView.indexOf("gamemodeUpdateService.updateNeighbor("));
  assert.ok(kill.includes("model.isDead && actor && !actor.isDead() && actor.is3DLoaded()") && kill.includes('emit("applyDeathStateEvent", { actor, isDead: true })') && kill.includes("BODY_KILL_EVERY_MS"), "made dead once its body is in, at most once a second");
});

test("stuck moves: a move is never at speed 0; an NPC this game becomes the host of has its move stopped; drift breadcrumbs", () => {
  const apply = fs.readFileSync(path.join(__dirname, "..", "src", "sync", "movementApply.ts"), "utf8");
  assert.ok(apply.includes("const speed = Math.max(distance / time, GM_MIN_TRANSLATE_SPEED);") && apply.includes("const GM_MIN_TRANSLATE_SPEED = 100;"));
  const at = formView.indexOf("if (alreadyHosted && !this.gmWasHost) {");
  assert.ok(at > 0 && formView.slice(at, at + 300).includes("stopTranslation()"), "on the change to host");
  assert.ok(formView.includes("this.gmWasHost = alreadyHosted;"));
  const tick = formView.slice(formView.indexOf("private gmHostedTick("), formView.indexOf("public gmIsPlayerLook"));
  assert.ok(tick.indexOf('gmCrumb("drift "') > 0 && tick.indexOf('gmCrumb("drift "') < tick.indexOf("if (!others.length)"), "also when the host's player is alone");
});

test("its own animations back: an NPC this game hosts never replays the animations the server echoes to it (a replayed fall left it hanging in the air)", () => {
  const at = formView.indexOf("if (model.animation && alreadyHosted) {");
  assert.ok(at > 0, "the hosted case comes first");
  const block = formView.slice(at, formView.indexOf("} else if (model.animation) {", at));
  assert.ok(block.includes("this.animState.lastNumChanges = model.animation.numChanges;"), "taken as seen, so nothing old plays after a hand-off");
  assert.ok(!block.includes("applyAnimation("), "not played");
  const other = formView.slice(formView.indexOf("} else if (model.animation) {", at), formView.indexOf("this.animState.useAnimOverrides = false;", at));
  assert.ok(other.includes("applyAnimation(refr, model.animation, this.animState);"), "other games still play them");
});

test("locked height: a server NPC is not resurrected at its spawn; one that runs flat for 3 s is rebuilt where it stands with its gear kept, at most every 10 s", () => {
  assert.strictEqual(H.flatStep(null, [0, 0, 0]), false);
  assert.strictEqual(H.flatStep([0, 0, -10166], [600, 0, -10166]), true, "the elk: 600 units, not a unit up or down");
  assert.strictEqual(H.flatStep([0, 0, -10166], [600, 0, -10160]), false, "real ground goes up and down");
  assert.strictEqual(H.flatStep([0, 0, 0], [100, 0, 0]), false, "standing or walking slowly: not judged");
  const spawn = fs.readFileSync(path.join(__dirname, "..", "src", "view", "spawnProcess.ts"), "utf8");
  const skip = spawn.indexOf("if (ac && serverNpc) {");
  assert.ok(skip > 0 && skip < spawn.indexOf("return ac.resurrect()"), "a server NPC (no player look) skips Resurrect");
  assert.ok(spawn.includes("this.resurrect(refrId, beastLook, !appearance)"));
  const tick = formView.slice(formView.indexOf("private gmHostedTick("), formView.indexOf("public gmIsPlayerLook"));
  assert.ok(tick.includes("this.gmFlatSteps >= FLAT_STEPS && Date.now() - this.gmRegroundAt >= REGROUND_EVERY_MS"));
  assert.ok(tick.includes("npc.disable(false).then(") && tick.includes("again.enable(false).then(") && !tick.includes("npc.setPosition("), "rebuilt where it stands (a lift fell back)");
  assert.ok(tick.includes("applyEquipment(ac, gmEq)") && tick.includes("this.eqState = this.getDefaultEquipState();"), "its gear put back after (it was drawn anew: other loadouts)");
  assert.ok(formView.includes("this.gmLastEquipment = model.equipment;"));
  assert.ok(tick.includes('", cell " + gmCellOf(npc) + " (player " + gmCellOf(me) + ")"'), "the drift lines say which cell");
  assert.ok(tick.indexOf("reground") < tick.indexOf("if (!others.length)"), "also when its player is alone");
});

test("a server NPC is made persistent again (made temporary for one test, it floated all the same)", () => {
  assert.ok(formView.includes("const ref = marker.placeAtMe(baseForm, 1, persist, true) as ObjectReference;"));
  assert.ok(formView.includes("const atSpot = spawnAtSpot(baseForm, spawnPosition, spawnRotation, true);"), "a server creature: persistent");
  const flat = formView.split(String.fromCharCode(10)).map((l) => l.trim()).join(" ");
  assert.ok(flat.includes("if (gmBeastLookNow) { const atSpot = spawnAtSpot(baseForm, spawnPosition, spawnRotation);"), "a beast look: persistent as before");
});
