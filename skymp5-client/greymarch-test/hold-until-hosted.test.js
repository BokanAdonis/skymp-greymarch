"use strict";
// An NPC nobody hosts yet stays where the server has it (src/view/formView.ts): before, every game that did not host it ran its own copy with its own AI
// until the server picked a host, so the copies wandered apart and the server's position went stale.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const formView = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");
const START = "if (model.isHostedByOther || !this.movState.everApplied || (gmNobody && !gmGiveUp)) {";

test("only the host's game runs the AI: a game that does not host the NPC keeps playing the server's movement, hosted by another game or by nobody", () => {
  assert.ok(formView.includes(START));
  assert.ok(formView.includes("const gmNobody = !model.isHostedByOther && !alreadyHosted;"));
});

test("an NPC nobody hosts is held at most 3 s, then this game runs it as before (it never freezes); the breadcrumbs say which NPCs gave up and which became this game's", () => {
  assert.ok(formView.includes("const GM_HOLD_MAX_MS = 3000;"));
  assert.ok(formView.includes("const gmGiveUp = gmNobody && Date.now() - this.gmHoldSince > GM_HOLD_MAX_MS;"));
  assert.ok(/gmCrumb\("no host " \+ gmHex\(this\.refrId\)/.test(formView));
  assert.ok(/gmCrumb\("host " \+ gmHex\(this\.refrId\) \+ " after "/.test(formView));
});

test("while nobody hosts it, the game asks to (tryHostIfNeed: at most once a second), right after playing the server's movement", () => {
  const from = formView.indexOf(START);
  const branch = formView.slice(from, formView.indexOf("const remoteId = this.remoteRefrId;", from));
  assert.ok(branch.includes("applyMovement(refr, model.movement, !!model.isMyClone);"));
  assert.ok(/if \(!model\.isHostedByOther && !alreadyHosted\) \{[\s\S]*this\.tryHostIfNeed\(gmAc, gmRemote as number\);/.test(branch));
});
