"use strict";
// view/actorDelete.ts: an actor is disabled first and deleted only once the disable has finished, re-fetched by its form ID (a server deer deleted while
// still enabled crashed the game in the engine's movement job, SkyrimSE.exe+0783642, 2026-10-17). formView.ts destroy and remoteServer.ts use it for actors.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const read = (...p) => fs.readFileSync(path.join(__dirname, "..", "src", ...p), "utf8");
const js = ts.transpileModule(read("view", "actorDelete.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

function make(opts = {}) {
  const log = [];
  const ID = 0xff000c01;
  let resolveDisable, rejectDisable;
  const actor = {
    getFormID: () => ID,
    disable: () => { log.push("disable"); return new Promise((res, rej) => { resolveDisable = res; rejectDisable = rej; }); },
    delete: () => log.push("delete"),
    isDeleted: () => !!opts.deleted,
    isInDialogueWithPlayer: () => !!opts.dialogue,
    getDialogueTarget: () => null,
  };
  const sp = { Actor: { from: (f) => (f ? actor : null) }, Game: { getFormEx: (id) => (opts.gone || id !== ID ? null : { id }) } };
  const m = { exports: {} };
  new Function("require", "exports", "module", js)((p) => (p === "skyrimPlatform" ? sp : undefined), m.exports, m);
  const run = () => m.exports.disableThenDeleteActor(actor, () => log.push("done"));
  return { log, run, resolve: () => resolveDisable(), reject: () => rejectDisable(new Error("x")) };
}

test("disabled first; deleted only after the disable has finished, then onDone", async () => {
  const s = make();
  s.run();
  await flush();
  assert.deepStrictEqual(s.log, ["disable"], "nothing deleted while the disable is still running");
  s.resolve();
  await flush();
  assert.deepStrictEqual(s.log, ["disable", "delete", "done"]);
});

test("an actor already gone, already deleted or in dialogue is not deleted; onDone still runs", async () => {
  for (const opts of [{ gone: true }, { deleted: true }, { dialogue: true }]) {
    const s = make(opts);
    s.run(); s.resolve();
    await flush();
    assert.deepStrictEqual(s.log, ["disable", "done"], JSON.stringify(opts));
  }
});

test("a failed disable deletes nothing and still runs onDone", async () => {
  const s = make();
  s.run(); s.reject();
  await flush();
  assert.deepStrictEqual(s.log, ["disable", "done"]);
});

test("formView.ts destroy hands actors to disableThenDeleteActor and releases the WorldCleaner protection when it is done; only non-actors are deleted at once", () => {
  const src = read("view", "formView.ts");
  const start = src.indexOf("  destroy(): void {");
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("this.removeNickname();", start));
  const actorAt = body.indexOf("if (ac) {");
  const elseAt = body.indexOf("} else {", actorAt);
  assert.ok(actorAt > 0 && elseAt > actorAt);
  const actorBranch = body.slice(actorAt, elseAt);
  assert.ok(actorBranch.includes("TESModPlatform.setWeaponDrawnMode(ac, -1)"), "weapon drawn mode still reset");
  assert.ok(actorBranch.includes("disableThenDeleteActor(ac, releaseWcProtection)"));
  assert.ok(!actorBranch.includes(".delete()"), "no immediate delete of an actor");
  assert.ok(body.indexOf("refr.delete()") > elseAt, "an immediate delete only for non-actors");
  assert.ok(body.includes("modWcProtection(refrId, -1)"));
});

test("remoteServer.ts: an actor needing a respawn is disabled and deleted the safe way", () => {
  const src = read("services", "services", "remoteServer.ts");
  const at = src.indexOf("if (e instanceof RespawnNeededError) {");
  assert.ok(at > 0);
  const branch = src.slice(at, src.indexOf("} else {", at));
  assert.ok(branch.includes("disableThenDeleteActor(actor)"));
  assert.ok(!branch.includes("actor.delete()"));
});
