"use strict";
// Every cast of the player's own spells is reported to the server ({ customPacketType: "greymarchCast", spell }); the gamemode (healing.js) applies the healing ones.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");

test("the player's own spell casts are sent to the server as greymarchCast", () => {
  assert.match(src, /this\.controller\.on\("spellCast", \(e: any\) => \{ try \{ if \(e && e\.spell && e\.caster && e\.caster\.getFormID\(\) === 0x14\) this\.greymarchCastSend\(e\.spell\.getFormID\(\)\);/);
  assert.match(src, /greymarchCastSend\(spell: number\): any \{\s+var message = \{ t: MsgType\.CustomPacket, contentJsonDump: JSON\.stringify\(\{ customPacketType: "greymarchCast", spell: spell >>> 0 \}\) \};/);
});
