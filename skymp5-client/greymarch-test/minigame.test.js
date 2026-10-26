"use strict";
// The profession mini games in the game (src/greymarch/bridge.ts greymarchMini*; the page is the launcher's Platform/UI/greymarch-minigame.html, the server
// gamemode minigames.js): the packets reach the bridge, the page's answers reach the server, a win uses the thing again from the update phase, Esc gives up.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const bridge = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const auth = fs.readFileSync(path.join(__dirname, "..", "src", "services", "services", "authService.ts"), "utf8");

test("the server's packets are let through and routed", () => {
  assert.ok(auth.includes("case 'greymarchMinigame':") && auth.includes("case 'greymarchMinigameDone':"), "authService lets both through (or the game drops them)");
  assert.ok(bridge.includes('if (type === "greymarchMinigame") { this.greymarchMiniShow(msg); return; }'));
  assert.ok(bridge.includes('if (type === "greymarchMinigameDone") { this.greymarchMiniDone(msg); return; }'));
});

test("the page loads in its own frame and its answers go to the server", () => {
  assert.ok(bridge.includes('.split("greymarch-prof").join("greymarch-minigame")'), "the same loader as the other panels, its own page");
  assert.ok(bridge.includes('this.greymarchMiniSend("greymarchMinigameShown", { token: data.token })'));
  assert.ok(bridge.includes('this.greymarchMiniSend("greymarchMinigameResult", { token: data.token, ok: data.ok === true })'));
});

test("a win uses the thing again from the update phase; a loss shows the server's words; Esc gives up", () => {
  const done = bridge.slice(bridge.indexOf("greymarchMiniDone(msg: any)"), bridge.indexOf("greymarchMiniActivateTick(): any {"));
  assert.ok(done.includes("this.greymarchMiniActivate = { target:") && done.includes("Debug.notification"));
  const tick = bridge.slice(bridge.indexOf("greymarchMiniActivateTick(): any {"), bridge.indexOf("greymarchCraftHide(): any {"));
  assert.ok(tick.includes("misc.remoteIdToLocalId(want.target)") && tick.includes("ref.activate(me, false)"), "a placed thing by its local id, the game's own by its id");
  assert.ok(tick.includes("Date.now() - want.at > 5000"), "not long after");
  assert.ok(bridge.includes("this.greymarchMiniActivateTick();"), "called every update");
  assert.ok(bridge.includes('else if (e.code === 1 && this.greymarchMiniOn) this.greymarchMiniToPage("escape", true);'));
  assert.ok(bridge.includes("return !!(this.greymarchMiniOn || this.greymarchAdminOn"), "the game's keys stay with the page while it is open");
});

test("the character acts it out: kneeling over the body while skinning, up again before the body menu opens; the quick prompts go to the page", () => {
  const show = bridge.slice(bridge.indexOf("greymarchMiniShow(msg: any)"), bridge.indexOf("greymarchMiniHide(): any {"));
  assert.ok(show.includes('var mEm = emoteMod.emoteById(typeof msg.emote === "string" ? msg.emote : msg.kind === "skin" ? "searchbody" : "");'), "the server names the emote (examine, searchbody); an older server: skinning kneels");
  assert.ok(show.includes('if (mEm && mEm.kind !== "face") { this.greymarchEmotePlayWanted = { id: mEm.id, at: Date.now() }; this.greymarchMiniActing = true; }'));
  assert.ok(show.includes("quick: msg.quick === true") && show.includes("recipe: msg.recipe || null") && show.includes('animal: msg.animal || ""') && show.includes('ore: msg.ore || ""'), "the quick prompts, the Chef's recipe, the Hunter's animal and the Miner's ore go to the page");
  const done = bridge.slice(bridge.indexOf("greymarchMiniDone(msg: any)"), bridge.indexOf("greymarchMiniActivateTick(): any {"));
  assert.ok(done.includes("this.greymarchEmoteStopWanted = Date.now();") && done.includes("at: Date.now() + (acted ? 600 : 0)"));
  const tick = bridge.slice(bridge.indexOf("greymarchMiniActivateTick(): any {"), bridge.indexOf("greymarchCraftHide(): any {"));
  assert.ok(tick.includes("if (!want || Date.now() < want.at) return;"));
});
