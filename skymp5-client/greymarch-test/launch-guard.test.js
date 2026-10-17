"use strict";
// The game joins by itself only when the launcher's Play started it (greymarch/launchGuard.ts): a game started from Vortex's Play or an SKSE shortcut may
// number the mods differently from the server (modded armor others wear shows as nothing, 2026-10-17), so a login from an earlier start is not used.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (rel, mods = {}) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  return mod.exports;
};
const { decide, FRESH_MS, LaunchGuard } = load("greymarch/launchGuard.ts");

const NOW = 1_800_000_000_000;
const login = (extra = {}) => ({ session: "s", masterApiId: 1, discordUsername: "x", ...extra });

test("a login written by Play for this start joins", () => {
  assert.strictEqual(decide(login({ greymarchLaunchAt: NOW - 90 * 1000 }), NOW, false), "connect");
  assert.strictEqual(decide(login({ greymarchLaunchAt: NOW - FRESH_MS + 1000 }), NOW, false), "connect");
});

test("a login from an earlier start, a nonsense time, or no login at all does not join", () => {
  assert.strictEqual(decide(login({ greymarchLaunchAt: NOW - FRESH_MS - 1 }), NOW, false), "stale");
  assert.strictEqual(decide(login({ greymarchLaunchAt: NOW + 5 * 60 * 1000 }), NOW, false), "stale", "from the future");
  assert.strictEqual(decide(login({ greymarchLaunchAt: "soon" }), NOW, false), "stale");
  assert.strictEqual(decide(null, NOW, false), "missing");
  assert.strictEqual(decide({ masterApiId: 1 }, NOW, false), "missing", "no session in it");
});

test("an older launcher's login (no time) joins as before; once joined, every reconnect does", () => {
  assert.strictEqual(decide(login(), NOW, false), "connect");
  assert.strictEqual(decide(null, NOW, true), "connect");
  assert.strictEqual(decide(login({ greymarchLaunchAt: 1 }), NOW, true), "connect");
  const g = new LaunchGuard();
  assert.strictEqual(g.refused, "");
  assert.strictEqual(g.joinedWith, null);
});

test("the auth service, bridge and connecting page are wired to it", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");
  assert.match(auth, /launchDecide\(authData, Date\.now\(\), !!launchGuard\.joinedWith\)/);
  assert.match(auth, /launchGuard\.refused = verdict/);
  assert.match(auth, /case 'greymarchHold':\s*case 'greymarchSelect':\s*(\/\/[^\n]*\n\s*)*this\.loggingStartMoment = 0;/,"the 15 s login clock stops once the server holds the player on the select screen");
  const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  assert.match(bridge, /if \(launchGuard\.refused\)/);
  assert.match(bridge, /customPacketType: "greymarchLoadOrder", full: full, light: light/);
});
