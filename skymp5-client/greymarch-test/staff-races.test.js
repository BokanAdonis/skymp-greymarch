"use strict";
// RACES FOR STAFF ONLY (bridge.ts greymarchStaffRacesTick, 2026-11-11, the owner: only GMs see the Dremora in the race menu)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("the races the server allows get the Playable flag; one no longer allowed is cleared; nothing is done twice", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
  const start = src.indexOf("    greymarchStaffRacesTick(): any {");
  const end = src.indexOf("    // GREYMARCH: OWN HEIGHT (2026-11-10");
  const body = src.slice(start, end).replace("(): any", "()").replace("var want: number[] | undefined = ", "var want = ").replace("had: number[] = ", "had = ").replace("set: number[] = []", "set = []");
  const Cls = new Function("return class {\n" + body + "\n};")();
  const b = new Cls();
  const flags = { 0x131f0: false };
  const calls = [];
  b.sp = { Game: { getFormEx: (id) => ({ id }) }, Race: { from: (f) => (f && f.id in flags ? { isRaceFlagSet: () => flags[f.id], setRaceFlag: (n) => { assert.strictEqual(n, 1); flags[f.id] = true; calls.push("set"); }, clearRaceFlag: (n) => { assert.strictEqual(n, 1); flags[f.id] = false; calls.push("clear"); } } : null) } };
  b.greymarchLog = () => {};
  b.greymarchStaffRacesTick();
  assert.deepStrictEqual(calls, [], "nothing until the server says");
  b.greymarchStaffRacesWant = [0x131f0]; b.greymarchStaffRacesTick(); b.greymarchStaffRacesTick();
  assert.deepStrictEqual(calls, ["set"]); assert.strictEqual(flags[0x131f0], true);
  b.greymarchStaffRacesWant = []; b.greymarchStaffRacesTick();
  assert.deepStrictEqual(calls, ["set", "clear"]); assert.strictEqual(flags[0x131f0], false);
});
