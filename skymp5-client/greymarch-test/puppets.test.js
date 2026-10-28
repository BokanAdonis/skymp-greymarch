"use strict";
// Server-driven animals (gamemode wildlifebrain.js): the game keeps the server's frames (bridge.ts greymarchBeastFrames) and plays them on the animal
// instead of hosting it (formView.ts gmPuppetMove).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const read = (...p) => fs.readFileSync(path.join(__dirname, "..", "src", ...p), "utf8");
const bridgeSrc = read("greymarch", "bridge.ts");
const formView = read("view", "formView.ts");
const auth = read("services", "services", "authService.ts");

function bridgeClass() {
  const js = ts.transpileModule(bridgeSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  const stub = new Proxy({}, { get: () => ({}) });
  new Function("require", "exports", "module", js)(() => stub, mod.exports, mod);
  return mod.exports.GreymarchBridge;
}

test("frames are kept by the animal's server id, malformed ones dropped, old ones swept after a minute", () => {
  const B = bridgeClass();
  const storage = {};
  const self = { sp: { storage } };
  const keep = (msg) => B.prototype.greymarchBeastFrames.call(self, msg);
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    keep({ f: [[0xff000aa1, 100, 200, 300, 90, 450, "run"], [0xff000aa2, "x", 0, 0, 0, 0, "walk"], [0, 1, 2, 3, 4, 5, "idle"], "junk"] });
    const frames = storage.greymarchBeastFrames;
    assert.deepStrictEqual(Object.keys(frames), [String(0xff000aa1)]);
    assert.deepStrictEqual(frames[String(0xff000aa1)], { pos: [100, 200, 300], heading: 90, speed: 450, anim: "run", at: t });
    t += 70000;
    keep({ f: [[0xff000aa3, 1, 2, 3, 0, 0, "idle"]] });
    assert.ok(!frames[String(0xff000aa1)], "swept");
    assert.ok(frames[String(0xff000aa3)]);
    keep(null); keep({ f: "nope" });
  } finally { Date.now = realNow; }
});

test("the packet reaches the bridge (authService.ts) and the bridge hands it to the frame store", () => {
  assert.match(auth, /case 'greymarchBeast':/);
  assert.match(bridgeSrc, /if \(type === "greymarchBeast"\) \{ this\.greymarchBeastFrames\(msg\); return; \}/);
});

test("a puppet is never hosted and never fights on its own: formView plays the frame (walk, run, stand, attack) and leaves SkyMP's hosting path alone", () => {
  const branch = formView.slice(formView.indexOf("const gmPuppet = "), formView.indexOf("} else if (model.movement) {"));
  assert.ok(branch.includes("this.gmPuppetMove(refr, model)"), "the puppet branch");
  assert.ok(!/tryHost/.test(branch), "no host attempt for a puppet");
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(!/tryHost/.test(fn));
  assert.match(fn, /setActorValue\("Aggression", 0\)/);
  assert.match(fn, /setActorValue\("AttackDamageMult", 0\)/, "its own attack never hurts this player: the server already counted the bite");
  assert.match(fn, /stopCombat\(\)/);
  assert.match(fn, /f\.anim === "run" \? "Running" : f\.anim === "walk" \? "Walking" : "Standing"/);
  assert.match(fn, /sendAnimationEvent\(ac, ev\)/); // the creature's own attack event, or attackStart (2026-10-28)
  assert.match(fn, /applyMovement\(refr, m as Movement, false\)/);
  assert.match(formView, /\(model as any\)\.greymarchPuppet === true/);
});

