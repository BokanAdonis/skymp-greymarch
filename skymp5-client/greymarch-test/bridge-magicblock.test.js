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

test("another player's summon (2026-11-07, the owner: the gargoyles were still hostile): this game's copy is out of its factions, unaggressive and kept out of fights", () => {
  assert.match(src, /if \(\(s\.owner >>> 0\) !== me\) \{/);
  assert.match(src, /a\.removeFromAllFactions\(\); a\.setActorValue\("Aggression", 0\); a\.stopCombat\(\);/);
  assert.match(src, /if \(a\.isInCombat\(\)\) a\.stopCombat\(\);/);
});

test("a summon's summon spell is seen at the cast too (2026-11-07, the test: the Lord of Bindings' Bound Churl effect never landed)", () => {
  assert.match(src, /else if \(e && e\.spell && e\.caster\) this\.greymarchSummonCastBy\(e\.caster, e\.spell\);/);
  assert.match(src, /if \(caster\) this\.greymarchSummonMagic\(caster, remote, effect, entry\);/);
});

test("this player's summons take up their fights (2026-11-07, the owner: when I got hit they did not get marked as hostile)", () => {
  assert.match(src, /greymarchHit\(e: any\): any \{\s*this\.greymarchSummonHit\(e\);/);
  assert.match(src, /var other = t === 0x14 \? e\.aggressor : g === 0x14 \? e\.target : null;/);
  assert.match(src, /a\.startCombat\(fa\);/);
});

test("a summon of this player's gets the F7 Summons health and damage here (2026-11-07, the owner: the balancing still did not work)", () => {
  assert.match(src, /health: Number\(x && x\.health\) \|\| 0, damage: Number\(x && x\.damage\) \|\| 0/);
  assert.match(src, /a\.setActorValue\("Health", s\.health > 0 \? s\.health : st\.hp\);/);
  assert.match(src, /a\.setActorValue\("AttackDamageMult",/);
});

test("a summon of this player's never fights them and keeps up (2026-11-07, the owner: when I walk the summons do not follow me)", () => {
  assert.match(src, /if \(a\.isInCombat\(\) && ctm && \(ctm\.getFormID\(\) >>> 0\) === 0x14\) \{ a\.stopCombat\(\);/);
  assert.match(src, /if \(far > 4000\) \{ try \{ a\.moveTo\(player,/);
  assert.match(src, /far > 300 && now - \(fat\[s\.actor\] \|\| 0\) > 5000/);
});

test("this player's own summon is never pulled out of its idle or furniture and sent at a player (2026-11-07, the owner: the summons still did not follow)", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.match(fv, /let gmOwnSummon = false;/);
  assert.match(fv, /if \(!gmOwnSummon && gmSitNow - this\.gmSitWakeAt >= GM_SIT_WAKE_MS\)/);
  assert.match(fv, /if \(!gmOwnSummon && gmINow - this\.gmIdleWakeAt >= GM_SIT_WAKE_MS\)/);
});

test("a summon that does not follow is written down and walked to its caster (2026-11-08, the owner: the summons still did not follow)", () => {
  assert.match(src, /a\.keepOffsetFromActor\(player, -90, -140, 0, 0, 0, 0, 350, 120\); a\.evaluatePackage\(\);/);
  assert.match(src, /if \(stuck\) \{ try \{ var pr: any = a\.pathToReference\(player, 1\.0\);/);
});

test("a hosted NPC's follow is not cleared every frame when it is this player's own summon (2026-11-08, the owner: the summons still did not follow)", () => {
  const fv = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
  assert.match(fv, /const gmIsOwnSummon = \(remoteId: any\): boolean =>/);
  assert.match(fv, /if \(alreadyHosted && !gmIsOwnSummon\(this\.remoteRefrId\)\) \{\s*Actor\.from\(refr\)\?\.clearKeepOffsetFromActor\(\);/);
  assert.match(fv, /if \(!gmIsOwnSummon\(remoteId\)\) ac\.clearKeepOffsetFromActor\(\);/);
});
