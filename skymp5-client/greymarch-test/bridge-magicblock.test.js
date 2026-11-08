"use strict";
// NPC raise-the-dead and summons (gamemode magicblock.js): the list is taken in, and an effect on it is ended the frame after it starts when an NPC cast it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

test("greymarchMagicBlock is let through and kept as a set of effect IDs", () => {
  assert.match(auth, /case 'greymarchMagicBlock':/);
  assert.match(src, /if \(type === "greymarchMagicBlock"\) \{ var mb: any = \{\};/);
});

test("a listed effect is queued from the game event and ended in the update, only when an NPC (a real base record) cast it", () => {
  assert.match(src, /this\.controller\.on\("magicEffectApply", \(e: any\) => \{ try \{ if \(e && e\.effect && e\.activeEffect && this\.greymarchMagicBlock && this\.greymarchMagicBlock\[e\.effect\.getFormID\(\) >>> 0\]\)/);
  assert.match(src, /this\.greymarchMagicBlockDrive\(\); \/\/ NPC raise-the-dead/);
  // the player's own effect: left alone, unless it is a summon and the server places summons (2026-11-07, gamemode summons.js)
  assert.match(src, /if \(q\[i\]\.caster === 0x14\) \{ if \(this\.greymarchSummonFx && this\.greymarchSummonFx\[q\[i\]\.effect\]\) \{ q\[i\]\.active\.dispel\(\);[^\n]*\} continue; \}/);
  assert.match(src, /if \(!baseId \|\| baseId >= 0xff000000\) continue;/);
  assert.match(src, /q\[i\]\.active\.dispel\(\);/);
});

test("a summon of this player's that summons or raises the dead (2026-11-07, the owner: the Lord of Bindings only tried to spawn something): the server is told, the spell is taken from it, a summoning spell given back later", () => {
  assert.match(src, /if \(mine && caster\) this\.greymarchSummonMagic\(caster, remote, q\[i\]\.effect, mine\);/);
  assert.match(src, /customPacketType: "greymarchSummon", effect: effect >>> 0, by: remote >>> 0/);
  assert.match(src, /caster\.removeSpell\(taken\[t\]\)/);
  assert.match(src, /a\.addSpell\(o\.spells\[k\], false\)/);
  assert.match(src, /parent: Number\(x && x\.parent\) >>> 0/);
});
