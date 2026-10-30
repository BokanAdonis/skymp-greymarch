"use strict";
// F7 (and H, B, F6, and F8 for testers) are for staff: the game asks the server ({ op: "check" }) before it opens the panel, and a player with no rank sees nothing.
// The server refuses them everything anyway (gamemode admin.js); this is the game's half.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8").replace(/\r\n/g, "\n");

// the two methods, taken from bridge.ts and run on a fake bridge (their bodies are plain JavaScript)
function method(name) {
  const m = src.match(new RegExp(String.raw`\n    ${name}\(([^)]*)\): [a-z]+ \{\n([\s\S]*?)\n    \}\n`));
  assert.ok(m, `${name} is in bridge.ts`);
  return new Function(m[1].replace(/\?/g, "").replace(/: any/g, ""), m[2]);
}
const staffOpen = method("greymarchStaffOpen");
const staffReply = method("greymarchStaffReply");
function fakeBridge() {
  const b = { sent: [], shown: [], hidden: 0, logs: [] };
  b.greymarchAdminSend = (d) => b.sent.push(d);
  b.greymarchAdminShow = (mode) => { b.shown.push(mode); b.greymarchAdminOn = true; };
  b.greymarchAdminHide = () => { b.hidden++; b.greymarchAdminOn = false; };
  b.greymarchLog = (t) => b.logs.push(t);
  b.greymarchEmoteHide = () => {};
  b.open = (mode) => staffOpen.call(b, mode);
  b.reply = (msg) => staffReply.call(b, msg);
  return b;
}

test("F7 for a player with no rank: the server is asked, says no, and nothing opens", () => {
  const b = fakeBridge();
  b.open(undefined);
  assert.deepStrictEqual(b.sent.map((d) => d.op), ["check"]);
  assert.deepStrictEqual(b.shown, [], "nothing shown while waiting");
  assert.strictEqual(b.reply({ rid: b.sent[0].rid, ok: false, error: "The staff panel is for staff only.", staffOnly: true }), true);
  assert.deepStrictEqual(b.shown, []);
  assert.strictEqual(b.greymarchStaffOk, false);
  assert.strictEqual(b.greymarchNoticeQueue, undefined, "a quiet no: no message on screen");
  b.open(undefined);
  assert.strictEqual(b.sent.length, 2, "asked again next time (a rank given meanwhile counts)");
});

test("F7 for staff: opens on the server's yes, and later presses open at once without asking", () => {
  const b = fakeBridge();
  b.open(undefined);
  assert.strictEqual(b.reply({ rid: b.sent[0].rid, ok: true, data: { tier: "Support" } }), true);
  assert.deepStrictEqual(b.shown, [undefined]);
  b.greymarchAdminOn = false;
  b.open("build");
  assert.deepStrictEqual(b.shown, [undefined, "build"]);
  assert.strictEqual(b.sent.length, 1);
});

test("a late yes (over 5 seconds) or a yes while another window is up does not throw the panel open", () => {
  const b = fakeBridge();
  b.open(undefined);
  b.greymarchStaffAsk.at -= 6000;
  b.reply({ rid: b.sent[0].rid, ok: true, data: {} });
  assert.deepStrictEqual(b.shown, []);
  assert.strictEqual(b.greymarchStaffOk, true, "the yes is still remembered");
  const c = fakeBridge();
  c.open(undefined);
  c.greymarchChatTyping = true;
  c.reply({ rid: c.sent[0].rid, ok: true, data: {} });
  assert.deepStrictEqual(c.shown, []);
});

test("a staffOnly refusal while the panel is open (rank taken away, off duty) closes it, says why and forgets the yes; other replies go on to the page", () => {
  const b = fakeBridge();
  b.greymarchStaffOk = true;
  b.greymarchAdminOn = true;
  assert.strictEqual(b.reply({ rid: 4, ok: false, error: "You are off duty. /enable puts you back on duty.", staffOnly: true }), false, "the page still gets its reply");
  assert.deepStrictEqual([b.hidden, b.greymarchStaffOk, b.greymarchNoticeQueue], [1, false, ["You are off duty. /enable puts you back on duty."]]);
  assert.strictEqual(b.reply({ rid: 5, ok: false, error: "Your rank cannot do that." }), false);
  assert.strictEqual(b.hidden, 1, "an ordinary refusal changes nothing");
});

test("wiring: F7, H, B, F6 and F8 (testers) all go through the server check; replies reach it first", () => {
  assert.match(src, /if \(code === 65 && !this\.greymarchAdminOn && !this\.greymarchMenuOn\) \{ if \(this\.greymarchEmoteOn\) this\.greymarchEmoteHide\(\); this\.greymarchStaffOpen\(\); \}/);
  for (const mode of ["dungeons", "tester"]) assert.ok(src.includes(`this.greymarchStaffOpen("${mode}"); }`), mode);
  for (const mode of ["encounters", "build"]) assert.ok(src.includes(`this.greymarchStaffKeyWanted = { at: Date.now(), mode: "${mode}"`), mode + ": H and B go through the game-menu check first (greymarchStaffKeyPending)");
  assert.ok(src.includes("this.greymarchStaffOpen(want.mode);"), "and then through the server check");
  assert.doesNotMatch(src, /if \(code === 66 [^\n]*this\.greymarchAdminShow\("tester"\)/, "F8 asks too; the server lets testers in on the test server only");
  assert.match(src, /if \(type === "greymarchAdminReply" && this\.greymarchStaffReply\(msg\)\) return;[^\n]*\n\s*if \(type === "greymarchAdminReply"\) \{ var brids/);
  assert.doesNotMatch(src, /greymarchHotkeyOpen[\s\S]{0,200}code === 65[^\n]*greymarchAdminShow\(\)/, "F7 never opens the panel without asking");
});