test("frames also go through a global, the one object kept in storage too, and formView reads the global first (2026-10-28: the owner's deer never moved though 219 frames were sent); breadcrumbs say what happened", () => {
  const B = bridgeClass();
  const storage = {};
  const crumbs = [];
  const self = { sp: { storage }, greymarchCrumb: (t) => crumbs.push(t) };
  const gl = Function("return this")();
  delete gl.__gmBeastFrames;
  try {
    B.prototype.greymarchBeastFrames.call(self, { f: [[0xff0000b8, 1, 2, 3, 0, 100, "walk"]] });
    assert.ok(gl.__gmBeastFrames && gl.__gmBeastFrames[String(0xff0000b8)], "in the global");
    assert.strictEqual(storage.greymarchBeastFrames, gl.__gmBeastFrames, "the same object in storage");
    B.prototype.greymarchBeastFrames.call(self, { f: [[0xff0000b9, 1, 2, 3, 0, 100, "walk"]] });
    assert.deepStrictEqual(Object.keys(gl.__gmBeastFrames).sort(), [String(0xff0000b8), String(0xff0000b9)].sort(), "kept adding to the one object");
    assert.deepStrictEqual(crumbs, ["beast: first frames from the server (1 animal(s), e.g. ff0000b8)"], "one breadcrumb");
  } finally { delete gl.__gmBeastFrames; }
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes('(Function("return this")() as any).__gmBeastFrames || storage["greymarchBeastFrames"]'), "formView reads the global first");
  assert.ok(fn.includes(": first frame ") && fn.includes(": no frame after 3 s"), "and leaves a breadcrumb either way");
});

test("a server-driven animal's own AI never runs or fights, and a dead one is never moved or brought back (2026-10-28, the owner: hit, they jumped back and forth; they could not be killed)", () => {
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes('ac.setActorValue("Confidence", 4)'), "foolhardy: never flees on its own");
  assert.ok(fn.includes('ac.setActorValue("Assistance", 0)'), "never helps another on its own");
  assert.ok(fn.includes('ac.setActorValue("Aggression", 0)'), "never fights on its own");
  const dead = fn.indexOf("if (model.isDead || ac.isDead()) return \"\";");
  assert.ok(dead > 0 && dead < fn.indexOf("applyMovement(refr, m as Movement, false)"), "a body: nothing is played on it");
});

test("a server-driven animal's health bar follows the server's health in its frames (2026-10-28, the owner: it died but its bar never went down)", () => {
  const B = bridgeClass();
  const storage = {};
  const self = { sp: { storage } };
  const gl = Function("return this")();
  delete gl.__gmBeastFrames;
  try {
    B.prototype.greymarchBeastFrames.call(self, { f: [[0xff0000c1, 1, 2, 3, 0, 0, "idle", 0.42], [0xff0000c2, 1, 2, 3, 0, 0, "idle"], [0xff0000c3, 1, 2, 3, 0, 0, "idle", 7]] });
    const fr = gl.__gmBeastFrames;
    assert.strictEqual(fr[String(0xff0000c1)].hp, 0.42);
    assert.strictEqual(fr[String(0xff0000c2)].hp, undefined, "an older server: no health, the bar as before");
    assert.strictEqual(fr[String(0xff0000c3)].hp, 1, "kept to 0..1");
  } finally { delete gl.__gmBeastFrames; }
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes('...(typeof f.hp === "number" ? { healthPercentage: Math.max(0.02, f.hp) } : {})'), "the movement played carries it (applyMovement sets the bar), never 0 (the death comes from the server, with its sound)");
});

