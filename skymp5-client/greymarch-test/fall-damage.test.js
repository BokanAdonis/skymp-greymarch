"use strict";
// fallDamageService.ts: gentler falls (2026-10-27). The game's fall settings are set once the game runs, and the client registers it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}

const { FallDamageService, FALL_DAMAGE_SETTINGS } = load("fallDamageService.ts", { "./clientListener": { ClientListener: class {} } });
// Skyrim's formula: nothing below the minimum, then ((height - min) * mult) ^ exponent
const damage = (s, height) => (height <= s.fJumpFallHeightMin ? 0 : Math.pow((height - s.fJumpFallHeightMin) * s.fJumpFallHeightMult, s.fJumpFallHeightExponent));
const VANILLA = { fJumpFallHeightMin: 600, fJumpFallHeightMult: 0.1, fJumpFallHeightExponent: 1.45 };
const M = 70; // game units per metre

test("the three fall settings are set once, on the first update, to 900 / 0.07 / 1.45", () => {
  const set = [], once = {};
  const sp = { Game: { setGameSettingFloat: (n, v) => set.push([n, v]) } };
  new FallDamageService(sp, { once: (ev, f) => (once[ev] = f) });
  assert.deepStrictEqual(set, [], "nothing before the game runs");
  once.update();
  assert.deepStrictEqual(set, [["fJumpFallHeightMin", 900], ["fJumpFallHeightMult", 0.07], ["fJumpFallHeightExponent", 1.45]]);
});

test("falls are gentler than vanilla but a long drop still kills", () => {
  assert.strictEqual(damage(FALL_DAMAGE_SETTINGS, 12 * M), 0, "12 m: no damage now");
  assert.ok(damage(VANILLA, 12 * M) > 20, "it hurt before");
  const now = damage(FALL_DAMAGE_SETTINGS, 20 * M), before = damage(VANILLA, 20 * M);
  assert.ok(now < before * 0.5 && now > before * 0.2, `20 m: ${now.toFixed(0)} now against ${before.toFixed(0)} before`);
  assert.ok(damage(FALL_DAMAGE_SETTINGS, 40 * M) > 400, "40 m is still deadly");
});

test("the client starts the service", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "src", "index.ts"), "utf8");
  assert.match(index, /import \{ FallDamageService \} from "\.\/services\/services\/fallDamageService";/);
  assert.match(index, /new FallDamageService\(sp, controller\),/);
});
