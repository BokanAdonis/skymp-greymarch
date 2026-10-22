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
  assert.match(fn, /sendAnimationEvent\(ac, "attackStart"\)/);
  assert.match(fn, /applyMovement\(refr, m as Movement, false\)/);
  assert.match(formView, /\(model as any\)\.greymarchPuppet === true/);
});