test("a server-driven animal's attack is let through the anim hook (2026-10-28, the owner: hostile encounter animals did no attack animation)", () => {
  const js = ts.transpileModule(read("sync", "animation.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  let hook = null;
  const sp = new Proxy({}, { get: (_, k) => (k === "hooks" ? { sendAnimationEvent: { add: (h) => { hook = h; } } } : k === "printConsole" ? () => {} : {}) });
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((m) => (m === "skyrimPlatform" ? sp : {}), mod.exports, mod);
  const A = mod.exports;
  A.setupHooks();
  A.setDefaultAnimsDisabled(0xff0000c1, true);
  const send = (name) => { const ctx = { selfId: 0xff0000c1, animEventName: name }; hook.enter(ctx); return ctx.animEventName; };
  assert.strictEqual(send("attackStart"), "", "an attack nobody allowed is blanked, as before");
  A.allowAttackAnim(0xff0000c1, "attackStart");
  assert.strictEqual(send("attackStart"), "attackStart", "allowed: it plays");
  assert.strictEqual(send("attackStart"), "", "once");
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes('const ev = f.ev || "attackStart";') && fn.includes("try { allowAttackAnim(ac.getFormID(), ev); Debug.sendAnimationEvent(ac, ev);"), "gmPuppetMove allows the creature's attack (the server's, or attackStart) before sending it");
});

test("a hunting server-driven animal stands in its fighting stance, where its attack plays (2026-10-28, the owner: still no attack animations)", () => {
  const B = bridgeClass();
  const gl = Function("return this")();
  delete gl.__gmBeastFrames;
  try {
    B.prototype.greymarchBeastFrames.call({ sp: { storage: {} } }, { f: [[0xff0000d1, 1, 2, 3, 0, 0, "run", 1, 1], [0xff0000d2, 1, 2, 3, 0, 0, "idle", 1, 0], [0xff0000d3, 1, 2, 3, 0, 0, "idle", 1]] });
    const fr = gl.__gmBeastFrames;
    assert.strictEqual(fr[String(0xff0000d1)].hunt, 1);
    assert.strictEqual(fr[String(0xff0000d2)].hunt, undefined);
    assert.strictEqual(fr[String(0xff0000d3)].hunt, undefined, "an older server: not hunting");
  } finally { delete gl.__gmBeastFrames; }
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes('isWeapDrawn: f.hunt === 1 || f.anim === "attack"'), "hunting or attacking: the fighting stance");
});

test("a server-driven animal's attack is its creature's own event from the server (2026-10-28, the owner: still not fighting)", () => {
  const B = bridgeClass();
  const gl = Function("return this")();
  delete gl.__gmBeastFrames;
  try {
    B.prototype.greymarchBeastFrames.call({ sp: { storage: {} } }, { f: [[0xff0000e1, 1, 2, 3, 0, 0, "attack", 1, 1, "attackStart_Attack2"], [0xff0000e2, 1, 2, 3, 0, 0, "attack", 1, 1], [0xff0000e3, 1, 2, 3, 0, 0, "attack", 1, 1, "Kill(); x"], [0xff0000e4, 1, 2, 3, 0, 0, "attack", 1, 1, "IdleForceDefaultState"]] });
    const fr = gl.__gmBeastFrames;
    assert.strictEqual(fr[String(0xff0000e1)].ev, "attackStart_Attack2");
    assert.strictEqual(fr[String(0xff0000e2)].ev, undefined, "an older server: attackStart");
    assert.strictEqual(fr[String(0xff0000e3)].ev, undefined, "only a plain event name");
    assert.strictEqual(fr[String(0xff0000e4)].ev, undefined, "only an attack");
  } finally { delete gl.__gmBeastFrames; }
});

test("a lunge is carried by its animation, not placed by the frames too (2026-10-28, the owner's clip: the wolf leapt past the player and slid back)", () => {
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  const lunge = fn.indexOf("/power|lunge/i.test(f.ev)");
  const apply = fn.indexOf("applyMovement(refr");
  assert.ok(lunge > 0 && lunge < apply, "a lunge is played before any movement is applied");
  assert.ok(fn.indexOf("if (now < this.gmPuppetLungeUntil) return \"\";") > lunge && fn.indexOf("if (now < this.gmPuppetLungeUntil) return \"\";") < apply, "and none is applied while it lasts");
  assert.match(formView, /const GM_PUPPET_LUNGE_MS = \d+;/);
});

test("a hunting animal is not placed ahead of its frame (2026-10-28, the owner's clip: wolves teleported on the player)", () => {
  const fn = formView.slice(formView.indexOf("private gmPuppetMove("), formView.indexOf("private tryHostIfNeed("));
  assert.ok(fn.includes("speed: f.hunt === 1 ? 0 : f.speed"));
});
