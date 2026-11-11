"use strict";
// The player's spells at login (greymarch/spellBook.ts, remoteServer.ts, spSnippetService.ts): the server's list from the body message plus every
// AddSpell/RemoveSpell it sent for that actor, even ones that came while the body was held, so a login cannot lose Magic or Beast Form.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", ...rel.split("/")), "utf8");
const load = (rel) => {
  const js = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};
const { SpellBook, EDIT_KEEP_MS, RESTORE_AT_S } = load("greymarch/spellBook.ts");
const ME = 0xff000123, OTHER = 0xff000456;
const BEAST_FORM = 0x92c48, FLAMES = 0x12fcd, HEAL = 0x12fcc, OLD = 0x1a4cc;

test("Beast Form taught while the body was held is kept, and the login list does not wipe it", () => {
  const b = new SpellBook();
  b.edit(ME, BEAST_FORM, true, 1000); // the entry's teaching came before the game knew which actor was its own
  b.edit(OTHER, HEAL, true, 1000); // someone else's: ignored
  b.spawned(ME, [FLAMES], 1300); // the body message, made before the teaching
  const plan = b.plan([]); // the game's list after the load: empty
  assert.deepStrictEqual(plan.add.sort(), [FLAMES, BEAST_FORM].sort());
  assert.deepStrictEqual(plan.remove, []);
});

test("teaching after the body came is followed; a take removes it; spells the server never gave are taken (server decides)", () => {
  const b = new SpellBook();
  b.spawned(ME, [FLAMES, OLD], 0);
  b.edit(ME, BEAST_FORM, true, 10);
  b.edit(ME, OLD, false, 20);
  const plan = b.plan([FLAMES, OLD, HEAL]);
  assert.deepStrictEqual(plan.add, [BEAST_FORM]);
  assert.deepStrictEqual(plan.remove.sort(), [OLD, HEAL].sort());
});

test("the server's take-and-give-again (a spell it already knew) ends with the spell kept", () => {
  const b = new SpellBook();
  b.spawned(ME, [BEAST_FORM], 0);
  b.edit(ME, BEAST_FORM, false, 5);
  b.edit(ME, BEAST_FORM, true, 6);
  assert.deepStrictEqual(b.plan([]).add, [BEAST_FORM]);
});

test("nothing to do before the body came, nothing when the lists match; old teaching is forgotten", () => {
  const b = new SpellBook();
  assert.strictEqual(b.plan([FLAMES]), null);
  b.edit(ME, HEAL, true, 0);
  b.spawned(ME, [FLAMES], EDIT_KEEP_MS + 1000); // a teaching from long before this body: already in its list or not wanted
  assert.deepStrictEqual(b.plan([FLAMES]), { add: [], remove: [] });
  assert.ok(RESTORE_AT_S.length >= 3 && RESTORE_AT_S[0] >= 1, "restored more than once after the body came");
});

test("wired in: the snippet service reports spell teaching, the body message fills the book, the old wipe is gone", () => {
  const snip = read("services/services/spSnippetService.ts");
  assert.match(snip, /greymarchSpellSnippet/);
  const rs = read("services/services/remoteServer.ts");
  assert.match(rs, /greymarchSpellBook\.spawned\(msg\.refrId/);
  assert.match(rs, /on\("greymarchSpellSnippet"/);
  assert.doesNotMatch(rs, /removeAllSpells\(player\)/);
});
