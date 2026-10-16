"use strict";
// A game load SkyMP did not start (New Game / Continue at the main menu loads the player's own save) is undone: the server is asked to load
// the player again (loadGameService.ts counts one load per SkyMP request, singlePlayerService.ts asks with "greymarchReload").
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(file, mods) {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)((p) => mods[p] || {}, mod.exports, mod);
  return mod.exports;
}

class ClientListener {}
function make({ connected = true } = {}) {
  const handlers = {}, ticks = [], emitted = [], sent = [], log = { closed: 0, boxes: 0, notes: 0 };
  const net = { isConnected: () => connected, close: () => { log.closed++; } };
  const controller = {
    on: (n, f) => { handlers[n] = f; }, once: (n, f) => { if (n === "tick") ticks.push(f); },
    lookupListener: () => net,
    emitter: {
      on: (n, f) => { handlers["emit:" + n] = f; },
      emit: (n, e) => { emitted.push([n, e]); if (n === "sendMessage") sent.push(JSON.parse(e.message.contentJsonDump)); if (n === "gameLoad" && handlers["emit:gameLoad"]) handlers["emit:gameLoad"](e); },
    },
  };
  const sp = { loadGame() {}, Debug: { messageBox: () => { log.boxes++; }, notification: () => { log.notes++; } }, Game: { setInChargen() {} } };
  const base = { "./clientListener": { ClientListener }, "./networkingService": { NetworkingService: {} }, "../../messages": { MsgType: { CustomPacket: 77 } } };
  const { LoadGameService } = load("loadGameService.ts", base);
  const { SinglePlayerService } = load("singlePlayerService.ts", base);
  const lg = new LoadGameService(sp, controller);
  new SinglePlayerService(sp, controller);
  const gameReportsLoad = () => { handlers.loadGame(); ticks.splice(0).forEach((f) => f()); }; // the game's load event, then the next tick
  const loads = () => emitted.filter(([n]) => n === "gameLoad").map(([, e]) => e.isCausedBySkyrimPlatform);
  return { lg, gameReportsLoad, loads, sent, log };
}

test("SkyMP's own load counts as SkyMP's, also when the game reports it late (slow PC)", () => {
  const g = make();
  g.lg.loadGame([0, 0, 0], [0, 0, 0], 0x3c);
  g.gameReportsLoad();
  assert.deepStrictEqual(g.loads(), [true]);
  assert.deepStrictEqual(g.sent, []);
});

test("Continue right after SkyMP's load: the second load is the player's own and the server is asked to load them again", () => {
  const g = make();
  g.lg.loadGame([0, 0, 0], [0, 0, 0], 0x3c);
  g.gameReportsLoad();      // SkyMP's
  g.gameReportsLoad();      // the player's single-player save, 2 seconds later (inside the old 8-second window)
  assert.deepStrictEqual(g.loads(), [true, false]);
  assert.deepStrictEqual(g.sent, [{ customPacketType: "greymarchReload" }]);
  assert.strictEqual(g.log.closed, 0, "not dropped to single-player");
  g.gameReportsLoad();      // pressed again at once: waits for the server's load, still connected, asked only once
  assert.deepStrictEqual(g.sent, [{ customPacketType: "greymarchReload" }]);
  assert.strictEqual(g.log.closed, 0);
  g.lg.loadGame([0, 0, 0], [0, 0, 0], 0x3c); // the server's answer
  g.gameReportsLoad();
  assert.deepStrictEqual(g.loads(), [true, false, false, true]);
});

test("offline (not connected), a foreign load still switches to single-player as SkyMP always did", () => {
  const g = make({ connected: false });
  g.gameReportsLoad();
  assert.deepStrictEqual(g.sent, []);
  assert.strictEqual(g.log.closed, 1);
});
