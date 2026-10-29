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
  assert.ok(tick.includes("(this.gmFlatSteps >= FLAT_STEPS || this.gmGroundForce) && Date.now() - this.gmRegroundAt >= REGROUND_EVERY_MS"), "flat for 3 s, or the server saw it off the ground (2026-10-28)");
  assert.ok(tick.includes("npc.disable(false).then(") && tick.includes("again.enable(false).then("), "rebuilt where it stands");
  const reground = tick.slice(tick.indexOf("if ((this.gmFlatSteps >= FLAT_STEPS || this.gmGroundForce)"), tick.indexOf("if (Date.now() - this.gmDriftAt"));
  assert.ok(!reground.includes("setPosition("), "the LOCKED HEIGHT rebuild never lifts it (a lift fell back, 2026-10-24)");
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

test("no reground for a giant or a mammoth (2026-10-28: a giant charging on open ground was rebuilt four times in 90 s and once dropped and spawned again)", () => {
  for (const n of ["Giant", "giant", "Mammoth", "Frost Giant"]) assert.strictEqual(H.regroundExempt(n), true, n);
  for (const n of ["Elk", "Deer", "Nord", "Wolf", "Frostbite Spider", "Mudcrab", "Giantess Spider", "", null, undefined]) assert.strictEqual(H.regroundExempt(n), false, String(n));
  assert.ok(formView.includes("this.gmFlatSteps = flatStep(this.gmLastPos, gmNow) && !regroundExempt(gmRaceName) ? this.gmFlatSteps + 1 : 0;"), "the flat count never grows for them, so they are never rebuilt");
});

test("an NPC the server saw off the ground is put down by its host, its fight kept (2026-10-28, the owner: bandits still on air and in the ground)", () => {
  const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.ok(bridge.includes('if (type === "greymarchGround")') && bridge.includes("__gmGroundFix"), "the bridge keeps the server's word");
  const view = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  const tick = view.slice(view.indexOf("private gmHostedTick("), view.indexOf("private gmHostedTick(") + 20000);
  const fix = tick.slice(tick.indexOf("PUT DOWN BY ITS HOST"), tick.indexOf("const others: Actor[] = [];"));
  assert.ok(fix.includes("npc.stopTranslation()"), "first its stuck move is stopped (it falls by itself)");
  const stop = fix.indexOf("npc.stopTranslation()"), set = fix.indexOf("npc.moveTo(npc, 0, 0, gmGround + GM_GROUND_LIFT - gmZ, false)"), rebuild = fix.indexOf("this.gmGroundForce = true");
  assert.ok(stop > 0 && set > stop && rebuild > set, "its move stopped, then set just over the ground under it, then rebuilt (2026-10-28: the rebuild alone left it up)");
  assert.ok(tick.includes("(this.gmFlatSteps >= FLAT_STEPS || this.gmGroundForce)"), "the rebuild takes the server's word");
  assert.ok(!fix.includes("moveTo(me") && !fix.includes("moveTo(target"), "never moved away: only onto itself");
});

test("breadcrumbs follow a ground word from the server to the host check (2026-10-28: the server told the games and nothing happened)", () => {
  const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.ok(bridge.includes('"ground word "'), "each word as it arrives (the first 40)");
  const view = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.ok(view.includes('gmCrumb("ground seen "'), "and the host check that finds it");
});

test("the ground word reaches the bridge: authService passes greymarchGround on (2026-10-28: it was not on the list, so every word was dropped and no bandit came down)", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  const sw = auth.slice(auth.indexOf("case 'greymarchGround'"), auth.indexOf("this.gm.greymarchPacket(msgContent)"));
  assert.ok(auth.includes("case 'greymarchGround'") && sw.length > 0 && !sw.includes("break;"), "listed among the packets handed to the bridge");
});

test("the ground under the NPC's own feet is read from the land the server sent, 5 x 5 heights (2026-10-28: on a steep hillside one height was 100+ too high)", () => {
  const view = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  const src = view.slice(view.indexOf("function gmGroundUnder("), view.indexOf("\n}", view.indexOf("function gmGroundUnder(")) + 2);
  const js = ts.transpileModule(src + "\nmodule.exports = gmGroundUnder;", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} }; new Function("module", "exports", js)(mod, mod.exports);
  const under = mod.exports;
  // a hillside falling 1 unit per unit to the east, centred on x 1000
  const h = []; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) h.push(-(1000 + i * 64));
  const fix = { z: -500, grid: { x: 1000, y: 0, step: 64, h } };
  assert.strictEqual(under(fix, 1000, 0), -1000, "right under the server's spot");
  assert.strictEqual(under(fix, 1032, 10), -1032, "between the points");
  assert.strictEqual(under(fix, 5000, 0), -500, "off the grid: the word's one height");
  assert.strictEqual(under({ z: -7 }, 0, 0), -7, "no grid (an older server): the word's one height");
  const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.ok(bridge.includes("msg.grid.h.length === 25"), "the bridge keeps a well-formed grid only");
});

test("a bandit put down keeps its fight: back at its target, weapon drawn, after it is set down or rebuilt (2026-10-28, the owner: they came down with no weapon and walked around)", () => {
  const view = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  const help = view.slice(view.indexOf("private gmGroundRefight("), view.indexOf("private gmHostedTick("));
  assert.ok(help.includes("npc.startCombat(target)") && help.includes("npc.drawWeapon()"), "back at it, weapon drawn");
  const tick = view.slice(view.indexOf("private gmHostedTick("), view.indexOf("private gmHostedTick(") + 20000);
  assert.ok(tick.includes("this.gmGroundTargetId = t.getFormID()"), "its target remembered when it is first put down");
  const setAt = tick.indexOf("npc.moveTo(npc, 0, 0, gmGround + GM_GROUND_LIFT - gmZ, false)"); assert.ok(setAt > 0 && tick.indexOf("this.gmGroundRefight(npc)", setAt) - setAt < 200, "right after it is set down");
  assert.ok(tick.includes("if (ac) this.gmGroundRefight(ac);"), "after it is rebuilt");
});
