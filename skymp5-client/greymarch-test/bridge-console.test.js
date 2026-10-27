"use strict";
// Tests for the console lock of the Greymarch bridge (src/greymarch/bridge.ts): the console (~) is closed the frame it opens, the commands that cheat do nothing.
//   node --test skymp5-client/greymarch-test/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;

function make({ closeMenu = true, findConsoleCommand = true, unknown = [] } = {}) {
  const log = { sent: [], lines: [], printed: [], closed: [], taps: [], commands: new Map() };
  const misc = { remoteIdToLocalId: () => 0, localIdToRemoteId: () => 0, getViewFromStorage: () => null };
  const mods = { "../messages": { MsgType: { CustomPacket: 77 } }, "../view/worldViewMisc": misc, "../sync/appearance": {}, "../services/services/remoteServer": { RemoteServer: {} }, "../services/services/singlePlayerService": { SinglePlayerService: {} } };
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p], mod.exports, mod);
  const open = new Set();
  const sp = {
    printConsole: (t) => log.printed.push(t), writeLogs: (n, l) => log.lines.push(l),
    Game: { getPlayer: () => null },
    Ui: { isMenuOpen: (name) => open.has(name) },
    Input: { tapKey: (k) => { log.taps.push(k); open.delete("Console"); } },
    callNative: (cls, fn, self, name) => { if (cls === "GreymarchCam" && fn === "CloseMenu" && closeMenu) { log.closed.push(name); open.delete(name); return true; } throw new Error("no such native"); },
    on() {},
  };
  if (findConsoleCommand) {
    sp.findConsoleCommand = (name) => {
      if (unknown.includes(name)) return null;
      const cmd = { longName: name, shortName: name, numArgs: 0, execute: () => true };
      log.commands.set(name, cmd);
      return cmd;
    };
  }
  const controller = { on() {}, emitter: { on() {}, emit: (n, p) => log.sent.push([n, p]) } };
  const gm = new mod.exports.GreymarchBridge(sp, controller);
  const reports = () => log.sent.map(([, p]) => JSON.parse(p.message.contentJsonDump)).filter((m) => m.customPacketType === "greymarchConsole");
  return { gm, log, open, reports, CONSOLE_BLOCKED: mod.exports.CONSOLE_BLOCKED };
}

test("every cheating command is swapped out from the start: coc, tgm, tmm, tcl, setav, modav and the rest refuse, print why and tell the server", () => {
  const { log, reports, CONSOLE_BLOCKED } = make();
  for (const name of ["coc", "tgm", "tmm", "tcl", "tfc", "setav", "modav", "forceav", "psb", "caqs", "kill", "resurrect", "unlock", "bat"]) assert.ok(CONSOLE_BLOCKED.includes(name), name + " is on the list");
  for (const name of CONSOLE_BLOCKED) {
    if (["additem", "equipitem", "placeatme", "disable", "mp"].includes(name)) continue;
    assert.ok(log.commands.has(name), name + " was looked up");
    assert.strictEqual(log.commands.get(name).execute(0, "WhiterunBreezehome"), false, name + " answers false: the game's own command never runs");
  }
  assert.ok(log.printed.includes("Console commands are disabled on Greymarch."));
  const coc = reports().find((r) => r.op === "command" && r.name === "coc");
  assert.ok(coc, "the server hears about the coc");
});

test("SkyMP's own additem, equipitem, placeatme, disable and mp are left to its consoleCommandsService (the server refuses them)", () => {
  const { log } = make();
  for (const name of ["additem", "equipitem", "placeatme", "disable", "mp"]) assert.ok(!log.commands.has(name), name + " not swapped again");
});

test("a command this game does not have is skipped and named in the log; no findConsoleCommand at all only closes the menu", () => {
  const a = make({ unknown: ["tdetect", "sgtm"] });
  assert.ok(a.log.lines.some((l) => /commands locked \(not in this game: tdetect, sgtm\)/.test(l)));
  const b = make({ findConsoleCommand: false });
  b.open.add("Console");
  b.gm.greymarchConsoleTick(Date.now());
  assert.ok(!b.open.has("Console"), "still closed");
});

test("the console is closed the frame it opens (GreymarchCam.CloseMenu), reported once per opening", () => {
  const { gm, log, open, reports } = make();
  gm.greymarchConsoleTick(1000);
  assert.deepStrictEqual(log.closed, [], "nothing open, nothing closed");
  open.add("Console");
  gm.greymarchConsoleTick(2000);
  assert.deepStrictEqual(log.closed, ["Console"]);
  assert.ok(!open.has("Console"));
  assert.strictEqual(reports().filter((r) => r.op === "opened").length, 1);
  open.add("Console Native UI Menu");
  gm.greymarchConsoleTick(2016);
  assert.deepStrictEqual(log.closed, ["Console", "Console Native UI Menu"]);
  assert.strictEqual(reports().filter((r) => r.op === "opened").length, 1, "a second opening within 5 s is not sent again");
});

test("the console is closed from the update loop (greymarchTick)", () => {
  const { gm, log, open } = make();
  open.add("Console");
  gm.greymarchTick();
  assert.ok(log.closed.includes("Console"));
});

test("without GreymarchCamera.dll 1.3 the console key is pressed again, at most once a second", () => {
  const { gm, log, open } = make({ closeMenu: false });
  open.add("Console");
  gm.greymarchConsoleTick(5000);
  assert.deepStrictEqual(log.taps, [41]);
  open.add("Console");
  gm.greymarchConsoleTick(5200);
  assert.deepStrictEqual(log.taps, [41], "not pressed again so soon (it would open it again)");
  gm.greymarchConsoleTick(6100);
  assert.deepStrictEqual(log.taps, [41, 41]);
});

test("reports are limited: the same command typed many times sends one packet every 5 s", () => {
  const { log, reports } = make();
  const tgm = log.commands.get("tgm");
  for (let i = 0; i < 50; i++) tgm.execute(0);
  assert.strictEqual(reports().filter((r) => r.name === "tgm").length, 1);
});
