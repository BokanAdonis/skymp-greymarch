// @ts-nocheck
// Greymarch bridge: everything Greymarch adds to the SkyMP client lives here, so the rest of SkyMP stays as upstream wrote it.
// Ported from the old text patches (tools/patch-client.js in the launcher repo). Loosely typed on purpose for the first port.
// Hooks into SkyMP are small and marked "GREYMARCH" in authService.ts, formView.ts, activationService.ts, remoteServer.ts, loadGameService.ts, singlePlayerService.ts.
import { MsgType } from "../messages";
import * as misc from "../view/worldViewMisc";
import * as appearanceMod from "../sync/appearance";
import * as moveGetMod from "../sync/movementGet";
import * as moveApplyMod from "../sync/movementApply";
import * as animMod from "../sync/animation";
import { WorldCleanerService } from "../services/services/worldCleanerService";
import { RemoteServer } from "../services/services/remoteServer";
import { SinglePlayerService } from "../services/services/singlePlayerService";
import { LoadGameService } from "../services/services/loadGameService";
import * as holdMod from "./bodyHold";
import * as emoteMod from "./emotes";

// Runs inside SkyMP's browser page (once). Each shows a page from Platform/UI in an iframe and relays its messages.
const PAGE_SCRIPT = "(function(){if(window.__gmSend)return;var f=document.createElement('iframe');f.id='greymarch-frame';f.src='greymarch-select.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483647;background:#05080d;display:none';var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmSend=function(m){f.style.display=m.fn==='hide'?'none':'block';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const HUD_SCRIPT = "(function(){if(window.__gmHud)return;var f=document.createElement('iframe');f.id='greymarch-hud-frame';f.src='greymarch-hud.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483000;background:transparent;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmHudSend=function(m){if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};window.__gmHud=f;document.body.appendChild(f)})();";
const ADMIN_SCRIPT = "(function(){if(window.__gmAdminSend)return;var f=document.createElement('iframe');f.id='greymarch-admin-frame';f.src='greymarch-admin.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483200;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmAdminSend=function(m){if(m.fn==='show')f.style.pointerEvents='auto';else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const CHAT_SCRIPT = "(function(){if(window.__gmChatSend)return;var f=document.createElement('iframe');f.id='greymarch-chat-frame';f.src='greymarch-chat.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483100;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmChatSend=function(m){if(m.fn==='open'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='close'||m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const MENU_SCRIPT = "(function(){if(window.__gmMenuSend)return;var f=document.createElement('iframe');f.id='greymarch-menu-frame';f.src='greymarch-menu.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483210;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmMenuSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const PROF_SCRIPT = "(function(){if(window.__gmProfSend)return;var f=document.createElement('iframe');f.id='greymarch-prof-frame';f.src='greymarch-prof.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483220;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmProfSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const CONNECT_FAIL_MS = 90000; // the connecting screen over the main menu: this long without the character select, it says what to do (greymarchConnectCover)
const WOLF_MORPH_MS = 4300; // the werewolf transformation: the race changes at the animation's "SetRace" cue, or after this long if the cue is not seen (the cue is about 4.0 s in, animationdatasinglefile.txt)
const WOLF_KEY_WAIT_MS = 600; // Z with Beast Form equipped: how long the game gets to cast it before the press itself is reported (greymarchWolfTick)
const SHAPE_REST_MS = 800, SHAPE_POWER_REST_MS = 1600; // a creature's attacks: the rest after a normal and after a power attack (the server allows the same pace)
const SHAPE_LAND_MS = 450; // a creature's swing is reported this long after it starts (about when it lands)
const SHAPE_NPC_READY_MS = 8000; // a creature NPC that is not ready this long after it was placed is placed again
const SHAPE_SILENCE_MS = 20000; // a creature form: with no word from the server for this long the player changes back by themselves (the server repeats "on" every 5 seconds)
const WOLF_BACK_GRACE_MS = 2000; // Z changes back, but not in the first 2 seconds after the body changed
const LIP_STEP_MS = 110; // a talking mouth changes shape this often
const LIP_OPEN = [[0, 0.55], [1, 0.45], [6, 0.6], [11, 0.5], [5, 0.45], [8, 0.5]]; // [phoneme, strength]: Aah, BigAah, Eh, Oh, Eee, I
const LIP_CLOSED = [[2, 0.55], [4, 0.4], [10, 0.4]]; // BMP, DST, N: the lips meet or nearly
// THE BEAST FORMS' RACES in GreymarchCore.esp (each a copy of the werewolf or werebear race with its own skin): kind -> [the record's id in the plugin, its name]. The wolf's
// kinds are what the server sends as kind (werewolf.js WOLF_KINDS); black and polar are the werebear's looks. Frost Wolf, Rabid Wolf, Moonborn and Elder Alpha: 2026-10-21.
const GM_WOLF_FORMS: { [kind: string]: [number, string] } = {
  alpha: [0x804, "Alpha"], pup: [0x80a, "pup"], frost: [0x866, "Frost Wolf"], rabid: [0x86b, "Rabid Wolf"], moonborn: [0x870, "Moonborn"], elder: [0x875, "Elder Alpha"],
  black: [0x85c, "black bear"], polar: [0x861, "polar bear"],
};
// the lists in the server's greymarchWolfAlphas packet, by kind
const GM_WOLF_LISTS: { [kind: string]: string } = { alpha: "actors", pup: "pups", black: "blackbears", polar: "polarbears", frost: "frosts", rabid: "rabids", moonborn: "moonborns", elder: "elders" };
const WOLF_ROAR_MS = 0; // R: no wait between roars (2026-10-21, the owner's call; the server has none either: werewolf.js TUNE.howlCooldownMs). One roar per press of R.
const WOLF_ROAR_SOUND = 0x101008, BEAR_ROAR_SOUND = 0x0f95bb; // NPCWerewolfShout (the werewolf's howl) and NPCBearAggroWarning01 (a bear's warning roar), Skyrim.esm
// vampires (gamemode vampire.js): the game's own records, inside Dawnguard.esm (read from the game files); the real IDs are looked up with Game.getFormFromFile
const VAMP_FORMS = { mist: 0x38ba, lord: 0x283b, potionFx: 0x18ef4, potion: 0x18ef3, feedIdle: 0xe6a8 }; // DLC1VampireMistform, DLC1VampireChange, DLC1BloodPotionEffect, DLC1BloodPotion, IdleVampireStandingFeedFront_Loose
// a vampire's eyes, one colour per bloodline (GreymarchCore.esp, made by tools/vampire-eyes.js in the launcher repo): GM_VampEyes{Male,Female}{Colour}0..6, glow 0 (none) to 6 (a Lord)
const VAMP_EYES: any = { blue: { male: 0x80e, female: 0x815 }, red: { male: 0x81f, female: 0x826 }, yellow: { male: 0x82e, female: 0x835 }, green: { male: 0x83d, female: 0x844 }, purple: { male: 0x84c, female: 0x853 } };
const VAMP_EYE_RACES = [0x13746, 0x13744, 0x13741, 0x13748, 0x13743, 0x13749, 0x13742, 0x13747]; // Nord, Imperial, Breton, Redguard, High Elf, Wood Elf, Dark Elf, Orc (the human eye shape; khajiit and argonian eyes are not made yet)
const VAMP_FANGS = { male: 0x81c, female: 0x81d }; // GM_VampFangsMale / GM_VampFangsFemale: the human teeth with the upper canines pulled into fangs
const VAMP_FANG_RACES = [0x13746, 0x13744, 0x13741, 0x13748, 0x13743, 0x13749, 0x13742]; // the human and elf teeth; orcs keep their tusks
const VAMP_FANG_ITEM = 0x03cf35; // Dragonborn.esm's DLC2DummyHelmet: GreymarchCore.esp makes it the worn "Vampire Fangs" (the server gives it, greymarchVampFangsWear puts it on)
const VAMP_OWN_TEETH = { male: 0x51631, female: 0x5150f }; // MaleMouthHumanoidDefault / FemaleMouthHumanoidDefault (Skyrim.esm): the race's teeth, put back for a character with no teeth part of their own
const CHANCERY_SCRIPT =PROF_SCRIPT.split("__gmProfSend").join("__gmChanceryRun").split("greymarch-prof").join("greymarch-chancery").split("2147483220").join("2147483221"); // the chancery window (/chancery): the same loader, another page
const EMOTE_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmEmoteRun").split("greymarch-prof").join("greymarch-emote").split("2147483220").join("2147483223").split("e.key==='x'||e.key==='X'").join("e.key==='g'||e.key==='G'"); // the emote wheel (G): the same loader, another page; letting go of G inside the page is a release too
const VAMP_MENU_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmVampRun").split("greymarch-prof").join("greymarch-vampire").split("2147483220").join("2147483222"); // the vampire window (/vampire): the same loader, another page

// Which way the camera faces, in degrees the Skyrim way (0 = north, 90 = east). Skyrim Platform has no camera call, so 24 points on a wide ring round the head are
// put through worldPointToScreenPoint: the camera faces where the points in front of it cross the middle of the screen. null = could not tell (looking straight up or down).
export function greymarchCameraYaw(project: (pts: number[][]) => number[][], head: number[]): number | null {
    var R = 5000, N = 24, pts = [];
    for (var i = 0; i < N; i++) { var a = (i * 360 / N) * Math.PI / 180; pts.push([head[0] + R * Math.sin(a), head[1] + R * Math.cos(a), head[2]]); }
    var s = project(pts);
    if (!s || s.length !== N) return null;
    for (var j = 0; j < N; j++) {
        var p = s[j], q = s[(j + 1) % N];
        if (!p || !q || !(p[2] > 0) || !(q[2] > 0) || !(p[0] > -0.5 && p[0] < 1.5 && q[0] > -0.5 && q[0] < 1.5)) continue; // both in front of the camera, near the screen
        if (p[0] <= 0.5 && q[0] >= 0.5 && q[0] > p[0]) return ((j + (0.5 - p[0]) / (q[0] - p[0])) * 360 / N) % 360; // left to right across the middle
    }
    return null;
}

export class GreymarchBridge {
    [key: string]: any;

    constructor(public sp: any, public controller: any) {
        // a new bridge is never mid-form; SkyrimPlatform's storage outlives a script reload, so a flag left on would keep every look for this player aside forever (remoteServer.ts)
        try { (this.sp.storage as any)["greymarchWolfOn"] = false; } catch (stErr) { /* no storage: nothing to clear */ }
        this.controller.on("browserMessage", (e: any) => this.greymarchBrowserMessage(e));
        this.controller.on("buttonEvent", (e: any) => this.greymarchKey(e)); // F7 opens the staff panel
        try { this.sp.on("hit", (e: any) => this.greymarchHit(e)); } catch (hitErr) { /* no hit events: the combat history stays empty */ }
        this.controller.on("update", () => this.greymarchTick()); // Skyrim functions only work in the update phase, never in tick
        this.controller.on("tick", () => this.greymarchConnectCover(Date.now()));
        this.controller.on("tick", () => this.greymarchChoiceTick(Date.now()));
        this.controller.on("tick", () => this.greymarchBodyTick(Date.now())); // select before the world: the held body is let go once a character is chosen ("tick": "update" does not run at the main menu) // a held Play / Create goes out once the world has loaded (greymarchChoiceTick) // the connecting screen: "tick", because "update" does not run at the main menu (it only uses the browser)
        try { this.controller.on("spellCast", (e: any) => { try { if (e && e.spell && e.spell.getFormID() === 0x92c48 && e.caster && e.caster.getFormID() === 0x14) this.greymarchWolfSignal("spellCast"); } catch (x) { /* not ours */ } }); } catch (scErr) { /* the effect checks still see it */ } // the werewolf power (greymarchWolfTick)
        try { this.controller.on("effectStart", (e: any) => { try { if (e && e.effect && e.effect.getFormID() === 0x92c45 && e.target && e.target.getFormID() === 0x14) this.greymarchWolfSignal("effectStart"); } catch (x) { /* not ours */ } }); } catch (esErr) { /* the other signals still see it */ }
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.effect.getFormID() === 0x92c45 && e.target && e.target.getFormID() === 0x14) this.greymarchWolfSignal("magicEffectApply"); } catch (x) { /* not ours */ } }); } catch (maErr) { /* the other signals still see it */ }
        try { this.controller.on("spellCast", (e: any) => { try { if (e && e.spell && e.caster && e.caster.getFormID() === 0x14) this.greymarchVampSignal("cast", e.spell.getFormID()); } catch (x) { /* not ours */ } }); } catch (vcErr) { /* no cast events: the powers are not reported */ } // a vampire's Mist Form or Vampire Lord (greymarchVampTick)
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.target && e.target.getFormID() === 0x14) this.greymarchVampSignal("effect", e.effect.getFormID()); } catch (x) { /* not ours */ } }); } catch (veErr) { /* no effect events: a Potion of Blood is not reported */ } // a Potion of Blood drunk
        try { this.controller.on("equip", (e: any) => { try { if (e && e.baseObj && e.actor && e.actor.getFormID() === 0x14) this.greymarchVampSignal("equip", e.baseObj.getFormID()); } catch (x) { /* not ours */ } }); } catch (vqErr) { /* the effect event still sees it */ } // a potion is "equipped" when it is drunk
        this.controller.emitter.on("greymarchStage", (text: string) => this.greymarchLog(text)); // other services report where the game is, for the server log
        this.controller.emitter.on("greymarchEar", (e: any) => { if (e && typeof e.name === "string" && isFinite(e.x) && isFinite(e.y) && isFinite(e.z)) { const m = this.greymarchEarsSeen || (this.greymarchEarsSeen = {}); m[e.name] = { x: e.x, y: e.y, z: e.z, at: Date.now(), localId: Number(e.id) || 0 }; } }); // where each named player's head is in the world (where their voice comes from: greymarchEarsTick), and which character this game draws for them (their mouth moves while they talk: greymarchLipTick)
        this.controller.emitter.on("greymarchHead", (e: any) => { const m = this.greymarchHeads || (this.greymarchHeads = {}); m[e.name] = { x: e.x, y: e.y, at: Date.now() }; this.greymarchRes = { w: e.rw, h: e.rh }; }); // where each named player's head is on screen (for the microphone icon)
    }

    // STRAIGHT INTO THE SERVER. Started by the launcher (it sets "greymarch-autoplay"), the game must never offer Skyrim's own main menu: New Game or
    // Continue there load the player's single-player save (its place, its items). So from the first frame until the character select arrives, the
    // select page covers the screen with "Connecting to Greymarch" and the browser holds the mouse and keyboard, so nothing reaches the menu below.
    // Sent again every second (the page may still be loading, or reload). After CONNECT_FAIL_MS the page says what to do instead of spinning on.
    // Started any other way (no launcher), SkyMP's own login and the main menu work as before.
    greymarchConnectCover(now: number): any {
        var c = this.greymarchConnect;
        if (c && c.done) return;
        if (!c) {
            var cfg: any = {};
            try { cfg = (this.sp.settings && this.sp.settings["skymp5-client"]) || {}; } catch (cfgErr) { cfg = {}; }
            if (!cfg["greymarch-autoplay"]) { this.greymarchConnect = { done: true }; return; }
            c = this.greymarchConnect = { at: now, next: 0, done: false, failed: false };
        }
        if (now < c.next) return;
        c.next = now + 1000;
        var waited = now - c.at;
        var failed = waited >= CONNECT_FAIL_MS;
        if (failed && !c.failed) { c.failed = true; this.greymarchLog("stage: no character select after " + Math.round(waited / 1000) + " s: the connecting screen says what to do"); }
        try {
            this.sp.browser.setVisible(true);
            this.sp.browser.setFocused(true);
        } catch (bErr) { /* the browser is not up yet: next second */ }
        this.greymarchScreenUp = true;
        this.greymarchToPage("connecting", { on: true, text: waited < 45000 ? "Connecting to Greymarch" : "Still connecting to Greymarch", failed: failed });
    }
    // GREYMARCH: character select bridge. The screen is Platform/UI/greymarch-select.html, shown in an iframe over SkyMP's UI.
    greymarchToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(PAGE_SCRIPT + "window.__gmSend(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the screen: " + err);
        }
    }
    greymarchPacket(msg: any): any {
        var type = msg.customPacketType;
        // GREYMARCH: staff panel traffic is handled first (and quietly: ghosts arrive every few seconds)
        if (type === "greymarchAdminReply") { this.greymarchAdminToPage("reply", msg); return; }
        if (type === "greymarchNotice") { if (msg.title) { this.greymarchToast(msg); return; } try { this.sp.Debug.notification(String(msg.text).slice(0, 300)); } catch (e) { /* a notice is a nicety */ } return; }
        if (type === "greymarchStats") { this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; return; }
        if (type === "greymarchKill") { this.greymarchKillMe(); return; }
        if (type === "greymarchKnown") { this.greymarchKnown = msg.names && typeof msg.names === "object" ? msg.names : {}; this.greymarchNamesNext = 0; try { (Function("return this")() as any).__gmKnown = this.greymarchKnown; } catch (e) { /* the floating names keep showing IDs */ } return; }
        if (type === "greymarchChatLine") { this.greymarchChatToPage("line", msg); return; }
        if (type === "greymarchChatInfo") { this.greymarchChatToPage("info", msg); return; }
        if (type === "greymarchProps") { this.greymarchDoorNames = msg.doors && typeof msg.doors === "object" ? msg.doors : {}; this.greymarchDoorNamesNext = 0; return; }
        if (type === "greymarchGmAlert") { this.greymarchChatToPage("alert", msg); return; } // a player typed /gm (the server only sends it to Trial GM and up)
        if (type === "greymarchMenuReply") { this.greymarchMenuToPage("reply", msg); return; }
        if (type === "greymarchShape") { this.greymarchShapeMsg(msg); return; }
        if (type === "greymarchFaceOf") { this.greymarchFaceOf(msg); return; } // another player's face from the emote wheel (gamemode faces.js; put on in greymarchFaceTick)
        if (type === "greymarchShapeAnim") { if (typeof msg.ev === "string" && msg.ev.length < 64 && Number(msg.actor) > 0) (this.greymarchShapeAnimQueue || (this.greymarchShapeAnimQueue = [])).push({ actor: Number(msg.actor), ev: msg.ev }); return; } // another player's creature attacked (played in greymarchShapeDrive) // a creature form (staff): greymarchShapeTick changes the body
        if (type === "greymarchWolfForm") { if (this.greymarchWolfWant !== !!msg.on) this.greymarchLog("wolf: the server says " + (msg.on ? "changed" : "no (change back)")); this.greymarchWolfWant = !!msg.on; if (msg.on) { this.greymarchWolfWordAt = Date.now(); this.greymarchWolfAlpha = !!msg.alpha; this.greymarchWolfPup = !msg.alpha && !!msg.pup; this.greymarchWolfKind = msg.kind && GM_WOLF_FORMS[msg.kind] && msg.kind !== "black" && msg.kind !== "polar" ? String(msg.kind) : this.greymarchWolfAlpha ? "alpha" : this.greymarchWolfPup ? "pup" : ""; this.greymarchWolfBearRace = msg.bear && Number(msg.race) > 0 ? Number(msg.race) >>> 0 : 0; if (this.greymarchWolfBearRace) this.greymarchWolfBearSeen = this.greymarchWolfBearRace; this.greymarchWolfBlack = !!this.greymarchWolfBearRace && !!msg.black; this.greymarchWolfPolar = !!this.greymarchWolfBearRace && !!msg.polar; } return; } // (logged only when it changes: the server repeats it every 5 seconds) // the werewolf form (greymarchWolfTick)
        if (type === "greymarchWolfRoar") { if (Number(msg.actor) > 0) (this.greymarchWolfRoarQueue || (this.greymarchWolfRoarQueue = [])).push({ actor: Number(msg.actor), bear: !!msg.bear }); return; } // another player roared nearby: the sound on their NPC (greymarchWolfTick)
        if (type === "greymarchWolfAlphas") { var lists: any = {}; for (var lk in GM_WOLF_LISTS) lists[lk] = Array.isArray(msg[GM_WOLF_LISTS[lk]]) ? msg[GM_WOLF_LISTS[lk]] : []; this.greymarchWolfLists = lists; return; } // the other players in the Alpha form: drawn white (greymarchWolfAlphaOthers)
        if (type === "greymarchVampire") { this.greymarchVampWant = msg.on ? msg : null; this.greymarchHudToPage("blood", { on: !!msg.on, blood: msg.blood, empty: !!msg.empty }); return; } // a vampire's state: the blood drop and what the game applies (greymarchVampTick)
        if (type === "greymarchVampLooks") { this.greymarchVampLookList = Array.isArray(msg.vampires) ? msg.vampires : []; if (Number(msg.me) > 0) this.greymarchMeActor = Number(msg.me) >>> 0; return; } // (me: which of them is this player: the ghosts and effects packets that also say so may not have come yet, and without it the player's own eyes and fangs were never put on) // how every vampire in the world looks (eyes and fangs)
        if (type === "greymarchVampFeed") { this.greymarchVampFeedWant = msg.on ? { role: msg.role, partner: msg.partner, at: Date.now(), done: false } : { off: true }; return; } // the feeding scene
        if (type === "greymarchVampMist") { if (!msg.on) this.greymarchVampMistEnd = true; return; } // Mist Form refused or over: the game's own mist is ended
        if (type === "greymarchVampLord") { if (this.greymarchVampLordWas !== !!msg.on) { this.greymarchVampLordWas = !!msg.on; this.greymarchLog("vampire: the server says the Lord's shape is " + (msg.on ? "on" : "off")); } return; } // the body itself is the creature form (greymarchShape)
        if (type === "greymarchCuffs") { this.greymarchCuffsWant = msg.on ? msg : null; return; } // in cuffs (guards.js): the cuffs worn and the bound pose (greymarchCuffsTick)
        if (type === "greymarchChains") { this.greymarchChainList = Array.isArray(msg.chains) ? msg.chains.slice(0, 16) : []; this.greymarchCuffedList = Array.isArray(msg.cuffed) ? msg.cuffed.slice(0, 64) : []; return; } // who is on whose chain (drawn on the HUD), who is in cuffs (posed)
        if (type === "greymarchProgress") { var pOn = !msg.off && Number(msg.ms) > 0; this.greymarchProgressUntil = pOn ? Date.now() + Math.min(60000, Number(msg.ms)) + 500 : 0; this.greymarchGuardsHudCheck(); this.greymarchHudToPage("progress", pOn ? { on: true, ms: Number(msg.ms), text: String(msg.text || "").slice(0, 120) } : { on: false }); return; } // a timed action (the 7 seconds of cuffing): a bar on the HUD
        if (type === "greymarchWolfFeed") { this.greymarchWolfFeedAt = Date.now(); return; } // the wolf fed (a kill or a corpse): the feeding animation (greymarchWolfTick)
        if (type === "greymarchChanceryReply") { this.greymarchChanceryToPage("reply", msg); return; } // the chancery window (/chancery)
        if (type === "greymarchChanceryOpen") { this.greymarchChanceryShow(); return; }
        if (type === "greymarchVampMenuReply") { this.greymarchVampMenuToPage("reply", msg); return; } // the vampire window (/vampire)
        if (type === "greymarchVampMenuOpen") { this.greymarchVampMenuShow(); return; }
        if (type === "greymarchProfReply") { this.greymarchLog("prof: the server's answer arrived (rid " + msg.rid + ", ok " + msg.ok + ")"); this.greymarchProfToPage("reply", msg); return; } // the professions window (K)
        if (type === "greymarchCombatMod") { var cm = Number(msg.mult); this.greymarchCombatWant = cm >= 0.1 && cm <= 3 ? cm : 1; return; } // the damage multiplier for what is in hand (professions: a weapon above your rank hits weaker, a Brawler's fists hit harder)
        if (type === "greymarchMenuEvent") { if ((msg.type === "trade_invite" || msg.type === "trade" || msg.type === "feed_invite" || msg.type === "frisk_invite" || msg.type === "guard_view") && !this.greymarchMenuOn) this.greymarchMenuShow({ mode: "invite", looking: 0 }); /* a trade, a vampire's request to feed, a guard's request to frisk or what the frisk found opens the menu by itself */ this.greymarchMenuToPage("event", msg); return; }
        if (type === "greymarchFx") { this.greymarchFxWant = { noclip: !!msg.noclip, speed: Number(msg.speed) || 100, frozen: !!msg.frozen, god: !!msg.god }; if (msg.me) this.greymarchMeActor = msg.me; return; }
        if (type === "greymarchGhosts") { this.greymarchGhostList = Array.isArray(msg.ghosts) ? msg.ghosts : []; if (msg.me) this.greymarchMeActor = msg.me; this.greymarchOthers = Array.isArray(msg.others) ? msg.others : []; if (msg.stats !== undefined) this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; var inv = Array.isArray(msg.invisible) ? msg.invisible : []; this.greymarchInvisList = inv; var invMap = {}; for (var q = 0; q < inv.length; q++) if (inv[q] !== msg.me) invMap[inv[q]] = true; try { Function("return this")().__gmInvisible = invMap; } catch (gErr) { /* names stay visible */ } return; }
        this.sp.printConsole("[greymarch] got " + type + (msg.characters ? " with " + msg.characters.length + " character(s)" : ""));
        if (type === "greymarchHold") {
            // Select before the world (bodyHold.ts): keep our body until a character is chosen, and tell the server, so it binds the chosen body even when it is the one we stand in
            var hold = this.greymarchBodyHold();
            if (!hold) return;
            hold.arm(Date.now());
            this.greymarchLog("stage: the server shows the character select before the world: my body is held until a character is chosen");
            this.controller.emitter.emit("sendMessage", { message: { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchHolding" }) }, reliability: "reliable" });
            return;
        }
        if (type === "greymarchSelect" && this.greymarchBodyHold()) this.greymarchBodyHold().sawSelect(Date.now());
        if (type === "greymarchEntered" && this.greymarchBodyHold()) this.greymarchBodyHold().entered(Date.now());
        if (type === "greymarchSelect" || type === "greymarchEntered") this.greymarchConnect = { done: true }; // the connecting screen's job is over
        if (type === "greymarchSelect") {
            // From here on the game reports "alive" to the server every 3 seconds (greymarchTick). If the game dies, the LAST alive line in the server log tells
            // how far it got and when, even when the player's own logs are unusable.
            this.greymarchBeat = { next: Date.now() + 3000, n: 0, until: Date.now() + 15 * 60 * 1000 };
            this.greymarchChatHide();
            this.greymarchLog("stage: the character select screen is shown (" + (msg.characters ? msg.characters.length : 0) + " character(s))");
            this.sp.browser.setVisible(true);
            this.sp.browser.setFocused(true);
            this.greymarchToPage("show", { max: msg.max, account: msg.account, characters: msg.characters });
            this.greymarchScreenUp = true;
            this.greymarchChoosing = true; // until a character is chosen the screen keeps the keyboard and mouse: see greymarchSelectFocusGuard
            this.greymarchHudToPage("hello", true); // start the voice display's page early, so it is already running when the player enters the world
        } else if (type === "greymarchError") {
            this.greymarchToPage("error", msg.message);
        } else if (type === "greymarchEntered") {
            // Keep the screen up as a veil while the body settles (default gear, equipment, the race menu opening), so nobody sees
            // the armor flash. The veil NEVER waits for anything that could stall: an existing character lifts it after 2.5s, a new
            // one as soon as the race menu is open (or after 12s). greymarchTick does it.
            this.greymarchToPage("busy", { on: true, text: "Entering the world", veil: true });
            this.greymarchChoosing = false;
            this.greymarchReveal = { at: Date.now(), isNew: !!msg.isNew };
            this.greymarchTrace = { at: Date.now(), next: 0, menuWas: false, closedAt: 0 };
            this.greymarchLog("entered " + msg.id + " new=" + !!msg.isNew + " kit=" + (Array.isArray(msg.kit) ? msg.kit.length : 0) + " equip=" + (Array.isArray(msg.equip) ? msg.equip.length : 0));
            this.greymarchScreenUp = true;
            this.greymarchHudToPage("character", msg.id); // the voice display tells the launcher which character this is
            if (msg.isNew) {
                // a NEW character: empty the inventory down to exactly the starting kit (the game's vanilla starting items would otherwise stay),
                // take off the default armor, then put the starting clothes on (see greymarchTick)
                var wear = Array.isArray(msg.equip) ? msg.equip.slice() : [];
                this.greymarchEquip = { at: Date.now(), all: wear.slice(), ids: wear.slice(), kit: Array.isArray(msg.kit) ? msg.kit.slice() : [], pending: [Date.now() + 500], resets: 0, menuOpened: false, menuClosed: false };
            }
        }
    }
    // Our own log file: Data/Platform/Logs/greymarch-logs.txt (SkyrimPlatform writes it). The game's normal log does not keep printConsole lines.
    // CRASH BREADCRUMBS (see formView.ts gmCrumb): this game's own risky steps, in the same flushed file
    greymarchCrumb(text: string): any { try { this.sp.writeLogs("greymarch-crumbs", ((Date.now() - (this.greymarchCrumbStart || (this.greymarchCrumbStart = Date.now()))) / 1000).toFixed(1) + "s " + text); } catch (e) { /* a breadcrumb is a nicety */ } }
    greymarchCrumbEvery(key: string, ms: number, text: string): any { var at = this.greymarchCrumbAt || (this.greymarchCrumbAt = {}); var n = Date.now(); if (n - (at[key] || 0) < ms) return; at[key] = n; this.greymarchCrumb(text); }
    greymarchLog(text: any): any {
        var line = "[" + new Date().toISOString().substr(11, 12) + "] " + text;
        try { this.sp.writeLogs("greymarch", line); } catch (err) { this.sp.printConsole("[greymarch] " + text); }
        // The file above never showed up on disk, so the line also goes to the server log (readable from the VPS).
        try {
            var logMessage = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchLog", text: text }) };
            this.controller.emitter.emit("sendMessage", { message: logMessage, reliability: "reliable" });
        } catch (err2) { /* diagnostics must never break the game */ }
    }
    // What is in the player's inventory right now (name, id, count, WORN), written to our log file. Never throws.
    greymarchDump(label: any): any {
        var items = [];
        try {
            var player = this.sp.Game.getPlayer();
            var n = player.getNumItems();
            for (var i = 0; i < n && i < 60; i++) {
                var f = player.getNthForm(i);
                if (!f) continue;
                var worn = false;
                try { worn = player.isEquipped(f); } catch (e1) { worn = false; }
                items.push(f.getName() + " [" + f.getFormID().toString(16) + "] x" + player.getItemCount(f) + (worn ? " WORN" : ""));
            }
            if (n > 60) items.push("... and " + (n - 60) + " more");
        } catch (err) { items.push("(could not list the inventory: " + err + ")"); }
        this.greymarchLog(label + " | " + items.length + " entries: " + items.join("; "));
    }
    // Take everything off, empty the inventory, and add exactly the starting kit (new characters only; see the Entered packet).
    greymarchReset(eq: any, player: any, why: any): any {
        player.unequipAll();
        if (eq.kit.length) {
            player.removeAllItems(null, false, true);
            for (var k = 0; k < eq.kit.length; k++) {
                var kitForm = this.sp.Game.getFormEx(eq.kit[k].baseId);
                if (kitForm) player.addItem(kitForm, eq.kit[k].count, true);
            }
        }
        eq.ids = eq.all.slice(); // the clothes must be put on again
        eq.resets++;
        this.greymarchLog("reset #" + eq.resets + " (" + why + "): unequipped everything, emptied the inventory, added " + eq.kit.length + " kit item(s)");
    }
    // The load order the GAME really uses (full plugins by position, light ones by their own position), written to the server log once per session: the server's item and place IDs are numbered
    // by ITS load order, so this is the proof that both agree (compare it with the server's list). Names only, in chunks short enough for one log line each.
    greymarchReportLoadOrder(): any {
        if (this.greymarchLoadOrderReported) return;
        this.greymarchLoadOrderReported = true;
        try {
            var G = this.sp.Game, full: string[] = [], light: string[] = [];
            for (var i = 0; i < G.getModCount(); i++) full.push(String(G.getModName(i)));
            var nl = 0; try { nl = G.getLightModCount(); } catch (e0) { nl = 0; }
            for (var j = 0; j < nl; j++) light.push(String(G.getLightModName(j)));
            var text = "full " + full.length + ": " + full.join(" | ") + " || light " + light.length + ": " + light.join(" | ");
            var parts = Math.ceil(text.length / 700);
            for (var k = 0; k < parts; k++) this.greymarchLog("loadorder " + (k + 1) + "/" + parts + ": " + text.substr(k * 700, 700));
        } catch (e) { this.greymarchLog("loadorder: could not be read (" + e + ")"); }
    }
    greymarchLift(why: any): any {
        var job = this.greymarchReveal;
        this.greymarchReveal = null;
        this.greymarchToPage("hide");
        this.sp.browser.setFocused(false);
        this.greymarchScreenUp = false;
        this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); // stays visible (but never focused) while the voice display is on; the staff panel keeps it up and focused
        if (this.greymarchAdminOn) this.sp.browser.setFocused(true);
        this.greymarchChatShow();
        this.greymarchReportLoadOrder();
        this.greymarchLog("veil lifted (" + why + ") after " + (job ? Date.now() - job.at : "?") + " ms");
        this.sp.printConsole("[greymarch] veil lifted (" + why + ")");
    }
    // Runs every frame in the UPDATE phase (registered in the constructor): that is the only place Skyrim functions such as Game.getFormEx may be called. Cheap when there is nothing to do. Any error lifts the veil instead of trapping the player.
    // While the player is choosing a character, the select screen must have the keyboard and mouse. SkyMP takes them away when it sends the
    // player's own body (skympClient.onActorCreateMessage: setFocused(false)), which often arrives a moment AFTER the screen: the cursor was
    // gone and clicks swung the weapon of the body behind the screen. Esc does the same. So the focus is given back whenever it is lost.
    greymarchSelectFocusGuard(now: any): any {
        if (!this.greymarchChoosing || now < (this.greymarchSelectFocusNext || 0)) return;
        this.greymarchSelectFocusNext = now + 200;
        try {
            if (this.sp.browser.isFocused()) return;
            this.sp.browser.setVisible(true);
            this.sp.browser.setFocused(true);
            this.greymarchSelectRefocused = (this.greymarchSelectRefocused || 0) + 1;
            if (this.greymarchSelectRefocused <= 3) this.greymarchLog("stage: the select screen lost the keyboard and mouse (SkyMP loaded the world or Esc), took them back");
        } catch (e) { /* the next tick tries again */ }
    }
    greymarchTick(): any {
        this.greymarchRebaseAfterLoad(Date.now()); // "update" runs only once the world is loaded
        this.greymarchSelectFocusGuard(Date.now());
        this.greymarchDoorNamesApply(Date.now());
        this.greymarchDoorPrompt(Date.now());
        this.greymarchChatPending();
        this.greymarchProfPending();
        this.greymarchEmoteTick(Date.now()); // the emote wheel (G): opening it, playing and stopping an emote (Skyrim functions: the update phase)
        this.greymarchChatWatch(Date.now());
        this.greymarchFovTick(); // the field of view from the chatbox's Settings
        this.greymarchWorldViewGuard(Date.now()); // other players are drawn only while SkyMP's world view is on: see greymarchWorldViewGuard
        if (this.greymarchChatOn && Date.now() >= (this.greymarchChatNext || 0)) { this.greymarchChatNext = Date.now() + 2000; this.greymarchChatToPage("show", true); }
        if (this.greymarchMenuEscAt && Date.now() - this.greymarchMenuEscAt > 700) { this.greymarchMenuEscAt = 0; this.greymarchMenuHide(); } // Esc, and the menu page did not close itself
        this.greymarchToastTick(Date.now());
        this.greymarchEffects(); // staff effects: noclip, speed, frozen, ghosts (cheap: does real work every 400 ms)
        this.greymarchShapeDrive(); // a creature form as an NPC: moved every frame like SkyMP moves other players; other players' creature attacks
        this.greymarchShapeTick(); // a creature form staff put the player in (a goat, a giant ...): the server decides, the body is changed here
        this.greymarchWolfTick(); // the werewolf form: the game's Beast Form power is the trigger, the server decides, the change is done here
        this.greymarchVampTick(); // a vampire: powers and potions reported, the abilities the server names, no Restoration, the feeding scene
        this.greymarchCuffsTick(Date.now()); // in cuffs: the cuffs worn, the bound pose (others' too), the chain drawn to whoever holds it
        this.greymarchEarsTick(Date.now()); // where each voice comes from, for the launcher (only while it is in voice)
        this.greymarchLipTick(Date.now()); // the mouths of whoever is talking in voice move (this player's too)
        var beat = this.greymarchBeat;
        if (beat) {
            var bNow = Date.now();
            if (bNow >= beat.until) this.greymarchBeat = null;
            else if (bNow >= beat.next) {
                beat.next = bNow + (beat.n < 20 ? 3000 : 30000); // every 3s for the first minute (that is when games die), then every 30s so the log stays readable
                beat.n++;
                var where = "";
                try { var pl = this.sp.Game.getPlayer(); var cell = pl.getParentCell(); where = " player3D=" + pl.is3DLoaded() + " cell=" + (cell ? cell.getFormID().toString(16) : "none") + (this.sp.Ui.isMenuOpen("RaceSex Menu") ? " raceMenu=open" : ""); } catch (e0) { where = " (could not read the player)"; }
                this.greymarchLog("alive #" + beat.n + where);
            }
        }
        // (The talking mark over a head is part of the floating name now, see formView.ts: no positions are sent to the page any more.)
        var veil = this.greymarchReveal;
        var eq = this.greymarchEquip;
        var tr = this.greymarchTrace;
        if (!veil && !eq && !tr) return;
        try {
            var now = Date.now();
            var player = this.sp.Game.getPlayer();
            var raceMenuOpen = this.sp.Ui.isMenuOpen("RaceSex Menu");
            if (eq) {
                var age = now - eq.at;
                // 30 seconds to reach the race menu; once it is open the watch stays until it has closed and the clean-ups after it ran (players take minutes to
                // build a face, and closing the menu is exactly when the game's default gear, the iron armor, comes back). 30 minutes at most.
                var limit = eq.menuOpened ? 30 * 60 * 1000 : 30000;
                if (!player || age > limit) {
                    if (age > limit) this.greymarchLog("gave up on the starting clothes (" + eq.ids.length + " left)");
                    this.greymarchEquip = null;
                } else {
                    // scheduled full resets: 0.5s after entering, and again 0.6s and 3s after the race menu closes (closing it rebuilds the character, which can bring the game's default gear back)
                    for (var p = eq.pending.length - 1; p >= 0; p--) {
                        if (eq.pending[p] <= now) { eq.pending.splice(p, 1); this.greymarchReset(eq, player, "scheduled"); }
                    }
                    if (eq.resets > 0) {
                        for (var i = eq.ids.length - 1; i >= 0; i--) {
                            var form = this.sp.Game.getFormEx(eq.ids[i]);
                            if (form && player.getItemCount(form) > 0) {
                                player.equipItem(form, false, true);
                                this.greymarchLog("put on " + form.getName());
                                eq.ids.splice(i, 1);
                            }
                        }
                    }
                    // the race menu has just opened: the default armor can come back with it, so take it off again and re-dress
                    // the race menu has just opened: the game's default gear (iron armor) can come with it, so it is REMOVED (the full reset: only the starting kit stays), before the player builds the character
                    if (raceMenuOpen && !eq.menuOpened) { eq.menuOpened = true; this.greymarchReset(eq, player, "race menu opened"); }
                    if (!raceMenuOpen && eq.menuOpened && !eq.menuClosed) { eq.menuClosed = true; eq.pending.push(now + 600, now + 3000, now + 8000); this.greymarchLog("race menu closed: clean-ups scheduled"); }
                    if (eq.menuClosed && eq.pending.length === 0 && eq.ids.length === 0) this.greymarchEquip = null;
                }
            }
            if (tr) {
                var tAge = now - tr.at;
                if (raceMenuOpen !== tr.menuWas) {
                    tr.menuWas = raceMenuOpen;
                    this.greymarchDump("t+" + tAge + "ms race menu " + (raceMenuOpen ? "OPENED" : "CLOSED"));
                    if (!raceMenuOpen) tr.closedAt = now;
                } else if (tAge >= tr.next) {
                    this.greymarchDump("t+" + tAge + "ms");
                    tr.next = tr.next === 0 ? 700 : tAge + 2000;
                }
                if (tAge > 45000 || (tr.closedAt && now - tr.closedAt > 10000)) {
                    this.greymarchDump("t+" + tAge + "ms FINAL");
                    this.greymarchTrace = null;
                }
            }
            if (veil) {
                var vAge = now - veil.at;
                if (veil.isNew ? (raceMenuOpen || vAge >= 12000) : vAge >= 2500) this.greymarchLift(raceMenuOpen ? "race menu open" : "time");
            }
        } catch (err) {
            this.greymarchLog("tick error: " + err);
            this.greymarchEquip = null;
            this.greymarchTrace = null;
            if (this.greymarchReveal) this.greymarchLift("error");
        }
    }
    // The voice display's page (Platform/UI/greymarch-hud.html) lives in SkyMP's browser page, like the select screen.
    greymarchHudToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(HUD_SCRIPT + "window.__gmHudSend(" + json + ");");
        } catch (err) { /* the voice display is a nicety: it must never break the game */ }
    }
    // WHERE EACH VOICE COMES FROM. About 10 times a second, while the launcher is in voice, the voice display's page is told which way the camera faces and where
    // nearby players' heads are; the page passes it to the launcher, which turns, muffles and fades each voice from it. Whether a voice can be heard at all stays the
    // game server's call (the launcher's voice rules), so these numbers only change how a voice sounds.
    greymarchEarsTick(now: number): any {
        if (!this.greymarchListen || this.greymarchScreenUp || now < (this.greymarchEarsNext || 0)) return;
        this.greymarchEarsNext = now + 100;
        try {
            var sp = this.sp, player = sp.Game.getPlayer();
            var head = "NPC Head [Head]";
            var me = [sp.NetImmerse.getNodeWorldPositionX(player, head, false), sp.NetImmerse.getNodeWorldPositionY(player, head, false), sp.NetImmerse.getNodeWorldPositionZ(player, head, false)];
            if (!me.every(function (n: any) { return isFinite(n); }) || (me[0] === 0 && me[1] === 0 && me[2] === 0)) me = [player.getPositionX(), player.getPositionY(), player.getPositionZ() + 110]; // no head node (a creature form): about head height
            var yaw = greymarchCameraYaw(function (pts: number[][]) { return sp.worldPointToScreenPoint.apply(null, pts); }, me);
            if (yaw === null) yaw = player.getAngleZ(); // the camera could not be read: the way the character faces
            var seen = this.greymarchEarsSeen || {}, list = [];
            for (var id in seen) {
                var e = seen[id];
                if (now - e.at > 400) { delete seen[id]; continue; } // gone, or out of reach
                if (/^#[2-9A-HJ-KM-NP-Z]{4}$/.test(id) && list.length < 32) list.push({ id: id, x: Math.round(e.x), y: Math.round(e.y), z: Math.round(e.z) });
            }
            this.greymarchHudToPage("ears", { yaw: Math.round(yaw * 10) / 10, me: [Math.round(me[0]), Math.round(me[1]), Math.round(me[2])], list: list });
        } catch (err) { /* voices just stay centred */ }
    }
    // The voice display reports "I am on / off, and these characters are talking". Only real character IDs are accepted.
    greymarchVoiceMessage(data: any): any {
        var ids = [];
        if (Array.isArray(data.speaking)) {
            for (var i = 0; i < data.speaking.length && ids.length < 12; i++) {
                if (typeof data.speaking[i] === "string" && /^#[2-9A-HJ-KM-NP-Z]{4}$/.test(data.speaking[i])) ids.push(data.speaking[i]);
            }
        }
        var hud = data.hud === true;
        this.greymarchListen = data.listen === true; // the launcher is in voice: it wants to know where voices come from (greymarchEarsTick), even with the display off
        var changed = hud !== !!this.greymarchHudOn;
        this.greymarchVoice = { hud: hud, speaking: ids };
        this.greymarchLipIds = ids; // who is talking: their mouths move (greymarchLipTick), with the voice display on or off
        this.greymarchLipMe = data.talking === true;
        // the floating names mark whoever is talking (formView.ts draws the mark as part of the name, so it moves with it and cannot lag)
        try { var talking = {}; if (hud) for (var ti = 0; ti < ids.length; ti++) talking[ids[ti]] = 1; (Function("return this")() as any).__gmSpeaking = talking; } catch (e) { /* the names stay unmarked */ }
        this.greymarchHudOn = hud;
        // the page is shown (never focused) while the display is on, hidden when it is off; the select screen and the veil decide for themselves while they are up
        if (changed && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(hud || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); if (!this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.sp.browser.setFocused(false); } catch (err) { /* nothing to do */ } }
    }
    greymarchBrowserMessage(e: any): any {
        if (!e.arguments || e.arguments[0] !== "greymarch") return;
        var data;
        try { data = JSON.parse(e.arguments[1]); } catch (err) { return; }
        if (data && data.type === "voice") { this.greymarchVoiceMessage(data); return; } // from the voice display: is it on, and who is talking
        if (data && data.type === "release") { this.greymarchLift("the screen released it"); return; } // the screen's own safety timer
        if (data && data.type === "admin") { this.greymarchAdminSend(data); return; } // the staff panel asks the server for something (the SERVER decides if it is allowed)
        if (data && data.type === "admin-close") { this.greymarchAdminHide(); return; }
        if (data && data.type === "chat") { this.greymarchChatSend(data); return; } // the chatbox sends a line, or asks what this player may use (the SERVER decides)
        if (data && data.type === "chat-focus") { this.greymarchChatFocus(data.on); return; }
        if (data && data.type === "chat-sync") { this.greymarchChatSync(!!data.typing); return; }
        if (data && data.type === "chat-settings") { this.greymarchFovWanted(data); return; } // the chatbox's Settings: the field of view (applied from the update phase)
        if (data && data.type === "menu") { this.greymarchMenuSend(data); return; } // the X menu asks the server for something (the SERVER decides)
        if (data && data.type === "menu-close") { this.greymarchMenuHide(); return; }
        if (data && data.type === "prof") { this.greymarchProfSend(data); return; } // the professions window asks the server (the SERVER decides)
        if (data && data.type === "prof-close") { this.greymarchProfHide(); return; }
        if (data && data.type === "chancery") { this.greymarchChanceryAsk(data); return; } // the chancery window asks the server (the SERVER decides)
        if (data && data.type === "chancery-close") { this.greymarchChanceryHide(); return; }
        if (data && data.type === "vampire") { this.greymarchVampMenuAsk(data); return; } // the vampire window asks the server (the SERVER decides)
        if (data && data.type === "vampire-close") { this.greymarchVampMenuHide(); return; }
        if (data && data.type === "emote") { this.greymarchEmotePlayWanted = { id: data.id, at: Date.now() }; return; } // the emote wheel: play one (greymarchEmoteTick checks it is on the list)
        if (data && data.type === "emote-stop") { this.greymarchEmoteStopWanted = Date.now(); this.greymarchFaceClearWanted = Date.now(); return; } // the middle of the wheel: the emote and the face
        if (data && data.type === "emote-close") { this.greymarchEmoteHide(); return; }
        if (!data || (data.type !== "play" && data.type !== "create" && data.type !== "delete")) return;
        // Play and Create make SkyMP load the world. If the world from logging in is still loading, a second load on top of it never finishes (stuck),
        // so the choice is held until the game reports that load (greymarchChoiceTick); the screen shows the player it is working.
        if ((data.type === "play" || data.type === "create") && this.greymarchLoadPending()) {
            this.greymarchHeldChoice = { data: data, at: Date.now() };
            this.greymarchLog("stage: " + data.type + " chosen while the world is still loading: held until it has loaded");
            this.greymarchToPage("busy", { on: true, text: "Loading the world", veil: false });
            return;
        }
        this.greymarchSendChoice(data);
    }
    greymarchSendChoice(data: any): any {
        this.sp.printConsole("[greymarch] sending choice: " + data.type);
        var message = {
            t: MsgType.CustomPacket,
            contentJsonDump: JSON.stringify({ customPacketType: "greymarchChoice", type: data.type, id: data.id, name: data.name }),
        };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // Select before the world: once a character is chosen the held body goes to SkyMP as if it had just arrived, and the world loads once, there.
    // The veil's and the starting clothes' timers started at "entered"; they are moved to the moment the world has loaded (greymarchTick), so a long
    // load does not use them up.
    greymarchBodyHold(): any { return (holdMod && (holdMod as any).bodyHold) || null; }
    greymarchBodyTick(now: number): any {
        var hold = this.greymarchBodyHold();
        if (!hold) return;
        var out = hold.due(now);
        if (!out) return;
        this.greymarchLog("stage: the held body is let go (" + out.reason + ")" + (out.event ? ": the world loads now" : ": none had arrived"));
        if (!out.event) return;
        this.greymarchHeldLoadAt = now;
        this.controller.emitter.emit("createActorMessage", out.event);
        this.controller.emitter.emit("anyMessage", out.event);
    }
    greymarchRebaseAfterLoad(now: number): any {
        var from = this.greymarchHeldLoadAt;
        if (!from) return;
        this.greymarchHeldLoadAt = 0;
        var d = now - from;
        if (d <= 0) return;
        if (this.greymarchReveal) this.greymarchReveal.at += d;
        if (this.greymarchTrace) this.greymarchTrace.at += d;
        var eq = this.greymarchEquip;
        if (eq) { eq.at += d; eq.pending = eq.pending.map(function (t: number) { return t + d; }); }
        this.greymarchLog("stage: the world has loaded " + Math.round(d / 100) / 10 + " s after the held body was let go");
    }
    greymarchLoadPending(): boolean {
        try { var lg = this.controller.lookupListener ? this.controller.lookupListener(LoadGameService) : null; return !!(lg && lg.greymarchLoadPending()); } catch (e) { return false; }
    }
    // A held Play / Create (see greymarchBrowserMessage) goes to the server once the game has reported the world load (or after 60 s at most).
    greymarchChoiceTick(now: number): any {
        var held = this.greymarchHeldChoice;
        if (!held) return;
        if (this.greymarchLoadPending() && now - held.at < 60000) return;
        this.greymarchHeldChoice = null;
        this.greymarchLog("stage: the world has loaded: sending the held " + held.data.type);
        this.greymarchSendChoice(held.data);
    }
    // GREYMARCH: the staff panel (F7). The page is Platform/UI/greymarch-admin.html; the server decides what each person may do.
    greymarchAdminToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(ADMIN_SCRIPT + "window.__gmAdminSend(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the staff panel: " + err);
        }
    }
    greymarchAdminShow(mode?: any): any {
        if (this.greymarchScreenUp) return; // not while the select screen or the loading veil is up
        this.greymarchAdminOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchAdminToPage("show", mode === "tester" || mode === "dungeons" || mode === "encounters" ? mode : true);
    }
    greymarchAdminHide(): any {
        this.greymarchAdminOn = false;
        this.greymarchAdminToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); }
    }
    greymarchAdminSend(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchAdmin", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // F7 opens the panel (the page itself closes it with F7 or Escape). Escape also closes it from here, because the game un-focuses the browser on Escape.
    greymarchKey(e: any): any {
        if (this.greymarchEmoteNow && this.greymarchEmoteNow.kind === "loop" && (e.code === 17 || e.code === 30 || e.code === 31 || e.code === 32 || e.code === 57)) { var mvDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (mvDown && e.isUp !== true) this.greymarchEmoteStopWanted = Date.now(); } // W A S D or Space ends an emote that lasts (greymarchEmoteTick)
        if (e.code === 19) { var rDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) rDown = false; if (rDown && !this.greymarchKey19 && this.greymarchWolfOn && !this.greymarchChatTyping) this.greymarchWolfRoarAt = Date.now(); this.greymarchKey19 = rDown; return; } // R: the werewolf roars (greymarchWolfTick; only while changed)
        if (e.code === 44) { var zDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) zDown = false; if (zDown && !this.greymarchKey44 && !this.greymarchChatTyping) { if (this.greymarchWolfOn) this.greymarchWolfBackAt = Date.now(); else this.greymarchWolfKeyAt = Date.now(); } this.greymarchKey44 = zDown; return; } // Z while changed: ask the server to change back (greymarchWolfTick)
        if (e.code === 256 || e.code === 257) { var mDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) mDown = false; if (mDown && !this["greymarchKey" + e.code]) this.greymarchShapeButton(e.code === 257); this["greymarchKey" + e.code] = mDown; return; } // mouse buttons: a creature's attacks (greymarchShapeTick)
        if (e.code !== 65 && e.code !== 66 && e.code !== 64 && e.code !== 35 && e.code !== 1 && e.code !== 45 && e.code !== 28 && e.code !== 37 && e.code !== 34) return;
        var down = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true);
        if (e.isUp === true) down = false;
        if (e.code === 1 && down && this.greymarchChatTyping) { this.greymarchChatClose(); return; } // Esc cancels whenever the input is open (the messages stay on screen), whatever the key-up history says
        if (e.code === 28) { if (down && e.isRepeating !== true) { this.greymarchChatWanted = Date.now(); if (!this.greymarchEnterSeen) { this.greymarchEnterSeen = true; this.greymarchLog("chat: the first Enter press reached the game"); } } return; } // Enter: the chat is opened from the update phase (greymarchChatPending), where the game's menus can be asked about; a held key does not repeat it and a missed key-up can never swallow the next press
        var was = this["greymarchKey" + e.code];
        this["greymarchKey" + e.code] = down;
        if (e.code === 45 && !down && was) { this.greymarchMenuRelease(); return; } // X let go
        if (e.code === 34 && !down && was) { if (this.greymarchEmoteOn) this.greymarchEmoteToPage("release", true); else if (this.greymarchEmoteWanted) this.greymarchEmoteTapped = true; return; } // G let go: the wheel plays what the pointer is on (a quick tap leaves it open)
        if (!down || was) return;
        if (e.code === 34 && !this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.greymarchEmoteWanted = Date.now(); // G: the emote wheel, opened from the update phase (greymarchEmoteTick), where the game's menus can be asked about
        else if (e.code === 1 && this.greymarchEmoteOn) this.greymarchEmoteHide();
        else if (e.code === 45 && !this.greymarchMenuOn && !this.greymarchAdminOn && !this.greymarchChatTyping && !this.greymarchEmoteOn) this.greymarchMenuHold(); // X held while looking at a player
        else if (e.code === 1 && this.greymarchMenuOn) this.greymarchMenuEscape();
        else if (e.code === 65 && !this.greymarchAdminOn && !this.greymarchMenuOn) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchAdminShow(); }
        else if (e.code === 35 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping && !this.greymarchPanelHasKeys()) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchAdminShow("encounters"); } // H: the staff panel straight on its Encounters tab (GM and up; for anyone else the page closes again at once; the page closes it with H)
        else if (e.code === 64 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchAdminShow("dungeons"); } // F6: the staff panel straight on its Dungeons tab (GM and up; the server checks the "dungeons" command, the page closes it with F6)
        else if (e.code === 66 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping) this.greymarchAdminShow("tester"); // F8: the same panel as the tester menu (teleports, items, NPCs; the server gives testers those commands on the test server only)
        else if (e.code === 37 && !this.greymarchChatTyping && !this.greymarchEmoteOn && !(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)) this.greymarchProfWanted = Date.now(); // K opens the professions window from the update phase (greymarchProfPending), where the game's menus can be asked about (the page itself closes it with K or Esc, like the staff panel with F7)
        else if (e.code === 1 && this.greymarchProfOn) this.greymarchProfHide();
        else if (e.code === 1 && this.greymarchChanceryOn) this.greymarchChanceryHide();
        else if (e.code === 1 && this.greymarchVampMenuOn) this.greymarchVampMenuHide();
        else if (e.code === 1 && this.greymarchAdminOn) this.greymarchAdminHide();
    }
    // ---- THE WEREWOLF FORM: the game's OWN power "Beast Form" (the spell WerewolfChange, Skyrim.esm 0x092C48) is the trigger; the SERVER decides; THIS CODE does the change.
    // WHY NOT THE GAME'S OWN SCRIPTS: SkyMP blocks Papyrus events on the client (BlockPapyrusEventsService calls blockPapyrusEvents(true); SkyrimPlatform's hook on the VM's
    // SendEvent then blanks every event name except OnUpdate and SkyUI's). So the power IS cast, but the effect script's OnEffectStart (WerewolfChangeEffectScript, which starts the quest
    // PlayerWerewolfQuest that does the change) never runs. Unblocking would let every vanilla script in the world run again, so the change is done here, step by step as the vanilla
    // quest script PlayerWerewolfChangeScript does it (PrepShift, InitialShift, StartTracking, and ActuallyShiftBackIfNecessary for the way back).
    //   1. The power is used: the game's own events say so (spellCast of WerewolfChange, effectStart / magicEffectApply of its effect WerewolfChangeEffect 0x092C45, or the effect seen
    //      on the player). Those are game events, not Papyrus events, so they are not blocked. This is REPORTED ({ customPacketType: "greymarchWolf", op: "game", beast: true }).
    //   2. The server answers { customPacketType: "greymarchWolfForm", on: true | false } (greymarchWolfWant). true: the transformation animation plays (greymarchWolfBecome), then the
    //      change is done here (greymarchWolfChange). While changed, R roars and { customPacketType: "greymarchWolfFeed" } plays the feeding animation. The server repeats it
    //      every 5 seconds while the form lasts; with no word for 20 seconds (the server restarted) the player is changed back.
    //   3. on: false (refused, hunger, death, the server ended it): changed back here (greymarchWolfUnbecome) and the next use of the power is reported afresh.
    greymarchWolfRoarSound(at: any, bear: boolean): any { try { var snd = this.sp.Sound.from(this.sp.Game.getFormEx(bear ? BEAR_ROAR_SOUND : WOLF_ROAR_SOUND)); if (snd && at) snd.play(at); } catch (sErr) { /* a sound is a nicety */ } }
    greymarchWolfSignal(why: string): any { // called from game event handlers: only remembers it (Skyrim functions are used in the update phase)
        if (!this.greymarchWolfUsed) this.greymarchWolfUsed = { at: Date.now(), why: why };
    }
    greymarchWolfTick(): any {
        var now = Date.now();
        if (now < (this.greymarchWolfNext || 0)) return;
        this.greymarchWolfNext = now + 250;
        try {
            var sp = this.sp;
            var player = sp.Game.getPlayer();
            if (!player) return;
            var race = player.getRace();
            var raceId = race ? race.getFormID() : 0;
            if (!this.greymarchWolfOn && raceId && !this.greymarchWolfIsBeast(raceId)) this.greymarchWolfHumanRace = raceId; // the race to go back to
            if (now >= (this.greymarchWolfPowerNext || 0)) { // for the log: is Beast Form in the player's spell list?
                this.greymarchWolfPowerNext = now + 5000;
                try { var pw = sp.Spell.from(sp.Game.getFormEx(0x92c48)); var has = !!pw && player.hasSpell(pw); if (has !== this.greymarchWolfHadPower) { this.greymarchWolfHadPower = has; this.greymarchLog("wolf: the Beast Form power is " + (has ? "in" : "NOT in") + " the player's spell list"); } } catch (pErr) { /* not important */ }
            }
            try { // the power's effect on the player is a signal too (in case the game events are missed)
                var fx = sp.MagicEffect.from(sp.Game.getFormEx(0x92c45));
                var fxOn = !!fx && player.hasMagicEffect(fx);
                if (fxOn && !this.greymarchWolfFxWas) { this.greymarchWolfSignal("effect seen on the player"); var pw2 = sp.Spell.from(sp.Game.getFormEx(0x92c48)); if (pw2) player.dispelSpell(pw2); } // dispelled so the next use is a new one
                this.greymarchWolfFxWas = fxOn;
            } catch (fxErr) { /* the events still work */ }
            // Z WITH BEAST FORM IN THE POWER SLOT, AND THE GAME DID NOT CAST IT. The game can keep its own lock on the power and answer Z with the "not ready yet" sound
            // (2026-10-20: players heard it and the server never heard of the use). The SERVER owns the cooldown, so the press itself is reported when no cast is seen within
            // WOLF_KEY_WAIT_MS; the server still decides (the blood, its cooldown) and says yes or no as for a cast.
            var keyAt = this.greymarchWolfKeyAt;
            if (keyAt && (this.greymarchWolfOn || this.greymarchWolfUsed || now - keyAt > 3000)) this.greymarchWolfKeyAt = 0;
            else if (keyAt && now - keyAt >= WOLF_KEY_WAIT_MS) {
                this.greymarchWolfKeyAt = 0;
                var inMenuK = false; try { inMenuK = !!sp.Utility.isInMenuMode(); } catch (kmErr) { inMenuK = false; }
                var slotted = false; try { var eq = player.getEquippedSpell(2); slotted = !!eq && eq.getFormID() === 0x92c48; } catch (eqErr) { slotted = false; }
                if (slotted && !inMenuK) { this.greymarchLog("wolf: Z with Beast Form in the power slot and no cast seen (the game's own lock?): the use is reported to the server"); this.greymarchWolfSignal("Z with Beast Form equipped"); }
            }
            var used = this.greymarchWolfUsed;
            if (used) {
                if (!used.logged) { used.logged = true; this.greymarchLog("wolf: the Beast Form power was used (" + used.why + ")"); }
                if (this.greymarchWolfOn) this.greymarchWolfUsed = null;                    // already changed: nothing to ask
                else if (this.greymarchWolfWant === true || this.greymarchWolfWant === false) this.greymarchWolfUsed = null; // the server answered
                else if (now - used.at > 12000) { this.greymarchWolfUsed = null; this.greymarchLog("wolf: the server did not answer the use of the power"); }
                else if (now - (this.greymarchWolfReportAt || 0) >= 3000) { this.greymarchWolfReportAt = now; this.greymarchWolfReport(true); }
            }
            var want = this.greymarchWolfWant;
            if (want === true && now - (this.greymarchWolfWordAt || 0) > 20000) { // the server stopped saying "changed" (it restarted, or the packet stream broke)
                this.greymarchLog("wolf: no word from the server for 20 seconds: changing back");
                this.greymarchWolfWant = want = undefined;
            }
            if (want === true) {
                var morph = this.greymarchWolfMorph;
                if (!this.greymarchWolfOn) this.greymarchWolfBecome(player);
                else if (morph) { // the transformation animation is playing: the body changes on its "SetRace" cue (or after WOLF_MORPH_MS if the cue is never seen)
                    if (morph.cue || now - morph.at >= WOLF_MORPH_MS) { this.greymarchWolfMorph = null; this.greymarchLog("wolf: the transformation reached the race change (" + (morph.cue ? "the animation's SetRace cue" : "timer") + ", " + (now - morph.at) + " ms)"); this.greymarchWolfChange(player); }
                }
                else if (raceId !== this.greymarchWolfRaceId() && now - (this.greymarchWolfRaceFixAt || 0) > 3000) { // something put another race back while the server says changed (or staff switched Alpha on or off)
                    this.greymarchWolfRaceFixAt = now;
                    var wr = this.greymarchWolfRace();
                    if (wr) { player.setRace(wr); this.greymarchLog("wolf: the race was not the beast's any more: set again"); }
                }
            } else {
                if (this.greymarchWolfOn) this.greymarchWolfUnbecome(player);
                if (want === false) this.greymarchWolfWant = undefined; // handled: the next use of the power is reported afresh
            }
            this.greymarchWolfAlphaOthers(now);
            this.greymarchWolfDress(player, now);
            // Z while changed: the player asks to change back. The server decides (it ends the form with the normal cooldown and says on: false); nothing is changed here first.
            // Not mid-transformation, not in a menu, not in the first WOLF_BACK_GRACE_MS after the change (the Z press that started the change cannot also end it).
            var backAt = this.greymarchWolfBackAt;
            if (backAt) {
                this.greymarchWolfBackAt = 0;
                var inMenuZ = false; try { inMenuZ = !!sp.Utility.isInMenuMode(); } catch (mzErr) { inMenuZ = false; }
                if (this.greymarchWolfOn && !this.greymarchWolfMorph && !inMenuZ && now - backAt < 1000 && now - (this.greymarchWolfChangedAt || 0) >= WOLF_BACK_GRACE_MS) {
                    this.greymarchLog("wolf: Z pressed while changed: asking the server to change back");
                    this.greymarchWolfReport(false);
                }
            }
            // R: THE ROAR. Only while changed, not mid-transformation, not in a menu, once per press (no wait since 2026-10-21). A WEREWOLF and a WEREBEAR play the vanilla
            // howl on their OWN body (HowlStart / HowlRelease, with its own sound), and a werebear also a bear's roar sound. (The werebear's howl was taken away on 2026-10-19
            // after it crashed that player's game once, before the Havok memory and other crash fixes; it is back on the owner's call.) It is reported, and the server sends it to
            // every player near enough, whose games play the SOUND on this player's NPC; they never play a howl event on a beast (formView.ts drops it: SkyMP passes the
            // event on, and played into the watching game's NPC the howl clip crashed it, "WW Howl.hkx", SkyrimSE.exe+0A8C590).
            var roarAt = this.greymarchWolfRoarAt;
            if (roarAt) {
                this.greymarchWolfRoarAt = 0;
                var inMenu = false; try { inMenu = !!sp.Utility.isInMenuMode(); } catch (mErr) { inMenu = false; }
                if (this.greymarchWolfOn && !this.greymarchWolfMorph && this.greymarchWolfIsBeast(raceId) && !inMenu && now - roarAt < 1000 && now >= (this.greymarchWolfRoarNext || 0)) {
                    this.greymarchWolfRoarNext = now + WOLF_ROAR_MS;
                    this.greymarchCrumb("beast: howl"); sp.Debug.sendAnimationEvent(player, "HowlStart"); this.greymarchWolfRoarRelease = now + 200; // released at once: a short howl, as a quick tap of the shout key does it
                    if (this.greymarchWolfBearRace) { this.greymarchWolfRoarSound(player, true); this.greymarchLog("wolf: roar (R, the werebear's howl and roar)"); }
                    else this.greymarchLog("wolf: roar (R, the howl)");
                    // reported: the server sends it to every player near enough to hear it (werewolf.js howl; it keeps the same wait)
                    var howlMsg = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchWolf", op: "howl" }) };
                    this.controller.emitter.emit("sendMessage", { message: howlMsg, reliability: "reliable" });
                }
            }
            if (this.greymarchWolfRoarRelease && now >= this.greymarchWolfRoarRelease) { this.greymarchWolfRoarRelease = 0; if (this.greymarchWolfOn) sp.Debug.sendAnimationEvent(player, "HowlRelease"); }
            // other players' roars: the sound on their NPC here (never an animation)
            var roars = this.greymarchWolfRoarQueue;
            if (roars && roars.length) {
                this.greymarchWolfRoarQueue = [];
                for (var ri = 0; ri < roars.length && ri < 8; ri++) {
                    try { var rl = misc.remoteIdToLocalId(roars[ri].actor); var who = rl ? sp.ObjectReference.from(sp.Game.getFormEx(rl)) : null; if (who) this.greymarchWolfRoarSound(who, roars[ri].bear); } catch (rErr) { /* not drawn here: not heard */ }
                }
            }
            // the server says the wolf fed (a kill or a corpse): the vanilla feeding animation (PlayerWerewolfChangeScript.Feed plays the idle SpecialFeeding)
            var feedAt = this.greymarchWolfFeedAt;
            if (feedAt && this.greymarchWolfOn && !this.greymarchWolfMorph && this.greymarchWolfIsBeast(raceId)) {
                this.greymarchWolfFeedAt = 0;
                var feedIdle = sp.Idle.from(sp.Game.getFormEx(0xd23b7));
                var fed = !!feedIdle && player.playIdle(feedIdle);
                this.greymarchLog("wolf: feeding animation " + (fed ? "played" : "refused by the game"));
            } else if (feedAt && now - feedAt > 8000) this.greymarchWolfFeedAt = 0; // still changing (or changed back): too late for it
        } catch (wolfErr) {
            if (!this.greymarchWolfErrLogged) { this.greymarchWolfErrLogged = true; this.greymarchLog("wolf: " + wolfErr); }
        }
    }
    // The transformation animation first, as the vanilla WerewolfTransformVisual does it for every werewolf: the human body plays IdleWerewolfTransformation (Skyrim.esm 0x02A59D,
    // the WW_Stage1..9 clips of 0_Master.hkx) and the race is switched on the animation's own "SetRace" cue (about 4 seconds in). The cue is awaited with the latent
    // waitForAnimationEvent (not a Papyrus event, so SkyMP does not block it); WOLF_MORPH_MS is the fallback if it never comes. greymarchWolfTick then calls greymarchWolfChange.
    // SkyMP sends the player's animation events to the other games, so other players see the transformation too.
    greymarchWolfBecome(player: any): any {
        this.greymarchCrumb("beast: change starts");
        var sp = this.sp;
        this.greymarchWolfOn = true;
        // while changed, SkyMP keeps the character's own look aside instead of writing it onto the beast's body halfway (remoteServer.ts); it is put on properly after the way back
        try { (sp.storage as any)["greymarchWolfOn"] = true; } catch (stErr) { /* the look is then applied as it comes */ }
        var morph = { at: Date.now(), cue: false };
        var played = false;
        try { sp.Game.forceThirdPerson(); } catch (cErr) { /* the change sets the camera anyway */ } // the animation is seen from outside
        try { var idle = sp.Idle.from(sp.Game.getFormEx(0x2a59d)); played = !!idle && player.playIdle(idle); } catch (iErr) { played = false; }
        if (!played) { this.greymarchLog("wolf: the game refused the transformation animation (swimming, mid-air, in a scene?): changing at once"); this.greymarchWolfChange(player); return; }
        this.greymarchWolfMorph = morph;
        this.greymarchLog("wolf: the transformation animation started");
        try { player.waitForAnimationEvent("SetRace").then(function (ok: boolean) { if (ok) morph.cue = true; }, function () { /* the timer changes them */ }); } catch (wErr) { /* the timer changes them */ }
    }
    // The change, as the vanilla PrepShift / InitialShift / StartTracking do it (the howl, the level abilities, factions and crime are left out: the server owns the form's rules).
    greymarchWolfChange(player: any): any {
        var sp = this.sp;
        var step = "start";
        try {
            this.greymarchWolfChangedAt = Date.now();
            step = "beast form"; sp.Game.setBeastForm(true);
            step = "fast travel"; sp.Game.enableFastTravel(false);
            step = "image"; try { var im = sp.ImageSpaceModifier.from(sp.Game.getFormEx(0x48428)); if (im) im.apply(1); var snd = sp.Sound.from(sp.Game.getFormEx(0x10fccd)); if (snd) snd.play(player); } catch (imErr) { /* the look of the screen is a nicety */ }
            step = "dispel"; try { var dl = sp.FormList.from(sp.Game.getFormEx(0x10dea0)); var n = dl ? dl.getSize() : 0; for (var i = 0; i < n; i++) { var s = sp.Spell.from(dl.getAt(i)); if (s) player.dispelSpell(s); } } catch (dErr) { /* nothing to dispel */ }
            step = "controls"; sp.Game.disablePlayerControls(false, false, true, false, false, false, false, false, 1);
            step = "camera"; sp.Game.forceThirdPerson(); sp.Game.showFirstPersonGeometry(false);
            step = "gear"; this.greymarchWolfWear = this.greymarchWolfWorn(player); // put back on after the way back
            step = "unequip"; player.unequipAll();
            step = "race"; var wr = this.greymarchWolfRace(); if (!wr) throw new Error("the werewolf race was not found");
            player.setRace(wr);
            step = "check"; var r = player.getRace();
            this.greymarchLog("wolf: changed into the " + (this.greymarchWolfBearRace ? "werebear" : (this.greymarchWolfKind ? GM_WOLF_FORMS[this.greymarchWolfKind][1] + " " : "") + "beast") + " (race now " + (r ? r.getFormID().toString(16) : "none") + ", will change back to " + (this.greymarchWolfHumanRace || 0).toString(16) + ")");
        } catch (bErr) {
            this.greymarchLog("wolf: the change failed at step '" + step + "': " + bErr);
        }
    }
    // The way back, as the vanilla ActuallyShiftBackIfNecessary does it.
    greymarchWolfUnbecome(player: any): any {
        this.greymarchCrumb("beast: change back");
        var sp = this.sp;
        this.greymarchWolfOn = false;
        this.greymarchWolfRoarRelease = 0;
        if (this.greymarchWolfMorph) { // still in the transformation animation: nothing was changed yet, only the animation is stopped
            this.greymarchWolfMorph = null;
            try { sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); } catch (sErr) { /* it ends by itself */ }
            this.greymarchLog("wolf: the transformation was stopped before the body changed");
            try { (sp.storage as any)["greymarchWolfOn"] = false; } catch (stErr) { /* nothing was set */ }
            this.greymarchWolfWearAt = Date.now() + 200; // a look the server sent meanwhile goes on (nothing else was changed)
            return;
        }
        var step = "start";
        try {
            step = "image"; try { var im = sp.ImageSpaceModifier.from(sp.Game.getFormEx(0x48428)); if (im) im.apply(1); var snd = sp.Sound.from(sp.Game.getFormEx(0x10fccd)); if (snd) snd.play(player); } catch (imErr) { /* a nicety */ }
            step = "dispel"; try { var dl = sp.FormList.from(sp.Game.getFormEx(0x10dea0)); var n = dl ? dl.getSize() : 0; for (var i = 0; i < n; i++) { var s = sp.Spell.from(dl.getAt(i)); if (s) player.dispelSpell(s); } } catch (dErr) { /* nothing to dispel */ }
            step = "race";
            var back = this.greymarchWolfHumanRace ? sp.Race.from(sp.Game.getFormEx(this.greymarchWolfHumanRace)) : null;
            if (!back) { try { var base = sp.ActorBase.from(player.getBaseObject()); var br = base ? base.getRace() : null; if (br && !this.greymarchWolfIsBeast(br.getFormID())) back = br; } catch (baseErr) { /* below */ } }
            if (back) player.setRace(back); else this.greymarchLog("wolf: no human race known to change back to");
            step = "controls"; sp.Game.enablePlayerControls(false, false, true, false, false, false, false, false, 1);
            step = "camera"; sp.Game.showFirstPersonGeometry(true);
            step = "beast form"; sp.Game.setBeastForm(false);
            step = "fast travel"; sp.Game.enableFastTravel(true);
            step = "animation"; sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); // the person's animations from their idle
            step = "redraw"; player.queueNiNodeUpdate();
            try { (sp.storage as any)["greymarchWolfOn"] = false; } catch (stErr) { /* nothing was set */ }
            this.greymarchWolfWearAt = Date.now() + 1000; // the character's own look (kept aside by SkyMP) and the gear, a moment later: the person's skeleton must be in place first
            var r = player.getRace();
            this.greymarchLog("wolf: changed back (race now " + (r ? r.getFormID().toString(16) : "none") + ")");
        } catch (uErr) {
            this.greymarchLog("wolf: changing back failed at step '" + step + "': " + uErr);
        }
    }
    // THE ALPHA FORM (the server says alpha: true): a white/grey werewolf, 1.3 times the size, the race GM_AlphaWerewolfBeastRace in GreymarchCore.esp (0x804; a copy of
    // WerewolfBeastRace with its own skin, the vanilla body with the white textures, and 1.3 times its height). GreymarchCore.esp is not on the server's plugin list, so the
    // server cannot name the race by number: it says alpha and this code finds the race in the file. If it is missing, the normal werewolf race is used.
    // The gear worn and held when the change starts (armor in every body slot, both hands, the shield): put back on after the way back.
    greymarchWolfWorn(player: any): number[] {
        var ids: any = {};
        for (var b = 0; b < 32; b++) { try { var f = player.getWornForm(Math.pow(2, b)); if (f) ids[f.getFormID()] = true; } catch (e) { /* that slot is empty */ } }
        try { var w1 = player.getEquippedWeapon(false); if (w1) ids[w1.getFormID()] = true; } catch (e1) { /* nothing in the right hand */ }
        try { var w2 = player.getEquippedWeapon(true); if (w2) ids[w2.getFormID()] = true; } catch (e2) { /* nothing in the left hand */ }
        try { var sh = player.getEquippedShield(); if (sh) ids[sh.getFormID()] = true; } catch (e3) { /* no shield */ }
        return Object.keys(ids).map(function (k) { return Number(k); });
    }
    // After the way back: the character's own look that SkyMP kept aside is put on properly (face, head parts, body), then the gear goes back on.
    greymarchWolfDress(player: any, now: number): any {
        var at = this.greymarchWolfWearAt;
        if (!at || now < at || this.greymarchWolfOn) return;
        this.greymarchWolfWearAt = 0;
        var sp = this.sp;
        var kept = null; try { kept = (sp.storage as any)["greymarchPendingAppearance"]; (sp.storage as any)["greymarchPendingAppearance"] = null; } catch (kErr) { kept = null; }
        if (kept && !this.greymarchShapeOn) { try { appearanceMod.applyAppearanceToPlayer(kept); this.greymarchLog("wolf: the character's own look put back"); } catch (aErr) { this.greymarchLog("wolf: the own look could not be put back: " + aErr); } }
        var list = this.greymarchWolfWear || [];
        this.greymarchWolfWear = [];
        var put = 0;
        for (var i = 0; i < list.length; i++) {
            try { var f = sp.Game.getFormEx(list[i]); if (f && player.getItemCount(f) > 0) { player.equipItem(f, false, true); put++; } } catch (eErr) { /* that one stays in the inventory */ }
        }
        if (list.length) this.greymarchLog("wolf: put " + put + " of " + list.length + " worn items back on");
    }
    // THE PUP (the server says pup: true): a smaller brown werewolf, 0.75 times the size, GM_PupWerewolfBeastRace (0x80A in GreymarchCore.esp), found the same way.
    greymarchWolfKindRaceId(kind: string): number {
        var cache = this.greymarchWolfKindIds || (this.greymarchWolfKindIds = {});
        if (cache[kind] === undefined) {
            var form = GM_WOLF_FORMS[kind] || GM_WOLF_FORMS.alpha, id = 0, local = form[0], name = form[1];
            try { var f = this.sp.Game.getFormFromFile(local, "GreymarchCore.esp"); id = f ? f.getFormID() : 0; } catch (e) { id = 0; }
            cache[kind] = id;
            this.greymarchLog(id ? "wolf: the " + name + " race is " + id.toString(16) : "wolf: the " + name + " race is not in GreymarchCore.esp; the " + name + " form uses the normal " + (kind === "black" || kind === "polar" ? "werebear" : "werewolf"));
        }
        return cache[kind];
    }
    greymarchWolfAlphaRaceId(): number { return this.greymarchWolfKindRaceId("alpha"); }
    greymarchWolfPupRaceId(): number { return this.greymarchWolfKindRaceId("pup"); }
    // THE BLACK BEAR (the server says bear and black: true): a werebear with black fur and a tan muzzle, GM_BlackBearWerebearRace (0x85C in GreymarchCore.esp)
    greymarchWolfBlackRaceId(): number { return this.greymarchWolfKindRaceId("black"); }
    // THE POLAR BEAR (the server says bear and polar: true): a werebear with creamy white fur, GM_PolarBearWerebearRace (0x861 in GreymarchCore.esp)
    greymarchWolfPolarRaceId(): number { return this.greymarchWolfKindRaceId("polar"); }
    // THE BEAR BLOOD (the server says bear: true, race: the werebear race in this load order, Dragonborn's DLC2WerebearBeastRace): the body becomes the werebear
    greymarchWolfIsBeast(raceId: number): boolean {
        if (raceId === 0xcdd84) return true;
        if (!raceId) return false;
        if (raceId === this.greymarchWolfBearSeen) return true;
        for (var k in GM_WOLF_FORMS) if (raceId === this.greymarchWolfKindRaceId(k)) return true;
        return false;
    }
    greymarchWolfRaceId(): number { return (this.greymarchWolfBearRace && this.greymarchWolfPolar && this.greymarchWolfPolarRaceId()) || (this.greymarchWolfBearRace && this.greymarchWolfBlack && this.greymarchWolfBlackRaceId()) || this.greymarchWolfBearRace || (this.greymarchWolfKind && this.greymarchWolfKindRaceId(this.greymarchWolfKind)) || 0xcdd84; }
    greymarchWolfRace(): any { return this.sp.Race.from(this.sp.Game.getFormEx(this.greymarchWolfRaceId())); }
    // Other players in one of the forms (GM_WOLF_FORMS: an Alpha, a pup, a Frost Wolf, a Rabid Wolf, a Moonborn, an Elder Alpha, a black or polar bear): SkyMP draws them with the race of their appearance, which the server can only set to the normal werewolf. Every second the
    // lists become __gmWolfRace (server actor id -> the variant's race), which formView.ts uses to BUILD that player's NPC with the variant's race (it respawns it when
    // the race changes). Never a SetRace on another player's live actor: that rebuilt its skeleton's physics while SkyMP moved it and crashed the game.
    greymarchWolfAlphaOthers(now: number): any {
        if (now < (this.greymarchWolfAlphaNext || 0)) return;
        this.greymarchWolfAlphaNext = now + 1000;
        var lists = this.greymarchWolfLists || {};
        var before = this.greymarchWolfRaceMap || {};
        var any = false;
        for (var lk in lists) if (lists[lk].length) any = true;
        if (!any && !Object.keys(before).length) return;
        var map: any = {}, names: any = {};
        for (var kind in lists) {
            var list = lists[kind];
            var raceId = list.length ? this.greymarchWolfKindRaceId(kind) : 0;
            if (!raceId) continue;
            for (var i = 0; i < list.length; i++) if (list[i] !== this.greymarchMeActor) { map[list[i]] = raceId; names[list[i]] = GM_WOLF_FORMS[kind][1]; }
        }
        for (var k in map) if (before[k] !== map[k]) this.greymarchLog("wolf: " + Number(k).toString(16) + " drawn as the " + names[k]);
        for (var k2 in before) if (!map[k2]) this.greymarchLog("wolf: " + Number(k2).toString(16) + " drawn as the normal beast again");
        this.greymarchWolfRaceMap = map;
        try { (Function("return this")() as any).__gmWolfRace = map; } catch (gErr) { /* drawn as the normal werewolf */ }
    }
    // ---- VAMPIRES (gamemode vampire.js decides everything; this only reports what the game did and shows what the server says)
    greymarchVampForm(key: string): number { // the real ID of one of VAMP_FORMS in this game's load order (0 while unknown)
        var ids = this.greymarchVampIds || (this.greymarchVampIds = {});
        if (ids[key] === undefined) { try { var fm = this.sp.Game.getFormFromFile((VAMP_FORMS as any)[key], "Dawnguard.esm"); ids[key] = fm ? fm.getFormID() : 0; } catch (e) { ids[key] = 0; } }
        return ids[key];
    }
    greymarchVampSignal(kind: string, id: number): any { // called from game event handlers: only remembered (the update phase looks the IDs up and reports)
        var q = this.greymarchVampSignals || (this.greymarchVampSignals = []);
        if (q.length < 8) q.push({ kind: kind, id: id });
    }
    // What happened to a vampire's fangs on this screen, straight to the server (greymarchVamp op "fangs"), which always writes it to its log. Diagnostic lines through
    // greymarchLog are rate-limited by the server and can be lost right after loading, when the fangs go on. Sent only when the result changes for that character.
    greymarchVampFangReport(actor: number, localId: number, result: string, detail?: string): any {
        var said = this.greymarchVampFangSaid || (this.greymarchVampFangSaid = {});
        if (said[localId] === result) return;
        said[localId] = result;
        this.greymarchVampSend({ op: "fangs", actor: actor, self: localId === 0x14, result: result, detail: detail || "" });
    }
    greymarchVampSend(msg: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify(Object.assign({ customPacketType: "greymarchVamp" }, msg)) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchVampTick(): any {
        var sp = this.sp, now = Date.now();
        var want = this.greymarchVampWant;
        // the game's own powers and the Potion of Blood: reported; the server says yes or no
        var q = this.greymarchVampSignals;
        if (q && q.length) {
            this.greymarchVampSignals = [];
            for (var i = 0; i < q.length; i++) {
                var s = q[i];
                if (s.kind === "cast" && s.id && s.id === this.greymarchVampForm("mist")) { this.greymarchLog("vampire: Mist Form used"); this.greymarchVampSend({ op: "game", power: "mist", on: true }); }
                else if (s.kind === "cast" && s.id && s.id === this.greymarchVampForm("lord")) { this.greymarchLog("vampire: the Vampire Lord power used"); this.greymarchVampSend({ op: "game", power: "lord", on: true }); }
                else if (((s.kind === "effect" && s.id === this.greymarchVampForm("potionFx")) || (s.kind === "equip" && s.id === this.greymarchVampForm("potion"))) && s.id && now - (this.greymarchVampDrankAt || 0) > 1000) { this.greymarchVampDrankAt = now; this.greymarchLog("vampire: a Potion of Blood was drunk (" + s.kind + ")"); this.greymarchVampSend({ op: "drank" }); }
            }
        }
        var player: any = null;
        try { player = sp.Game.getPlayer(); } catch (e) { player = null; }
        if (!player) return;
        // the abilities the server names (water walking, poison and disease resistance, magicka regeneration): set when they change, put back when vampirism goes
        var key = want ? [want.waterWalk ? 1 : 0, want.poisonResist || 0, want.diseaseResist || 0, want.magickaRegen || 0].join(",") : "";
        if (key !== (this.greymarchVampAvKey || "")) {
            var orig = this.greymarchVampAvOrig;
            try {
                if (want && !orig) { orig = this.greymarchVampAvOrig = { WaterWalking: player.getBaseActorValue("WaterWalking"), PoisonResist: player.getBaseActorValue("PoisonResist"), DiseaseResist: player.getBaseActorValue("DiseaseResist"), MagickaRateMult: player.getBaseActorValue("MagickaRateMult") }; }
                if (want) {
                    player.setActorValue("WaterWalking", want.waterWalk ? 1 : orig.WaterWalking);
                    player.setActorValue("PoisonResist", orig.PoisonResist + (want.poisonResist || 0));
                    player.setActorValue("DiseaseResist", orig.DiseaseResist + (want.diseaseResist || 0));
                    player.setActorValue("MagickaRateMult", orig.MagickaRateMult + (want.magickaRegen || 0));
                } else if (orig) {
                    for (var av in orig) player.setActorValue(av, orig[av]);
                    this.greymarchVampAvOrig = null;
                }
                this.greymarchVampAvKey = key;
                this.greymarchLog("vampire: abilities " + (want ? "set (" + key + ")" : "taken away"));
            } catch (avErr) { this.greymarchVampAvKey = key; this.greymarchLog("vampire: the abilities could not be set: " + avErr); }
        }
        // no Restoration magic: a Restoration spell put in a hand is taken out of it again
        if (want && want.noRestoration && now >= (this.greymarchVampRestoNext || 0)) {
            this.greymarchVampRestoNext = now + 500;
            for (var slot = 0; slot <= 1; slot++) {
                try {
                    var spell = player.getEquippedSpell(slot);
                    var fx = spell ? spell.getNthEffectMagicEffect(0) : null;
                    if (fx && fx.getAssociatedSkill() === "Restoration") {
                        player.unequipSpell(spell, slot);
                        if (now - (this.greymarchVampRestoToldAt || 0) > 10000) { this.greymarchVampRestoToldAt = now; sp.Debug.notification("Restoration magic will not answer the dead in your veins."); }
                    }
                } catch (rErr) { /* the next look */ }
            }
        }
        // Mist Form refused or over: the game's own mist ends
        if (this.greymarchVampMistEnd) {
            this.greymarchVampMistEnd = false;
            try { var ms = sp.Spell.from(sp.Game.getFormEx(this.greymarchVampForm("mist"))); if (ms) player.dispelSpell(ms); } catch (mErr) { /* it ends by itself */ }
        }
        // the feeding scene: the vampire's body plays the vanilla standing feed with the victim (on both players' games); off puts both back to their idle
        var fd = this.greymarchVampFeedWant;
        if (fd && !fd.done) {
            fd.done = true;
            var other: any = null;
            try { var lid = misc.remoteIdToLocalId(fd.partner); other = lid ? sp.Actor.from(sp.Game.getFormEx(lid)) : null; } catch (oErr) { other = null; }
            if (fd.off) {
                this.greymarchVampFeedWant = null;
                try { sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); } catch (e1) { /* it ends by itself */ }
                var was = this.greymarchVampFeedOther; this.greymarchVampFeedOther = null;
                if (was) { try { sp.Debug.sendAnimationEvent(was, "IdleForceDefaultState"); } catch (e2) { /* gone */ } }
            } else if (!other) this.greymarchLog("vampire: the feeding partner is not loaded here");
            else {
                this.greymarchVampFeedOther = other;
                var biter = fd.role === "vampire" ? player : other, bitten = fd.role === "vampire" ? other : player;
                var played = false;
                try { var idle = sp.Idle.from(sp.Game.getFormEx(this.greymarchVampForm("feedIdle"))); played = !!idle && !!biter.playIdleWithTarget(idle, bitten); } catch (pErr) { played = false; }
                this.greymarchLog("vampire: feeding (" + fd.role + "), the animation " + (played ? "plays" : "was refused by the game"));
            }
        }
        this.greymarchVampFangsWear(now); // the worn fangs the server gave: put on (SkyMP then shows them to everyone)
        this.greymarchVampEyes(now); // every vampire's blue eyes, on this screen
    }
    // Every vampire in the world (the player included) gets their bloodline's eye part for their glow and, while their fangs show, the fanged teeth, by the server's
    // list (greymarchVampLooks). Only those parts change: the character is not redrawn. Their OWN eyes and teeth are kept and put back while /eyes or /fangs hides
    // them (glow 0) and when they are no longer a vampire. Greymarch's own eye parts never count as "their own" (a reload or a colour change finds one already on).
    // Checked again every 2 seconds, because SkyMP puts a character's saved look back now and then (a load, a redraw): that look is their own eyes, kept again.
    greymarchVampEyes(now: number): any {
        if (now < (this.greymarchVampEyesNext || 0)) return;
        this.greymarchVampEyesNext = now + 2000;
        var sp = this.sp, list = this.greymarchVampLookList || [];
        var done = this.greymarchVampEyesDone || (this.greymarchVampEyesDone = {}); // localId -> { orig: eye head part id, glow, mouth: teeth head part id, fangs }
        var seen: any = {};
        if (!list.length && !Object.keys(done).length) return;
        var gmOff = -1; // GreymarchCore.esp's place in this game's load order
        try { var gmBlue = sp.HeadPart.from(sp.Game.getFormFromFile(VAMP_EYES.blue.male, "GreymarchCore.esp")); if (gmBlue) gmOff = gmBlue.getFormID() - VAMP_EYES.blue.male; } catch (gErr) { gmOff = -1; }
        var ours = function (id: number) { return gmOff >= 0 && id - gmOff >= 0x80d && id - gmOff <= 0x859; }; // one of Greymarch's vampire eye parts
        var skipped = this.greymarchVampEyesSkipped || (this.greymarchVampEyesSkipped = {});
        for (var i = 0; i < list.length; i++) {
            var v = list[i];
            var localId = this.greymarchMeActor && v.actor === this.greymarchMeActor ? 0x14 : misc.remoteIdToLocalId(v.actor);
            if (!localId) continue;
            seen[localId] = true;
            try {
                var actor = localId === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(localId));
                if (!actor) continue;
                var race = actor.getRace();
                if (!race || VAMP_EYE_RACES.indexOf(race.getFormID()) < 0) { // a beast race (khajiit and argonian eyes are not made yet), or in a creature's or the Lord's shape
                    var rid = race ? race.getFormID() : 0;
                    if (skipped[localId] !== rid) { skipped[localId] = rid; this.greymarchLog("vampire: " + localId.toString(16) + " keeps their eyes: no vampire eyes for race " + rid.toString(16) + " yet"); }
                    if (v.fangs) this.greymarchVampFangReport(v.actor, localId, "no vampire eyes or fangs for race " + rid.toString(16));
                    continue;
                }
                var base = sp.ActorBase.from(actor.getBaseObject());
                if (!base) continue;
                var female = base.getSex() === 1;
                var glow = Math.max(0, Math.min(6, Number(v.glow) || 0));
                var colour = VAMP_EYES[v.eyes] ? v.eyes : "blue"; // the bloodline's colour
                var hp = sp.HeadPart.from(sp.Game.getFormFromFile((female ? VAMP_EYES[colour].female : VAMP_EYES[colour].male) + glow, "GreymarchCore.esp"));
                if (!hp) { if (!this.greymarchVampEyesMissing) { this.greymarchVampEyesMissing = true; this.greymarchLog("vampire: the blue eye parts are not in GreymarchCore.esp (old game files?)"); } return; }
                var cur = this.greymarchVampEyePart(base, 2);
                var mouth = this.greymarchVampEyePart(base, 0);
                var rec = done[localId];
                if (!rec) rec = done[localId] = { orig: 0, key: "", mouth: 0, fangs: false };
                if (cur && !ours(cur.getFormID())) rec.orig = cur.getFormID(); // what they wear that is not ours is their own eyes (SkyMP may have put their look back)
                var own = glow === 0 && rec.orig ? sp.HeadPart.from(sp.Game.getFormEx(rec.orig)) : null; // /eyes hides them: their own eyes
                var wantEyes = own || hp, key = own ? "own" : colour + glow;
                if (!(rec.key === key && cur && cur.getFormID() === wantEyes.getFormID())) {
                    actor.changeHeadPart(wantEyes);
                    if (rec.key !== key) this.greymarchLog("vampire: " + localId.toString(16) + (own ? " shows their own eyes (/eyes)" : " has " + colour + " eyes, glow " + glow));
                    rec.key = key;
                }
                // THE FANGS are a worn item now: the server puts GreymarchCore's "Vampire Fangs" on a vampire while their fangs show (vampire.js fangsWorn), and every
                // game shows it like any worn gear, with no redraw. Changing the head parts in each game (earlier builds) never reached other players' games: SkyMP draws
                // them from the look the server sends. A fang head part an earlier build left in a character's parts is swapped back for their teeth, once.
                if (VAMP_FANG_RACES.indexOf(race.getFormID()) >= 0) {
                    var fp = sp.HeadPart.from(sp.Game.getFormFromFile(female ? VAMP_FANGS.female : VAMP_FANGS.male, "GreymarchCore.esp"));
                    var fslot = fp ? this.greymarchVampPartSlot(base, fp) : -1;
                    if (fslot >= 0) {
                        var own = sp.HeadPart.from(sp.Game.getFormEx(rec.mouth || (female ? VAMP_OWN_TEETH.female : VAMP_OWN_TEETH.male)));
                        if (own) { base.setNthHeadPart(own, fslot); if (localId === 0x14) actor.regenerateHead(); this.greymarchVampFangReport(v.actor, localId, "old fang head part taken off (the fangs are a worn item now)", own.getFormID().toString(16)); }
                    }
                }
            } catch (eErr) { this.greymarchVampFangReport(v.actor, localId, "error: " + String(eErr).slice(0, 200)); /* not loaded here: the next look */ }
        }
        for (var k in done) {
            if (seen[k]) continue;
            var back = done[k]; delete done[k];
            try {
                var a2 = Number(k) === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(Number(k)));
                var orig = back.orig ? sp.HeadPart.from(sp.Game.getFormEx(back.orig)) : null;
                if (a2 && orig) { a2.changeHeadPart(orig); this.greymarchLog("vampire: " + Number(k).toString(16) + " has their own eyes back"); }
                if (a2) { // a fang head part from an earlier build swapped back for their own teeth (or the race's)
                    var base2 = sp.ActorBase.from(a2.getBaseObject()), female2 = !!base2 && base2.getSex() === 1;
                    var fang2 = sp.HeadPart.from(sp.Game.getFormFromFile(female2 ? VAMP_FANGS.female : VAMP_FANGS.male, "GreymarchCore.esp"));
                    var teeth2 = sp.HeadPart.from(sp.Game.getFormEx(back.mouth || (female2 ? VAMP_OWN_TEETH.female : VAMP_OWN_TEETH.male)));
                    var slot2 = base2 && fang2 ? this.greymarchVampPartSlot(base2, fang2) : -1;
                    if (slot2 >= 0 && teeth2) { base2.setNthHeadPart(teeth2, slot2); if (Number(k) === 0x14) a2.regenerateHead(); }
                }
            } catch (bErr) { /* gone */ }
        }
    }
    // THE WORN FANGS. The server puts "Vampire Fangs" in a vampire's inventory, marked worn, while their fangs show (vampire.js fangsWorn), and takes it away when they
    // hide. Marked worn is not on: the game equips it here (kept on: it cannot be taken off by hand), and SkyMP sends what the player wears to every other game, which
    // shows the fangs like any gear. Once a second; nothing is done when the player does not have it.
    greymarchVampFangsWear(now: number): any {
        if (now < (this.greymarchVampFangsNext || 0)) return;
        this.greymarchVampFangsNext = now + 1000;
        try {
            var sp = this.sp, player = sp.Game.getPlayer();
            var f = sp.Game.getFormFromFile(VAMP_FANG_ITEM, "Dragonborn.esm");
            if (!player || !f || player.getItemCount(f) <= 0 || player.isEquipped(f)) return;
            player.equipItem(f, true, true); // preventRemoval, silent
            if (!this.greymarchVampFangsSaid) { this.greymarchVampFangsSaid = true; this.greymarchLog("vampire: the worn fangs put on"); }
        } catch (err) { /* tried again in a second */ }
    }
    greymarchVampPartSlot(base: any, part: any): number { // where that head part is in the character's list of parts (-1: not there)
        if (!part) return -1;
        var n = base.getNumHeadParts(), id = part.getFormID();
        for (var i = 0; i < n; i++) { var hp = base.getNthHeadPart(i); if (hp && hp.getFormID() === id) return i; }
        return -1;
    }
    greymarchVampMiscParts(base: any): any[] { // every Misc head part a character's base wears (teeth, and whatever else mods add there)
        var out = [], n = base.getNumHeadParts();
        for (var i = 0; i < n; i++) { var hp = base.getNthHeadPart(i); if (hp && hp.getType() === 0) out.push(hp); }
        return out;
    }
    greymarchVampEyePart(base: any, type: number): any { // the head part of that type a character's base wears now (2: eyes, 0: misc, the teeth)
        var n = base.getNumHeadParts();
        for (var i = 0; i < n; i++) { var hp = base.getNthHeadPart(i); if (hp && hp.getType() === type) return hp; }
        return null;
    }
    greymarchWolfReport(beast: boolean): any {
        this.greymarchLog("wolf: telling the server the player " + (beast ? "became the beast (the power was used)" : "is human again"));
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchWolf", op: "game", beast: beast }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // CUFFS (guards.js). The server says { customPacketType: "greymarchCuffs", on, bound, gagged, cuffs } to the prisoner: the Prisoner's Cuffs it put in their inventory are
    // worn and cannot be taken off (the server puts them back if they go), the bound-hands pose plays (again every 10 seconds: other animations end it), and both stop on
    // on: false. Every game hears { customPacketType: "greymarchChains", chains: [{ from, to }], cuffed: [actor] }: other players in cuffs are posed too, and a chain is drawn
    // on the HUD from each prisoner's hands to the hand of whoever holds the chain. Following the chain, through load doors too, is the server's work: it moves the prisoner.
    greymarchCuffsTick(now: number): any {
        var sp = this.sp;
        if (now >= (this.greymarchCuffsNext || 0)) {
            this.greymarchCuffsNext = now + 500;
            var want = this.greymarchCuffsWant;
            try {
                var player = sp.Game.getPlayer();
                if (want) {
                    var f = Number(want.cuffs) > 0 ? sp.Game.getFormEx(Number(want.cuffs) >>> 0) : null;
                    if (f && player.getItemCount(f) > 0 && !player.isEquipped(f)) player.equipItem(f, true, true); // preventRemoval: on until the server takes them off
                    if (!this.greymarchCuffsPosed || now - (this.greymarchCuffsPosedAt || 0) > 10000) {
                        if (!this.greymarchCuffsPosed) this.greymarchLog("guards: in cuffs (" + (want.bound ? "on a chain" : "walking freely") + (want.gagged ? ", gagged" : "") + ")");
                        sp.Debug.sendAnimationEvent(player, "OffsetBoundStandingStart");
                        this.greymarchCuffsPosed = true; this.greymarchCuffsPosedAt = now;
                    }
                } else if (this.greymarchCuffsPosed) {
                    this.greymarchCuffsPosed = false;
                    sp.Debug.sendAnimationEvent(player, "OffsetStop");
                    this.greymarchLog("guards: the cuffs are off");
                }
            } catch (err) { /* tried again in half a second */ }
            var posed = this.greymarchCuffsOthers || (this.greymarchCuffsOthers = {}), list = this.greymarchCuffedList || [], still: any = {};
            for (var i = 0; i < list.length; i++) {
                if (this.greymarchMeActor && list[i] === this.greymarchMeActor) continue;
                var lid = misc.remoteIdToLocalId(list[i]);
                if (!lid) continue;
                still[lid] = true;
                if (posed[lid] && now - posed[lid] < 10000) continue;
                try { var a = sp.Actor.from(sp.Game.getFormEx(lid)); if (a) { sp.Debug.sendAnimationEvent(a, "OffsetBoundStandingStart"); posed[lid] = now; } } catch (aErr) { /* tried again */ }
            }
            for (var k in posed) {
                if (still[k]) continue;
                delete posed[k];
                try { var b = sp.Actor.from(sp.Game.getFormEx(Number(k))); if (b) sp.Debug.sendAnimationEvent(b, "OffsetStop"); } catch (bErr) { /* gone */ }
            }
        }
        this.greymarchChainsDraw(now);
    }
    // the chains on the HUD: each end where the hand is on screen (0..1 from the top left), about 30 times a second while one is in sight; nothing is sent while nothing changes
    greymarchChainsDraw(now: number): any {
        var list = this.greymarchChainList || [], out = [];
        if (list.length) {
            if (now < (this.greymarchChainsNext || 0)) return;
            this.greymarchChainsNext = now + 33;
            var sp = this.sp, self = this;
            try {
                var player = sp.Game.getPlayer();
                var refOf = function (id: number) { if (self.greymarchMeActor && id === self.greymarchMeActor) return player; var l = misc.remoteIdToLocalId(id); return l ? sp.Actor.from(sp.Game.getFormEx(l)) : null; };
                var hand = function (a: any, node: string) {
                    var p = [sp.NetImmerse.getNodeWorldPositionX(a, node, false), sp.NetImmerse.getNodeWorldPositionY(a, node, false), sp.NetImmerse.getNodeWorldPositionZ(a, node, false)];
                    if (!p.every(function (n: any) { return isFinite(n); }) || (p[0] === 0 && p[1] === 0 && p[2] === 0)) p = [a.getPositionX(), a.getPositionY(), a.getPositionZ() + 90]; // no hand node: about waist height
                    return p;
                };
                var r4 = function (n: number) { return Math.round(n * 10000) / 10000; };
                for (var i = 0; i < list.length; i++) {
                    var a = refOf(Number(list[i].from)), b = refOf(Number(list[i].to));
                    if (!a || !b || (player.getDistance(a) > 4000 && player.getDistance(b) > 4000)) continue; // not here, or far off
                    var s = sp.worldPointToScreenPoint(hand(a, "NPC R Hand [RHnd]"), hand(b, "NPC L Hand [LHnd]"));
                    var p = s && s[0], q = s && s[1];
                    if (!p || !q || !(p[2] > 0) || !(q[2] > 0)) continue; // an end behind the camera
                    out.push([r4(p[0]), r4(1 - p[1]), r4(q[0]), r4(1 - q[1])]);
                }
            } catch (err) { out = []; }
        }
        var key = JSON.stringify(out);
        if (key === this.greymarchChainsKey) return;
        this.greymarchChainsKey = key;
        this.greymarchChainsShown = out.length > 0;
        this.greymarchGuardsHudCheck();
        this.greymarchHudToPage("chains", { list: out });
    }
    // the page layer stays up while a chain or the cuffing bar is on the HUD (never focused), like the voice display
    greymarchGuardsHudCheck(): any {
        var on = !!this.greymarchChainsShown || Date.now() < (this.greymarchProgressUntil || 0);
        if (on === !!this.greymarchGuardsHud) return;
        this.greymarchGuardsHud = on;
        if (on && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(true); } catch (e) { /* the page layer is not available */ } }
    }
    // CREATURE FORMS. Staff turn a player into a creature (the server's shapeshift.js); the server says { customPacketType: "greymarchShape", on: true, race, back, name } and repeats it
    // every 5 seconds, then { on: false, back, wear } to change back. Other players see the creature because the server changes the character's appearance (SkyMP redraws it);
    // THIS game changes the player's own body: Beast Form mode (no inventory or magic menus, as the werewolf), no fast travel, no first person (creature bodies have none), gear
    // off, and SetRace to the creature's race. The way back: the race the server names (the character's own), controls back, and the gear they wore put on again.
    // With no word from the server for SHAPE_SILENCE_MS (it restarted without the form, or the stream broke) the player changes back by themselves.
    greymarchShapeMsg(msg: any): any {
        if (msg.on) {
            var race = Number(msg.race) >>> 0;
            if (!race) return;
            var was = this.greymarchShapeWant;
            if (!was || was.race !== race) this.greymarchLog("shape: the server says " + (msg.name || "a creature") + " (race " + race.toString(16) + ")");
            var at = msg.attacks && typeof msg.attacks === "object" ? msg.attacks : {};
            var names = function (l: any) { return Array.isArray(l) ? l.filter(function (x: any) { return typeof x === "string" && x.length > 0 && x.length < 64; }) : []; };
            this.greymarchShapeWant = { race: race, back: Number(msg.back) >>> 0, name: String(msg.name || ""), normal: names(at.normal), power: names(at.power), mode: msg.mode === "race" ? "race" : "npc" };
            this.greymarchShapeWordAt = Date.now();
        } else {
            if (this.greymarchShapeWant || this.greymarchShapeOn) this.greymarchLog("shape: the server says change back");
            this.greymarchShapeWant = null;
            if (Number(msg.back) > 0) this.greymarchShapeBackRace = Number(msg.back) >>> 0;
            this.greymarchShapeWear = Array.isArray(msg.wear) ? msg.wear.map(function (x: any) { return Number(x) >>> 0; }).filter(function (x: number) { return x > 0; }) : [];
        }
    }
    // A mouse button while a creature (greymarchKey): left = a normal attack, right = a power attack. Played in greymarchShapeTick (Skyrim calls only work in the update phase).
    greymarchShapeButton(power: boolean): any {
        if (!this.greymarchShapeOn || this.greymarchChatTyping || this.greymarchAdminOn || this.greymarchMenuOn) return;
        this.greymarchShapeSwing = { power: power, at: Date.now() };
    }
    greymarchShapeTick(): any {
        var now = Date.now();
        if (now < (this.greymarchShapeNext || 0) && !this.greymarchShapeSwing && !this.greymarchShapeReport) return;
        this.greymarchShapeNext = now + 250;
        try {
            var sp = this.sp;
            var player = sp.Game.getPlayer();
            if (!player) return;
            var race = player.getRace();
            var raceId = race ? race.getFormID() : 0;
            var want = this.greymarchShapeWant;
            if (want && now - (this.greymarchShapeWordAt || 0) > SHAPE_SILENCE_MS) {
                this.greymarchLog("shape: no word from the server for " + SHAPE_SILENCE_MS / 1000 + " seconds: changing back");
                this.greymarchShapeWant = want = null;
            }
            if (want) {
                if (this.greymarchShapeOn && this.greymarchShapeModeOn && this.greymarchShapeModeOn !== want.mode) this.greymarchShapeEnd(player, raceId); // the server switched the way: back first
                if (this.greymarchShapeOn !== want.race) { if (want.mode === "race") this.greymarchShapeBecome(player, want, raceId); else this.greymarchShapeNpcBecome(player, want); }
                else if (want.mode === "npc") {
                    if (now - (this.greymarchShapeAlphaAt || 0) > 2000) { this.greymarchShapeAlphaAt = now; player.setAlpha(0, false); } // the player's own body stays invisible
                    var pup = this.greymarchShapePuppet; // no NPC (its first placing failed) or one that never got ready (its spawn steps failed): placed again, at most every 3 seconds
                    if ((!pup || (!pup.ready && now - pup.at > SHAPE_NPC_READY_MS)) && now - (this.greymarchShapeRemakeAt || 0) > 3000) { this.greymarchShapeRemakeAt = now; this.greymarchShapeRemake(pup ? "the NPC never got ready" : "there was no NPC"); }
                }
                else if (raceId !== want.race && now - (this.greymarchShapeFixAt || 0) > 3000) { // something put another race back (a respawn, the game itself)
                    this.greymarchShapeFixAt = now;
                    var r = sp.Race.from(sp.Game.getFormEx(want.race));
                    if (r) { player.setRace(r); this.greymarchLog("shape: the race was not the creature's any more: set again"); }
                }
                this.greymarchShapeAttackTick(player, want, now);
            } else if (this.greymarchShapeOn) this.greymarchShapeEnd(player, raceId);
            var wearAt = this.greymarchShapeWearAt;
            if (wearAt && now >= wearAt) { // the gear goes back on a moment after the body is back (the new skeleton must be in place first)
                this.greymarchShapeWearAt = 0;
                var kept = null; try { kept = (sp.storage as any)["greymarchPendingAppearance"]; (sp.storage as any)["greymarchPendingAppearance"] = null; } catch (kErr) { kept = null; }
                if (kept && !this.greymarchShapeOn) { try { appearanceMod.applyAppearanceToPlayer(kept); this.greymarchLog("shape: the character's own look put back"); } catch (aErr) { this.greymarchLog("shape: the own look could not be put back: " + aErr); } }
                var list = this.greymarchShapeWear || [];
                this.greymarchShapeWear = [];
                var put = 0;
                for (var i = 0; i < list.length; i++) {
                    try { var f = sp.Game.getFormEx(list[i]); if (f && player.getItemCount(f) > 0) { player.equipItem(f, false, true); put++; } } catch (eErr) { /* that one stays in the inventory */ }
                }
                if (list.length) this.greymarchLog("shape: put " + put + " of " + list.length + " worn items back on");
            }
        } catch (shErr) {
            if (!this.greymarchShapeErrLogged) { this.greymarchShapeErrLogged = true; this.greymarchLog("shape: " + shErr); }
        }
    }
    // ATTACKS. The player's own click would send a person's "attackStart", which no creature body answers, so a click plays one of the creature's OWN attack events (the server
    // sends the list: the events of that creature's animation project) on the player, at the creature's pace. SkyMP sends the animation to everyone, so others see the swing.
    // About when it lands, the swing is reported; the SERVER decides who is hit and how hard (shapeshift.js). The game's own hits are not reported while a creature (hitService.ts).
    greymarchShapeAttackTick(player: any, want: any, now: number): any {
        var sp = this.sp;
        var swing = this.greymarchShapeSwing;
        if (swing) {
            this.greymarchShapeSwing = null;
            var power = swing.power && want.power.length > 0;
            var pool = power ? want.power : want.normal;
            var last = this.greymarchShapeLastSwing;
            var inMenu = false; try { inMenu = !!sp.Utility.isInMenuMode(); } catch (mErr) { inMenu = false; }
            if (!pool.length) {
                if (now - (this.greymarchShapeNoAttackSaid || 0) > 5000) { this.greymarchShapeNoAttackSaid = now; try { sp.Debug.notification("A " + (want.name || "creature") + " cannot attack."); } catch (nErr) { /* a nicety */ } }
            } else if (!inMenu && now - swing.at < 1000 && !(last && now - last.at < (last.power ? SHAPE_POWER_REST_MS : SHAPE_REST_MS))) {
                var ev = pool[Math.floor(Math.random() * pool.length)];
                var body = this.greymarchShapeModeOn === "npc" ? this.greymarchShapePuppetActor() : player; // the creature NPC (mode "npc"), or the player's own body (mode "race")
                if (body) {
                    if (this.greymarchShapeModeOn === "npc") { this.greymarchShapeCombatUntil = now + 6000; try { if (!player.isWeaponDrawn()) player.drawWeapon(); } catch (dErr) { /* the stance is set on the NPC anyway */ } } // combat stance: here and, through the player's movement, in everyone's game
                    sp.Debug.sendAnimationEvent(body, ev);
                    this.greymarchShapeLastSwing = { at: now, power: power };
                    this.greymarchShapeReport = { at: now + SHAPE_LAND_MS, power: power, ev: ev };
                }
                if (!this.greymarchShapeSwingLogged) { this.greymarchShapeSwingLogged = true; this.greymarchLog("shape: first attack (" + ev + ")"); }
            }
        }
        var rep = this.greymarchShapeReport;
        if (rep && now >= rep.at) {
            this.greymarchShapeReport = null;
            var target = 0;
            try { var ref = sp.Game.getCurrentCrosshairRef(); var id = ref ? ref.getFormID() : 0; if (id >= 0xff000000) target = misc.localIdToRemoteId(id); } catch (cErr) { target = 0; } // the one under the crosshair, if any (the server checks reach and facing)
            var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchShapeAttack", power: rep.power, target: target, ev: rep.ev }) };
            this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
        }
    }
    // ---- THE CREATURE AS A REAL NPC (mode "npc", the default). Every OTHER game already draws a player as an NPC built from their appearance and moved by their movement
    // (SkyMP's formView: an AI actor with the creature's own skeleton, animations and locomotion). This game now does the same for the player's own view: a local NPC of the
    // creature's race is placed where the player is, protected the way SkyMP protects its NPCs, moved every frame by the player's own movement (SkyMP's applyMovement: walk, run,
    // sprint, sneak, combat stance), with collision off so it never pushes the player, and the camera follows it. The player's own body is invisible. So the creature on this
    // screen is exactly the NPC everyone else sees, with no SetRace on the player (a creature's animation graph is not made for player control: static or stretched bodies).
    greymarchShapeNpcBecome(player: any, want: any): any {
        this.greymarchCrumb("creature form: " + (want && want.name ? want.name : "?"));
        var sp = this.sp;
        var step = "start";
        try {
            if (!this.greymarchShapeOn) {
                step = "beast form"; sp.Game.setBeastForm(true); // no inventory, magic or favourites menus: a creature cannot put on armor or cast the character's spells
                step = "fast travel"; sp.Game.enableFastTravel(false);
                step = "controls"; sp.Game.disablePlayerControls(false, false, true, false, false, false, false, false, 1); // only the camera switch: they still walk, sneak, fight and talk
                step = "camera"; sp.Game.forceThirdPerson();
                step = "unequip"; player.unequipAll();
                try { (sp.storage as any)["greymarchShapeOn"] = true; } catch (stErr) { /* hitService then reports the game's own hits too */ }
            }
            step = "invisible"; player.setAlpha(0, false);
            step = "npc"; this.greymarchShapePuppetRemove();
            this.greymarchShapePuppetMake(player, want);
            this.greymarchShapeOn = want.race;
            this.greymarchShapeModeOn = "npc";
            this.greymarchLog("shape: became " + (want.name || "a creature") + " as an NPC (race " + want.race.toString(16) + ", " + want.normal.length + " attacks, " + want.power.length + " power attacks)");
        } catch (bErr) {
            this.greymarchShapeOn = want.race; this.greymarchShapeModeOn = "npc";
            this.greymarchLog("shape: the change failed at step '" + step + "': " + bErr);
        }
    }
    // The NPC, as SkyMP's formView/SpawnProcess make one: a base built from the appearance (the creature's race, male, no head parts), placed disabled, moved to the player,
    // enabled, resurrected; then local protections (the world cleaner leaves it alone, it cannot die or be hit here, it starts no fights, it deals no damage of its own: the
    // server decides every hit) and the camera on it. Ready only after that; until then it is not moved.
    greymarchShapePuppetMake(player: any, want: any): any {
        var sp = this.sp;
        var ap = { isFemale: false, raceId: want.race, weight: 50, skinColor: 0, hairColor: 0, headpartIds: [], headTextureSetId: 0, options: [], presets: [], tints: [], name: want.name || "" };
        var base = appearanceMod.applyAppearance(ap as any);
        var ref = player.placeAtMe(base, 1, true, true);
        if (!ref) throw new Error("placeAtMe gave nothing");
        var id = ref.getFormID();
        var puppet = { id: id, race: want.race, ready: false, at: Date.now() };
        this.greymarchShapePuppet = puppet;
        try { this.controller.lookupListener(WorldCleanerService).modWcProtection(id, 1); } catch (wcErr) { this.greymarchLog("shape: the world cleaner could not be told to leave the NPC alone: " + wcErr); }
        var self = this;
        var pos = [player.getPositionX(), player.getPositionY(), player.getPositionZ()];
        var live = function () { var r = sp.ObjectReference.from(sp.Game.getFormEx(id)); return self.greymarchShapePuppet === puppet && r && r.getFormID() === id ? r : null; };
        var fail = function (where: string) { return function (e: any) { self.greymarchLog("shape: the NPC failed at '" + where + "': " + e); }; };
        Promise.resolve(ref.setPosition(pos[0], pos[1], pos[2])).then(function () {
            var r = live(); if (!r) return;
            return Promise.resolve(r.enable(false)).then(function () {
                var r2 = live(); if (!r2) return;
                var ac = sp.Actor.from(r2);
                return Promise.resolve(ac ? ac.resurrect() : null).then(function () {
                    var r3 = live(); if (!r3) return;
                    var a3 = sp.Actor.from(r3);
                    if (a3) {
                        a3.startDeferredKill(); // it never dies here (the server owns the player's health)
                        a3.setActorValue("health", 1000000);
                        a3.setActorValue("Aggression", 0); // it starts no fights of its own (SkyMP gives some creature races Aggression 2)
                        a3.setActorValue("attackDamageMult", 0); // its own hits do nothing: the server decides every hit (shapeshift.js)
                        try { a3.setGhost(true); } catch (gErr) { /* NPCs here then hit it, harmlessly */ }
                        a3.blockActivation(true);
                    }
                    try { (sp as any).setCollision(id, false); } catch (cErr) { self.greymarchLog("shape: collision could not be switched off on the NPC: " + cErr); } // it stands where the player stands without pushing them
                    try { sp.Game.setCameraTarget(a3); } catch (camErr) { self.greymarchLog("shape: the camera could not follow the NPC: " + camErr); }
                    puppet.ready = true;
                    self.greymarchLog("shape: the NPC is ready (" + id.toString(16) + ")");
                }, fail("resurrect"));
            }, fail("enable"));
        }, fail("position")).catch(fail("spawn")); // a step that throws (not only one that fails) is logged too; greymarchShapeTick places a never-ready NPC again
    }
    greymarchShapePuppetActor(): any {
        var p = this.greymarchShapePuppet;
        if (!p || !p.ready) return null;
        try { var ac = this.sp.Actor.from(this.sp.Game.getFormEx(p.id)); return ac && ac.getFormID() === p.id && !ac.isDeleted() ? ac : null; } catch (e) { return null; }
    }
    greymarchShapePuppetRemove(): any {
        var sp = this.sp;
        var p = this.greymarchShapePuppet;
        this.greymarchShapePuppet = null;
        if (!p) return;
        try { var player = sp.Game.getPlayer(); if (player) sp.Game.setCameraTarget(player); } catch (camErr) { /* the camera is the player's again anyway once the NPC is gone */ }
        try { var r = sp.ObjectReference.from(sp.Game.getFormEx(p.id)); if (r && r.getFormID() === p.id) { r.disable(false); r.delete(); } } catch (dErr) { /* already gone */ }
        try { this.controller.lookupListener(WorldCleanerService).modWcProtection(p.id, -1); } catch (wcErr) { /* nothing was protected */ }
    }
    // Every frame (greymarchTick): the NPC follows the player's movement exactly as SkyMP moves other players; a respawn is needed after a door or a long way (SkyMP's own rule).
    // The animations other players' creatures should play (their attacks) are played here too.
    greymarchShapeDrive(): any {
        var q = this.greymarchShapeAnimQueue;
        if (q && q.length) {
            this.greymarchShapeAnimQueue = [];
            for (var i = 0; i < q.length; i++) {
                try {
                    var localId = misc.remoteIdToLocalId(q[i].actor);
                    var ref = localId ? this.sp.ObjectReference.from(this.sp.Game.getFormEx(localId)) : null;
                    if (ref) animMod.applyAnimation(ref, { animEventName: q[i].ev, numChanges: 1 }, { lastNumChanges: 0, useAnimOverrides: false }); // SkyMP's own path (it lets an attack through on a player's NPC)
                } catch (aErr) { /* that player is not drawn here */ }
            }
        }
        if (this.greymarchShapeModeOn !== "npc" || !this.greymarchShapePuppet) return;
        var ac = this.greymarchShapePuppetActor();
        var p = this.greymarchShapePuppet;
        var now = Date.now();
        if (!ac) {
            if (p.ready && now - (this.greymarchShapeRemakeAt || 0) > 2000) { this.greymarchShapeRemakeAt = now; this.greymarchShapeRemake("the NPC was gone"); }
            return;
        }
        try {
            var player = this.sp.Game.getPlayer();
            var m = moveGetMod.getMovement(player);
            if (now < (this.greymarchShapeCombatUntil || 0)) m.isWeapDrawn = true; // the creature's combat stance while it is attacking (its attacks need it)
            moveApplyMod.applyMovement(ac, m);
            this.greymarchShapeKeepOnGround(ac, m);
        } catch (mErr) {
            if (now - (this.greymarchShapeRemakeAt || 0) > 2000) { this.greymarchShapeRemakeAt = now; this.greymarchShapeRemake("" + mErr); }
        }
    }
    // SkyMP keeps an NPC walking by aiming it at a point just ahead and 512 (walking) or 1024 (running) units BELOW where it is: the ground stops it, and the distance tells the AI
    // to walk or to run. The creature NPC has collision off (so it never pushes the player), so nothing stops it and it walked into the ground. So, right after SkyMP's call (the
    // last call wins), the same aim with that distance straight AHEAD at the same height: the same walk or run, and SkyMP's translateTo still puts it exactly where the player is.
    greymarchShapeKeepOnGround(ac: any, m: any): any {
        if (!m || m.runMode === "Standing") return; // SkyMP's own aim has no height there
        var dist = m.runMode === "Walking" ? 512 : 1024;
        var offsetAngle = m.rot[2] - ac.getAngleZ();
        if (Math.abs(offsetAngle) < 5) offsetAngle = 0;
        var d = ((m.direction || 0) / 180) * Math.PI;
        ac.keepOffsetFromActor(ac, dist * Math.sin(d), dist * Math.cos(d), 0, 0, 0, offsetAngle, m.runMode === "Walking" ? 2048 : 1, 1);
    }
    greymarchShapeRemake(why: string): any {
        var want = this.greymarchShapeWant;
        var player = this.sp.Game.getPlayer();
        if (!want || !player || this.greymarchShapeModeOn !== "npc") return;
        this.greymarchLog("shape: the NPC is placed again (" + why + ")");
        this.greymarchShapePuppetRemove();
        try { this.greymarchShapePuppetMake(player, want); } catch (e) { this.greymarchLog("shape: the NPC could not be placed again: " + e); }
    }
    greymarchShapeNpcUnbecome(player: any): any {
        var sp = this.sp;
        var step = "start";
        this.greymarchShapeOn = 0; this.greymarchShapeModeOn = null;
        this.greymarchShapeSwing = null; this.greymarchShapeReport = null; this.greymarchShapeCombatUntil = 0;
        try { (sp.storage as any)["greymarchShapeOn"] = false; } catch (stErr) { /* nothing was set */ }
        try {
            step = "npc"; this.greymarchShapePuppetRemove();
            step = "visible"; player.setAlpha(1, false);
            step = "controls"; sp.Game.enablePlayerControls(false, false, true, false, false, false, false, false, 1);
            step = "beast form"; sp.Game.setBeastForm(false);
            step = "fast travel"; sp.Game.enableFastTravel(true);
            this.greymarchShapeWearAt = Date.now() + 1000; // the gear, and the character's own look SkyMP kept aside, a moment later
            this.greymarchLog("shape: changed back (the NPC is gone, the player is visible)");
        } catch (uErr) {
            this.greymarchLog("shape: changing back failed at step '" + step + "': " + uErr);
        }
    }
    // the way back, whichever way the body was changed
    greymarchShapeEnd(player: any, raceId: number): any {
        if (this.greymarchShapeModeOn === "npc") this.greymarchShapeNpcUnbecome(player);
        else this.greymarchShapeUnbecome(player, raceId);
    }
    // MODE "race" (the server's switch greymarch-data/shapeshift-race.on): the player's own body changes race. Before the race changes: the character's own head (hair, face, brows) is taken off the character record, or it is drawn stretched over the creature's skeleton
    // (black spikes where the head should be), and the record is made male (several creature races give the female slot another creature's animations). Both are put back on
    // the way back. Then ONE SetRace: remoteServer.ts no longer writes a creature race into the character (a SetRace to the race the game already "has" does nothing, and two in
    // one frame keep the first body with the second race: a headless person, or a creature's skeleton with a person's animations).
    greymarchShapeBecome(player: any, want: any, raceId: number): any {
        var sp = this.sp;
        var step = "start";
        try {
            step = "race"; var r = sp.Race.from(sp.Game.getFormEx(want.race)); if (!r) throw new Error("the race " + want.race.toString(16) + " is not in this game");
            this.greymarchShapeModeOn = "race";
            if (!this.greymarchShapeOn) { // from their own body (not from one creature to another): remember the race to go back to
                this.greymarchShapeBackRace = want.back || raceId;
                step = "beast form"; sp.Game.setBeastForm(true); // no inventory, magic or favourites menus: a creature cannot put on armor or cast the character's spells
                step = "fast travel"; sp.Game.enableFastTravel(false);
                step = "controls"; sp.Game.disablePlayerControls(false, false, true, false, false, false, false, false, 1); // only the camera switch: they still walk, sneak and talk
                step = "camera"; sp.Game.forceThirdPerson();
                step = "unequip"; player.unequipAll();
                step = "head"; this.greymarchShapeStripHead(player);
                try { (sp.storage as any)["greymarchShapeOn"] = true; } catch (stErr) { /* hitService then reports the game's own hits too */ }
            }
            step = "race"; player.setRace(r); // ONE real race change (remoteServer.ts no longer writes a creature race into the character first)
            step = "animation"; sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); // start the new animation set from its idle
            this.greymarchShapeOn = want.race;
            var got = player.getRace();
            this.greymarchLog("shape: became " + (want.name || "a creature") + " (race now " + (got ? got.getFormID().toString(16) : "none") + ", will change back to " + (this.greymarchShapeBackRace || 0).toString(16) + ", " + want.normal.length + " attacks, " + want.power.length + " power attacks)");
        } catch (bErr) {
            this.greymarchShapeOn = want.race; // not tried again every quarter second: the race check above sets it again every 3 seconds
            this.greymarchLog("shape: the change failed at step '" + step + "': " + bErr);
        }
    }
    greymarchShapeStripHead(player: any): any {
        var sp = this.sp;
        var base = sp.ActorBase.from(player.getBaseObject());
        if (!base) return;
        var parts: any[] = [];
        var n = base.getNumHeadParts();
        for (var i = 0; i < n; i++) { var hp = base.getNthHeadPart(i); if (hp) parts.push(hp.getFormID()); }
        if (!this.greymarchShapeHead) this.greymarchShapeHead = { parts: parts, sex: base.getSex() }; // kept from the first change only: a later one would save the creature's empty head
        sp.TESModPlatform.resizeHeadpartsArray(base, 0);
        sp.TESModPlatform.setNpcSex(base, 0);
    }
    greymarchShapeRestoreHead(player: any): any {
        var sp = this.sp;
        var saved = this.greymarchShapeHead;
        this.greymarchShapeHead = null;
        if (!saved) return;
        var base = sp.ActorBase.from(player.getBaseObject());
        if (!base) return;
        sp.TESModPlatform.setNpcSex(base, saved.sex === 1 ? 1 : 0);
        if (base.getNumHeadParts() > 0) return; // SkyMP already put the character's own look back (the server's appearance arrived first)
        var parts = saved.parts.map(function (id: number) { return sp.HeadPart.from(sp.Game.getFormEx(id)); }).filter(function (x: any) { return !!x; });
        sp.TESModPlatform.resizeHeadpartsArray(base, parts.length);
        parts.forEach(function (hp: any, i: number) { base.setNthHeadPart(hp, i); });
    }
    greymarchShapeUnbecome(player: any, raceId: number): any {
        var sp = this.sp;
        var step = "start";
        this.greymarchShapeOn = 0;
        this.greymarchShapeSwing = null; this.greymarchShapeReport = null;
        try { (sp.storage as any)["greymarchShapeOn"] = false; } catch (stErr) { /* nothing was set */ }
        try {
            step = "head"; this.greymarchShapeRestoreHead(player);
            step = "race";
            var back = this.greymarchShapeBackRace ? sp.Race.from(sp.Game.getFormEx(this.greymarchShapeBackRace)) : null;
            if (!back) { try { var base = sp.ActorBase.from(player.getBaseObject()); back = base ? base.getRace() : null; } catch (baseErr) { back = null; } }
            if (back) player.setRace(back); else this.greymarchLog("shape: no race known to change back to");
            step = "animation"; sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState");
            step = "controls"; sp.Game.enablePlayerControls(false, false, true, false, false, false, false, false, 1);
            step = "beast form"; sp.Game.setBeastForm(false);
            step = "fast travel"; sp.Game.enableFastTravel(true);
            step = "redraw"; player.queueNiNodeUpdate(); // the head is drawn again
            this.greymarchShapeWearAt = Date.now() + 1000; // the gear, and the character's exact look that SkyMP kept aside (remoteServer.ts), a moment later
            var r = player.getRace();
            this.greymarchLog("shape: changed back (race now " + (r ? r.getFormID().toString(16) : "none") + ")");
        } catch (uErr) {
            this.greymarchLog("shape: changing back failed at step '" + step + "': " + uErr);
        }
    }
    // Staff effects, applied in the update phase. Each is switched on or off only when it CHANGES, so the game is never fought with.
    greymarchEffects(): any {
        var now = Date.now();
        if (now < (this.greymarchFxNext || 0)) return;
        this.greymarchFxNext = now + 400;
        var want = this.greymarchFxWant;
        var ghosts = this.greymarchGhostList;
        if (!want && !(ghosts && ghosts.length) && !this.greymarchGhostApplied && !(this.greymarchInvisList && this.greymarchInvisList.length) && !this.greymarchInvApplied && !(this.greymarchOthers && this.greymarchOthers.length) && !this.greymarchStatsWant && !(this.greymarchCombatWant !== undefined && this.greymarchCombatWant !== this.greymarchCombatHave) && (this.greymarchSelfCleared || !this.greymarchMeActor)) return;
        try {
            var sp = this.sp;
            var player = sp.Game.getPlayer();
            if (!player) return;
            var have = this.greymarchFxHave || (this.greymarchFxHave = { noclip: false, speed: 100, frozen: false, god: false });
            if (want) {
                if (want.noclip !== have.noclip) { sp.Debug.toggleCollisions(); have.noclip = want.noclip; this.greymarchLog("staff: noclip " + (want.noclip ? "on" : "off")); }
                if (want.speed !== have.speed) { player.setActorValue("SpeedMult", want.speed); have.speed = want.speed; this.greymarchLog("staff: speed " + want.speed + "%"); }
                if (!!want.god !== have.god) { try { player.setGhost(!!want.god); } catch (gErr) { this.greymarchLog("staff: setGhost is not available (" + gErr + "), god mode relies on refilling"); } have.god = !!want.god; this.greymarchLog("staff: god " + (want.god ? "on" : "off")); } if (want.god) { try { player.restoreActorValue("health", 100000); player.restoreActorValue("stamina", 100000); player.restoreActorValue("magicka", 100000); } catch (rErr) { /* the invulnerable flag still protects */ } } 
                if (want.frozen !== have.frozen) {
                    if (want.frozen) sp.Game.disablePlayerControls(true, true, true, true, true, true, true, true, 0); else sp.Game.enablePlayerControls(true, true, true, true, true, true, true, true, 0);
                    have.frozen = want.frozen;
                }
            }
            this.greymarchGhostApply(now, ghosts || []); this.greymarchNamesApply(now); this.greymarchInvisApply(now); this.greymarchSeenLog(now); this.greymarchStatsApply(player); this.greymarchCombatApply(player);
        } catch (err) {
            if (!this.greymarchFxErr) { this.greymarchFxErr = true; this.greymarchLog("staff effects error (shown once): " + err); }
        }
    }
    // Ghosts: the server says which actors are ghosts and which colour; every game plays that colour's effect shader on those actors AND makes the body see-through,
    // exactly like the game's own ghost (a shader plus magicSetActorAlphaScript, alpha 0.25). Blue is GhostFXShader 03B6CB; red and black are GreymarchCore.esp's own (0801, 0800).
    // Turning a ghost OFF or changing its colour is a HARD disable: every ghost shader is stopped and the body is made solid again with no fade, repeated a moment later,
    // because a single stop can leave an effect behind (the player used to get stuck in the form).
    greymarchGhostClear(actor: any): any {
        var colors = ["blue", "red", "black"];
        for (var c = 0; c < colors.length; c++) { try { var sh = this.greymarchGhostShader(colors[c]); if (sh) sh.stop(actor); } catch (e1) { /* not playing */ } }
        try { actor.setAlpha(1, false); } catch (e2) { /* nothing to restore */ }
    }
    greymarchGhostApply(now: any, list: any): any {
        var sp = this.sp;
        var applied = this.greymarchGhostApplied || (this.greymarchGhostApplied = {});
        var seen = {};
        // once per session: whatever a previous session left on my own character is removed, so nobody can start the game already stuck as a ghost
        if (!this.greymarchSelfCleared && this.greymarchMeActor) {
            this.greymarchSelfCleared = true;
            var mine = false; for (var m = 0; m < list.length; m++) if (list[m].actor === this.greymarchMeActor) mine = true;
            if (!mine) { try { this.greymarchGhostClear(sp.Game.getPlayer()); } catch (e0) { /* the player is not ready yet */ } }
        }
        for (var i = 0; i < list.length; i++) {
            var g = list[i];
            var isMe = !!this.greymarchMeActor && g.actor === this.greymarchMeActor; var localId = isMe ? 0x14 : misc.remoteIdToLocalId(g.actor);
            if (!localId) { if (!this.greymarchGhostMiss || this.greymarchGhostMiss[g.actor] !== true) { (this.greymarchGhostMiss = this.greymarchGhostMiss || {})[g.actor] = true; this.greymarchLog("staff: ghost actor " + Number(g.actor).toString(16) + " is not loaded in this game yet"); } continue; }
            seen[localId] = true;
            var cur = applied[localId];
            var actor = isMe ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(localId));
            if (!actor) { this.greymarchLog("staff: ghost: no actor for " + localId.toString(16)); continue; }
            if (cur && cur.color === g.color && now - cur.at < 15000) continue; // shaders can drop when an actor's 3D reloads, so it is replayed every 15 s
            if (cur && cur.clearUntil && now < cur.clearUntil) continue; // still switching the old colour off
            if (cur && cur.color && cur.color !== g.color) {
                this.greymarchGhostClear(actor); applied[localId] = { color: null, at: now, clearUntil: now + 600 };
                this.greymarchLog("staff: ghost " + cur.color + " cleared on " + (isMe ? "myself" : localId.toString(16)) + " before " + g.color);
                continue;
            }
            var shader = this.greymarchGhostShader(g.color);
            if (!shader) { this.greymarchLog("staff: ghost: the " + g.color + " shader was not found"); continue; }
            var alpha = g.color === "black" ? (isMe ? 0.6 : 0.4) : (isMe ? 0.5 : 0.25);
            shader.play(actor, -1); try { if (!this.greymarchIsInvisible(g.actor, isMe)) actor.setAlpha(alpha, true); } catch (aErr) { if (!this.greymarchAlphaErr) { this.greymarchAlphaErr = true; this.greymarchLog("staff: setAlpha failed, ghosts will glow but stay solid (" + aErr + ")"); } }
            if (!cur || cur.color !== g.color) this.greymarchLog("staff: ghost " + g.color + " on " + (isMe ? "myself" : localId.toString(16)));
            applied[localId] = { color: g.color, at: now, shader: shader };
        }
        for (var key in applied) {
            if (seen[key]) continue;
            var old = applied[key];
            var gone = null; try { gone = Number(key) === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(Number(key))); } catch (e2) { gone = null; }
            if (!old.removing) { if (gone) this.greymarchGhostClear(gone); applied[key] = { removing: true, at: now, passes: 0 }; this.greymarchLog("staff: ghost removed from " + (Number(key) === 0x14 ? "myself" : Number(key).toString(16))); continue; }
            if (old.passes === 0 && now - old.at >= 600) { if (gone) this.greymarchGhostClear(gone); old.passes = 1; }
            else if (old.passes === 1 && now - old.at >= 2500) { if (gone) this.greymarchGhostClear(gone); delete applied[key]; }
        }
    }
    // POP-UP (warnings, announcements): a box on the middle right of the screen, drawn by the staff page. The browser layer is shown just long enough, then put back the way it was.
    greymarchToast(msg: any): any {
        var ms = Math.max(2000, Math.min(20000, Number(msg.ms) || 9000));
        this.greymarchToastUntil = Date.now() + ms + 1500;
        try { this.sp.browser.setVisible(true); } catch (e1) { /* the page layer is not available */ }
        this.greymarchAdminToPage("notice", { kind: String(msg.kind || ""), title: String(msg.title).slice(0, 80), text: String(msg.text || "").slice(0, 300), ms: ms });
    }
    greymarchToastTick(now: any): any {
        if (!this.greymarchToastUntil || now < this.greymarchToastUntil) return;
        this.greymarchToastUntil = 0;
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchHudOn && !this.greymarchChatOn && !this.greymarchGuardsHud && !(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn) && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(false); } catch (e2) { /* fine */ } }
    }
    // KILL: staff kill a character from THEIR OWN game, which is the one thing every SkyMP build lets a game do to its own character.
    greymarchKillMe(): any {
        try { var p = this.sp.Game.getPlayer(); try { p.setGhost(false); } catch (g1) { /* no such flag */ } p.kill(null); this.greymarchLog("staff: my character was killed by staff"); } catch (e3) { this.greymarchLog("staff: kill failed (" + e3 + ")"); }
    }
    // WEAPON PENALTY. The server watches what this player wields and sends a damage multiplier (1 = normal, less = weaker hits); it is set as the game's attack damage multiplier,
    // once per change, so the game is never fought with.
    greymarchCombatApply(player: any): any {
        var want = this.greymarchCombatWant;
        if (want === undefined || want === this.greymarchCombatHave) return;
        try { player.setActorValue("AttackDamageMult", want); this.greymarchCombatHave = want; this.greymarchLog("combat: my damage multiplier is now " + want); } catch (e) { this.greymarchCombatHave = want; this.greymarchLog("combat: the damage multiplier could not be set (" + e + ")"); }
    }
    // STAT MAXIMUMS set by staff (1 to 1000): the base value is set and the stat filled. Done once per value, so the game is never fought with.
    greymarchStatsApply(player: any): any {
        var want = this.greymarchStatsWant;
        if (!want) return;
        var have = this.greymarchStatsHave || (this.greymarchStatsHave = {});
        var names = { health: "Health", stamina: "Stamina", magicka: "Magicka" };
        for (var k in names) {
            var n = want[k];
            if (!(n >= 1 && n <= 1000) || have[k] === n) continue;
            player.setActorValue(names[k], n);
            player.restoreActorValue(names[k], n);
            have[k] = n;
            this.greymarchLog("staff: my " + k + " maximum is now " + n);
        }
    }
    // WORLD VIEW GUARD. SkyMP draws other players only while its world view is switched ON. It switches it on one second after the game starts (and one second after the race menu closes),
    // but it uses a game-time wait that is lost when the game loads the world again, which our character select does. The view then stays OFF for ever: the server sends every player,
    // the game knows about them all, and nobody is drawn. If it has been off for 4 seconds and the race menu is not open (that is the one time SkyMP switches it off on purpose), switch it on.
    greymarchWorldViewGuard(now: any): any {
        if (now < (this.greymarchWvNext || 0)) return;
        this.greymarchWvNext = now + 500;
        try {
            var wv = misc.getViewFromStorage();
            if (!wv || !wv.state) return;
            if (wv.state.allowUpdate !== false) { this.greymarchWvOffSince = 0; return; }
            if (this.sp.Ui.isMenuOpen("RaceSex Menu")) { this.greymarchWvOffSince = 0; return; }
            if (!this.greymarchWvOffSince) { this.greymarchWvOffSince = now; return; }
            if (now - this.greymarchWvOffSince < 4000) return;
            wv.setFormViewUpdateAllowed(true);
            this.greymarchWvOffSince = 0;
            this.greymarchLog("world view guard: the world view had been switched off for 4 seconds (other players were not being drawn), so it was switched back on");
        } catch (err) { /* the guard must never break the game */ }
    }
    // DIAGNOSTIC: every 10 s (at most 30 times) say, for every other character in the world, whether THIS game has them: a local actor, its 3D, disabled or not, distance and cell. Goes to the server log.
    greymarchSeenLog(now: any): any {
        var others = this.greymarchOthers;
        if (!others || !others.length) return;
        if ((this.greymarchSeenCount || 0) >= 30 || now < (this.greymarchSeenNext || 0)) return;
        this.greymarchSeenNext = now + 10000;
        this.greymarchSeenCount = (this.greymarchSeenCount || 0) + 1;
        var sp = this.sp, player = sp.Game.getPlayer(), parts = [];
        // what the server has actually SENT this game: the game's own world model lists every character it was told about
        var forms = null; try { forms = this.controller.lookupListener(RemoteServer).getWorldModel().forms; } catch (e0) { forms = null; }
        var known = []; if (forms) { for (var k = 0; k < forms.length; k++) { if (forms[k] && forms[k].refrId >= 0xff000000) known.push(Number(forms[k].refrId).toString(16)); } }
        var cellOf = function (a) { try { var c = a.getParentCell(); return c ? c.getFormID().toString(16) : "none"; } catch (e) { return "?"; } };
        for (var i = 0; i < others.length && i < 6; i++) {
            var s = Number(others[i]).toString(16) + " -> ";
            var lid = misc.remoteIdToLocalId(others[i]);
            if (!lid) {
                var f = null; if (forms) { for (var j = 0; j < forms.length; j++) { if (forms[j] && forms[j].refrId === others[i]) { f = forms[j]; break; } } }
                var why = "";
                if (f) {
                    // SkyMP draws a remote player only if: their world/cell equals yours, they are not marked dead, and their look can be built. Test each.
                    var mineW = 0; try { var wsp = player.getWorldSpace(); mineW = wsp ? wsp.getFormID() : (player.getParentCell() ? player.getParentCell().getFormID() : 0); } catch (e4) { mineW = -1; }
                    var theirW = f.movement ? f.movement.worldOrCell : -1;
                    // the game's world view: is it switched on, are we in single-player mode, and is there a view (and a local actor) for this character
                    try {
                        var wv = misc.getViewFromStorage();
                        var fv = null; if (wv && wv.state && wv.state.formViews) { var arr = wv.state.formViews.formViews || []; for (var q = 0; q < arr.length; q++) { if (arr[q] && arr[q].getRemoteRefrId && arr[q].getRemoteRefrId() === others[i]) { fv = arr[q]; break; } } }
                        var sps = false; try { sps = this.controller.lookupListener(SinglePlayerService).isSinglePlayer; } catch (e6) { sps = "?"; }
                        why += " | world view: " + (wv ? "found" : "NOT FOUND") + (wv && wv.state ? ", updates allowed=" + wv.state.allowUpdate + ", views=" + (wv.state.formViews.formViews || []).filter(function (v) { return !!v; }).length : "") + ", singlePlayer=" + sps + " | view for this character: " + (fv ? "exists (local ref=" + Number(fv.refrId || 0).toString(16) + ", ready=" + fv.ready + ")" : "NONE");
                    } catch (e7) { why += " | world view check failed: " + e7; }
                    why += " | myWorldOrCell=" + Number(mineW).toString(16) + " theirs=" + Number(theirW).toString(16) + (mineW === theirW ? " (SAME)" : " (DIFFERENT: SkyMP hides players in a different world/cell)") + " | isDead=" + !!f.isDead + " baseId=" + Number(f.baseId || 0).toString(16);
                    if (f.appearance && (this.greymarchBuildTried || 0) < 2) {
                        this.greymarchBuildTried = (this.greymarchBuildTried || 0) + 1;
                        try {
                            var ap = f.appearance, raceForm = sp.Game.getFormEx(ap.raceId), okParts = 0; for (var hp = 0; hp < (ap.headpartIds || []).length; hp++) { if (sp.Game.getFormEx(ap.headpartIds[hp])) okParts++; }
                            why += " | race=" + Number(ap.raceId).toString(16) + (raceForm ? " found" : " MISSING") + " headparts=" + okParts + "/" + (ap.headpartIds || []).length;
                            var built = appearanceMod.applyAppearance(ap); why += " | building the look: OK (form " + built.getFormID().toString(16) + ")";
                            var probe = player.placeAtMe(built, 1, true, true); why += " | placeAtMe: " + (probe ? "OK (ref " + probe.getFormID().toString(16) + ")" : "RETURNED NULL (the game cannot place a character here)"); if (probe) probe.delete();
                        } catch (e5) { why += " | building the look FAILED: " + e5; }
                    }
                }
                parts.push(s + "NO local actor; " + (!forms ? "could not read what the server sent" : f ? "the server DID send it (appearance=" + !!f.appearance + ", cell=" + (f.movement ? Number(f.movement.worldOrCell).toString(16) : "?") + ") but this game did not build it" + why : "the server NEVER sent it to this game"));
                continue;
            }
            var a = sp.Actor.from(sp.Game.getFormEx(lid));
            if (!a) { parts.push(s + lid.toString(16) + " is not an actor"); continue; }
            var l3 = "?", dis = "?", d = "?";
            try { l3 = a.is3DLoaded(); } catch (e1) { /* unknown */ }
            try { dis = a.isDisabled(); } catch (e2) { /* unknown */ }
            try { d = Math.round(player.getDistance(a)); } catch (e3) { /* unknown */ }
            parts.push(s + lid.toString(16) + " 3D=" + l3 + " disabled=" + dis + " distance=" + d + " cell=" + cellOf(a));
        }
        this.greymarchLog("staff: seen others (my cell " + cellOf(player) + "; characters the server has sent me: [" + known.join(",") + "]): " + parts.join("; "));
    }
    // INVISIBLE: done on every game's own screen (alpha 0), NOT by switching the body off on the server, which disconnects the owner. The name over their head is hidden too (see hide-invisible-name).
    greymarchIsInvisible(actorId: any, isMe: any): any {
        return !isMe && !!this.greymarchInvisList && this.greymarchInvisList.indexOf(actorId) >= 0;
    }
    greymarchInvisApply(now: any): any {
        var sp = this.sp;
        var list = this.greymarchInvisList || [];
        var applied = this.greymarchInvApplied || (this.greymarchInvApplied = {});
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            if (!!this.greymarchMeActor && list[i] === this.greymarchMeActor) continue; // you are never invisible to yourself
            var localId = misc.remoteIdToLocalId(list[i]);
            if (!localId) continue;
            seen[localId] = true;
            var cur = applied[localId];
            if (cur && !cur.removing && now - cur.at < 2000) continue; // replayed every 2 s: an actor's 3D reloading would show them again
            var actor = sp.Actor.from(sp.Game.getFormEx(localId));
            if (!actor) continue;
            try { actor.setAlpha(0, false); } catch (aErr) { if (!this.greymarchInvErr) { this.greymarchInvErr = true; this.greymarchLog("staff: invisible: setAlpha failed (" + aErr + ")"); } continue; }
            if (!cur || cur.removing) this.greymarchLog("staff: invisible on " + localId.toString(16));
            applied[localId] = { at: now };
        }
        for (var key in applied) {
            if (seen[key]) continue;
            var old = applied[key];
            var gone = null; try { gone = sp.Actor.from(sp.Game.getFormEx(Number(key))); } catch (e2) { gone = null; }
            if (!old.removing) { if (gone) { try { gone.setAlpha(1, false); } catch (e3) { /* nothing to restore */ } } applied[key] = { removing: true, at: now, passes: 0 }; this.greymarchLog("staff: invisible removed from " + Number(key).toString(16)); continue; }
            if (old.passes === 0 && now - old.at >= 600) { if (gone) { try { gone.setAlpha(1, false); } catch (e4) { /* fine */ } } old.passes = 1; }
            else if (old.passes === 1 && now - old.at >= 2500) { if (gone) { try { gone.setAlpha(1, false); } catch (e5) { /* fine */ } } delete applied[key]; }
        }
    }
    // Combat history: this game reports the hits it is part of (it hit someone, or was hit). The server only records a hit between two players when BOTH games report it.
    greymarchHit(e: any): any {
        try {
            var now = Date.now();
            if (now - (this.greymarchHitAt || 0) < 100) return; // at most 10 reports a second
            this.greymarchHitAt = now;
            var target = e.target, aggressor = e.aggressor;
            if (!target || !aggressor) return;
            var me = this.sp.Game.getPlayer().getFormID();
            if (target.getFormID() !== me && aggressor.getFormID() !== me) return;
            var name = function (a) { try { return a.getDisplayName ? String(a.getDisplayName()).slice(0, 40) : ""; } catch (x) { return ""; } };
            var source = "";
            try { source = e.source ? String(e.source.getName()).slice(0, 60) : ""; } catch (x2) { source = ""; }
            var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchHit", target: misc.localIdToRemoteId(target.getFormID()), aggressor: misc.localIdToRemoteId(aggressor.getFormID()), source: source, blocked: !!e.isHitBlocked, tname: name(target), aname: name(aggressor) }) };
            this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
        } catch (err) { /* the combat history is a nicety: it must never break the game */ }
    }
    greymarchGhostShader(color: any): any {
        var sp = this.sp;
        var form = null;
        if (color === "blue") form = sp.Game.getFormEx(0x03b6cb);
        else if (color === "red") { try { form = sp.Game.getFormFromFile(0x801, "GreymarchCore.esp"); } catch (e) { form = null; } if (!form) form = sp.Game.getFormEx(0x0fe68c); }
        else if (color === "black") { try { form = sp.Game.getFormFromFile(0x800, "GreymarchCore.esp"); } catch (e) { form = null; } if (!form) form = sp.Game.getFormEx(0x0fe68c); }
        return form ? sp.EffectShader.from(form) : null;
    }
    // ---- THE X MENU (introduce yourself, trade, Take hand). The page is Platform/UI/greymarch-menu.html; the SERVER decides everything (who knows whom, what is traded).
    greymarchMenuToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(MENU_SCRIPT + "window.__gmMenuSend(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the X menu: " + err);
        }
    }
    greymarchMenuShow(arg: any): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)) return; // not over the select screen, the staff panel, the professions window, or itself
        this.greymarchMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchMenuToPage("show", { mode: (arg && arg.mode) || "hold", looking: (arg && arg.looking) || 0, object: !!(arg && arg.object) }); // looking = the remote actor id of the player the menu is about
    }
    // HOLD X: look at a player and hold X, and the menu for THAT player appears; let go of X over an option to pick it (the page does the picking: it gets "release").
    // Not looking at a player: nothing opens (a short hint says why). The page is shown and focused while it is up, so the mouse is a cursor.
    greymarchMenuHold(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)) return;
        var looking = 0, isObject = false;
        try {
            var ref = this.sp.Game.getCurrentCrosshairRef();
            if (ref) {
                looking = misc.localIdToRemoteId(ref.getFormID()) || 0;
                if (looking && (this.greymarchOthers || []).indexOf(looking) < 0) {
                    // not a player: a door (form type 29) or a storage (28) can be managed from the same menu (the SERVER checks what it really is)
                    var kind = 0;
                    try { var base = ref.getBaseObject(); kind = base ? base.getType() : 0; } catch (e1) { kind = 0; }
                    if (kind === 29 || kind === 28) isObject = true; else looking = 0;
                }
            }
        } catch (e) { looking = 0; isObject = false; }
        if (!looking) {
            try { this.sp.Debug.notification("Look at a player, a door or a chest and hold X"); } catch (e2) { /* a hint is a nicety */ }
            return;
        }
        this.greymarchMenuShow({ mode: "hold", looking: looking, object: isObject });
    }
    greymarchMenuRelease(): any {
        if (this.greymarchMenuOn) this.greymarchMenuToPage("release", true);
    }
    // Esc: the page cancels a trade and closes itself; if it does not answer within a moment the menu is hidden anyway
    greymarchMenuEscape(): any {
        this.greymarchMenuToPage("escape", true);
        this.greymarchMenuEscAt = Date.now();
    }
    greymarchMenuHide(): any {
        if (!this.greymarchMenuOn) return;
        this.greymarchMenuOn = false;
        this.greymarchMenuToPage("hide", true);
        this.greymarchMenuEscAt = 0;
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); }
    }
    // ---- THE PROFESSIONS WINDOW (K). The page is Platform/UI/greymarch-prof.html; the SERVER decides what a profession allows, the ranks and the XP.
    greymarchProfToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(PROF_SCRIPT + "window.__gmProfSend(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the professions window: " + err);
        }
    }
    // K, handled every frame: a K typed into a game menu (the race menu's name box, the console) is a letter, not the window (2026-10-18: the window popped up while naming a new character)
    greymarchProfPending(): any {
        var at = this.greymarchProfWanted || 0;
        if (!at) return;
        this.greymarchProfWanted = 0;
        if (Date.now() - at > 1000) return; // a press from long ago
        if (this.greymarchInMenu()) { this.greymarchChatWhy("K ignored: the game says '" + this.greymarchMenuName + "' is open"); return; }
        this.greymarchProfShow();
    }
    greymarchProfShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn) || this.greymarchChatTyping) return; // not over the select screen, the other panels, or while typing
        this.greymarchProfOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchProfToPage("show", true);
    }
    greymarchProfHide(): any {
        if (!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)) return;
        this.greymarchProfOn = false;
        this.greymarchProfToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); }
    }
    greymarchProfSend(data: any): any {
        this.greymarchLog("prof: window asks the server (rid " + data.rid + ", " + data.op + ")");
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchProf", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // ---- THE CHANCERY WINDOW (/chancery). The page is Platform/UI/greymarch-chancery.html; the SERVER decides every right (gamemode/src/chancery.js). The server opens it ({ customPacketType: "greymarchChanceryOpen" }).
    greymarchChanceryToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(CHANCERY_SCRIPT + "window.__gmChanceryRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the chancery window: " + err);
        }
    }
    greymarchChanceryShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn) return; // not over the select screen or the other panels
        this.greymarchChanceryOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchChanceryToPage("show", true);
    }
    greymarchChanceryHide(): any {
        if (!this.greymarchChanceryOn) return;
        this.greymarchChanceryOn = false;
        this.greymarchChanceryToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchVampMenuOn); }
    }
    greymarchChanceryAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchChancery", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // ---- THE VAMPIRE WINDOW (/vampire). The page is Platform/UI/greymarch-vampire.html; the SERVER decides everything (gamemode/src/vampire.js), which opens it
    // ({ customPacketType: "greymarchVampMenuOpen" }) for a vampire who typed /vampire. Built like the chancery window.
    greymarchVampMenuToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(VAMP_MENU_SCRIPT + "window.__gmVampRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the vampire window: " + err);
        }
    }
    greymarchVampMenuShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn) return; // not over the select screen or the other panels
        this.greymarchVampMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchVampMenuToPage("show", true);
    }
    greymarchVampMenuHide(): any {
        if (!this.greymarchVampMenuOn) return;
        this.greymarchVampMenuOn = false;
        this.greymarchVampMenuToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn); }
    }
    greymarchVampMenuAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchVampMenu", rid: data.rid, op: data.op }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchMenuSend(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchMenu", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // NAMES. Everyone else is drawn as "Stranger" (the enemy health bar and anything else that reads the display name) unless THIS player knows them: the server sends
    // { actor id -> name } for the characters this player has been introduced to. The floating name over a head is the character ID (see formView.ts) and does not change.
    // SkyMP writes the character ID onto an actor whenever it draws it, so the name is checked every 1.5 s and put right again. Players cannot be activated either
    // (no "E" prompt, no name from the game's own crosshair text): activation is blocked on them, with the "hide the prompt" flag where the game has it.
    greymarchNamesApply(now: any): any {
        if (now < (this.greymarchNamesNext || 0)) return;
        this.greymarchNamesNext = now + 1500;
        var others = this.greymarchOthers || [];
        if (!others.length) return;
        var known = this.greymarchKnown || {};
        var seen = this.greymarchNamesSeen || (this.greymarchNamesSeen = {});
        for (var i = 0; i < others.length; i++) {
            var remote = others[i];
            var localId = misc.remoteIdToLocalId(remote);
            if (!localId) continue;
            var actor = this.sp.Actor.from(this.sp.Game.getFormEx(localId));
            if (!actor) continue;
            var want = known[remote] || "Stranger";
            var cur = "";
            try { cur = String(actor.getDisplayName()); } catch (e0) { cur = ""; }
            if (cur !== want) {
                try { actor.setDisplayName(want, true); } catch (e1) { if (!this.greymarchNameErr) { this.greymarchNameErr = true; this.greymarchLog("names: setDisplayName failed (" + e1 + ")"); } }
            }
            var s = seen[remote];
            if (!s || now - s.at > 15000) {
                try { actor.blockActivation(true, true); } catch (e2) { try { actor.blockActivation(true); } catch (e3) { if (!this.greymarchBlockErr) { this.greymarchBlockErr = true; this.greymarchLog("names: blockActivation failed (" + e3 + ")"); } } }
                if (!s) this.greymarchLog("names: " + (known[remote] ? "known as " + known[remote] : "Stranger") + " set on " + localId.toString(16));
                seen[remote] = { at: now };
            }
        }
    }
    // ---- THE CHATBOX. The page is Platform/UI/greymarch-chat.html, always on screen (bottom left) once you are in the world; Enter opens the input, the page sends, the SERVER decides who hears it.
    greymarchChatToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg });
        try {
            this.sp.browser.executeJavaScript(CHAT_SCRIPT + "window.__gmChatSend(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the chatbox: " + err);
        }
    }
    greymarchChatShow(): any {
        this.greymarchChatOn = true;
        try { this.sp.browser.setVisible(true); } catch (e) { /* the page layer is not available */ }
        this.greymarchChatToPage("show", true);
        this.greymarchChatNext = Date.now() + 2000;
    }
    greymarchChatHide(): any {
        if (!this.greymarchChatOn && !this.greymarchChatTyping) return;
        this.greymarchChatOn = false;
        this.greymarchChatTyping = false;
        this.greymarchChatToPage("hide", true);
    }
    // ---- THE EMOTE WHEEL (G). The page is Platform/UI/greymarch-emote.html; the emotes are the game's own idles (emotes.ts). Hold G, point, let go (a quick tap leaves it open).
    // The emote is played HERE with Actor.playIdle (a SkyrimPlatform call, not a Papyrus event, so SkyMP does not block it; the "Emote" mod's spells did it from OnEffectStart,
    // which SkyMP blocks). SkyMP sends the player's animation events to the other games (sync/animation.ts), so everyone sees it. Nothing here is a server decision: it is cosmetic.
    greymarchEmoteToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(EMOTE_SCRIPT + "window.__gmEmoteRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the emote wheel: " + err);
        }
    }
    greymarchEmoteShow(mode: string): any {
        if (this.greymarchScreenUp || this.greymarchPanelHasKeys() || this.greymarchChatTyping) return; // not over the select screen, another window, or while typing
        this.greymarchEmoteOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        var now = this.greymarchEmoteNow;
        this.greymarchEmoteToPage("show", { mode: mode === "open" ? "open" : "hold", groups: emoteMod.emoteGroupsForPage(), playing: now ? now.id : this.greymarchFaceMine ? this.greymarchFaceMine.id : null });
    }
    greymarchEmoteHide(): any {
        if (!this.greymarchEmoteOn) return;
        this.greymarchEmoteOn = false;
        this.greymarchEmoteToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchChatOn || !!this.greymarchGuardsHud || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn)); }
    }
    greymarchEmoteSay(text: string): any { try { this.sp.Debug.notification(text); } catch (e) { /* a hint is a nicety */ } }
    // Every frame (update phase): open the wheel, play or stop an emote, and end a lasting one when the player moves (keys can be rebound, so the speed is watched too) or draws a weapon.
    greymarchEmoteTick(now: number): any {
        var sp = this.sp;
        var wanted = this.greymarchEmoteWanted || 0;
        if (wanted) {
            this.greymarchEmoteWanted = 0;
            var tapped = !!this.greymarchEmoteTapped;
            this.greymarchEmoteTapped = false;
            if (now - wanted <= 1000) {
                if (this.greymarchInMenu()) this.greymarchChatWhy("G ignored: the game says '" + this.greymarchMenuName + "' is open");
                else if (this.greymarchWolfOn || this.greymarchShapeOn) this.greymarchEmoteSay("A beast has no emotes");
                else this.greymarchEmoteShow(tapped ? "open" : "hold"); // let go before this frame: a tap, so the wheel stays open for clicks
            }
        }
        var play = this.greymarchEmotePlayWanted;
        if (play) {
            this.greymarchEmotePlayWanted = null;
            var em = emoteMod.emoteById(play.id);
            if (em && now - play.at <= 2000) { if (em.kind === "face") this.greymarchFaceSet(em); else this.greymarchEmotePlay(em); }
        }
        if (this.greymarchFaceClearWanted) { this.greymarchFaceClearWanted = 0; if (this.greymarchFaceMine) this.greymarchFaceSet(null); }
        this.greymarchFaceTick(now);
        var cur = this.greymarchEmoteNow;
        if (!cur) { this.greymarchEmoteStopWanted = 0; return; }
        var stopWhy = "";
        if (this.greymarchEmoteStopWanted) { this.greymarchEmoteStopWanted = 0; stopWhy = "stopped"; }
        else if (this.greymarchWolfOn || this.greymarchShapeOn) { this.greymarchEmoteNow = null; return; } // the body changed: the emote went with it
        else if (now >= (this.greymarchEmoteCheckAt || 0)) {
            this.greymarchEmoteCheckAt = now + 250;
            try {
                var player = sp.Game.getPlayer();
                if (player.isWeaponDrawn()) stopWhy = "weapon drawn";
                else if (cur.kind === "loop" && now - cur.at > 700 && player.getAnimationVariableFloat("Speed") > 30) stopWhy = "moved";
            } catch (e) { /* asked again in a moment */ }
        }
        if (stopWhy) this.greymarchEmoteEnd(stopWhy);
    }
    greymarchEmotePlay(em: any): any {
        var sp = this.sp;
        if (this.greymarchWolfOn || this.greymarchShapeOn) { this.greymarchEmoteSay("A beast has no emotes"); return; }
        var ok = false, player: any = null;
        try {
            player = sp.Game.getPlayer();
            if (player.isWeaponDrawn()) { this.greymarchEmoteSay("Sheathe your weapon first"); return; }
            if (this.greymarchEmoteNow && this.greymarchEmoteNow.kind === "walk" && em.kind !== "once") this.greymarchEmoteEnd("another emote"); // a carry ends before a new pose starts (a serve or a throw keeps it)
            try { sp.Game.forceThirdPerson(); } catch (tpErr) { /* the emote still plays */ }
            var idle = sp.Idle.from(sp.Game.getFormEx(em.idle));
            this.greymarchCrumb("emote " + em.id + " idle " + (Number(em.idle) >>> 0).toString(16));
            ok = !!idle && !!player.playIdle(idle);
        } catch (err) { ok = false; }
        var n = this.greymarchEmoteLogged = (this.greymarchEmoteLogged || 0) + 1;
        if (n <= 20) this.greymarchLog("emote: " + em.id + " (idle " + em.idle.toString(16) + ", " + em.kind + ") " + (ok ? "played" : "refused by the game"));
        if (!ok) { this.greymarchEmoteSay("You cannot do that right now"); return; }
        this.greymarchEmoteNow = em.kind === "once" ? null : { id: em.id, kind: em.kind, stop: em.stop || emoteMod.IDLE_STOP, at: Date.now() };
    }
    // ---- FACES (the wheel's Face group). The face is put on the player's own body here and reported to the server, which passes it to everyone else (gamemode faces.js);
    // the faces of other players come back as { customPacketType: "greymarchFaceOf", actor, face } and are put on the characters this game draws. The game can drop a face
    // (dialogue, blinking, a character drawn again), so every face that is on is put on again once a second.
    greymarchFaceSet(em: any): any {
        var mine = this.greymarchFaceMine;
        if (em && mine && mine.id === em.id) em = null; // picking the face that is on takes it off
        this.greymarchFaceMine = em ? { id: em.id, face: em.face } : null;
        this.greymarchFaceNext = Date.now() + 1000; // put on now: the once-a-second repeat starts a second later
        var player: any = null;
        try { player = this.sp.Game.getPlayer(); } catch (e) { player = null; }
        if (player) this.greymarchFaceApply(player, em ? em.face : null, true);
        if (em) { try { this.sp.Game.forceThirdPerson(); } catch (tpErr) { /* the face is on anyway */ } }
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchFace", face: em ? em.id : null }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
        if ((this.greymarchEmoteLogged = (this.greymarchEmoteLogged || 0) + 1) <= 20) this.greymarchLog("emote: face " + (em ? em.id : "off"));
    }
    greymarchFaceApply(actor: any, face: any, fresh: boolean): any {
        try { this.greymarchCrumbEvery("face" + actor.getFormID(), 2000, "face " + (actor.getFormID() >>> 0).toString(16) + (face ? "" : " off")); } catch (cErr) { /* not important */ }
        try {
            if (fresh) { actor.clearExpressionOverride(); actor.resetExpressionOverrides(); for (var p0 = 0; p0 < 16; p0++) actor.setExpressionPhoneme(p0, 0); } // every mouth shape off too: the last face's (Open mouth ...) stayed under the next one
            if (!face) return;
            if (typeof face.mood === "number") actor.setExpressionOverride(face.mood, face.strength || 100);
            var ph = face.phonemes || [];
            for (var i = 0; i < ph.length; i++) actor.setExpressionPhoneme(ph[i][0], ph[i][1]);
        } catch (e) { /* the next second tries again */ }
    }
    greymarchFaceOf(msg: any): any {
        var actor = Number(msg.actor) >>> 0;
        if (!actor) return;
        var em = msg.face === null ? null : emoteMod.emoteById(msg.face);
        if (msg.face !== null && (!em || em.kind !== "face")) return; // not a face this game knows
        var all = this.greymarchFaceOthers || (this.greymarchFaceOthers = {});
        if (!em && !all[actor]) return;
        if (em && !all[actor] && Object.keys(all).length >= 64) return;
        all[actor] = { face: em ? em.face : null, localId: 0 };
    }
    greymarchFaceTick(now: number): any {
        if (now < (this.greymarchFaceNext || 0)) return;
        this.greymarchFaceNext = now + 1000;
        var sp = this.sp;
        var mine = this.greymarchFaceMine;
        if (mine) { try { this.greymarchFaceApply(sp.Game.getPlayer(), mine.face, false); } catch (e) { /* next second */ } }
        var all = this.greymarchFaceOthers;
        if (!all) return;
        for (var key in all) {
            var o = all[key];
            var localId = 0;
            try { localId = misc.remoteIdToLocalId(Number(key)) || 0; } catch (e) { localId = 0; }
            var ac: any = null;
            if (localId) { try { ac = sp.Actor.from(sp.Game.getFormEx(localId)); } catch (e) { ac = null; } }
            if (!o.face) { if (ac) this.greymarchFaceApply(ac, null, true); delete all[key]; continue; } // taken off (or the player left)
            if (!ac) { o.localId = 0; continue; } // not drawn here now
            this.greymarchFaceApply(ac, o.face, o.localId !== localId); // a character drawn again starts clean
            o.localId = localId;
        }
    }
    // ---- MOVING MOUTHS. While someone talks in voice (the launcher says who: this player while push-to-talk is held, and the character IDs of others), the mouth of the
    // character this game draws for them moves: about 9 times a second the game's own mouth shapes (Actor.setExpressionPhoneme: Aah, Eh, Oh ... and now and then a closed
    // one) are put on at random strengths. Nothing goes through the server: every game hears the same voices and moves the mouths itself. When they stop, the mouth
    // closes and a face from the wheel (Open mouth, Bare fangs ...) is put back.
    greymarchLipTick(now: number): any {
        if (now < (this.greymarchLipNext || 0)) return;
        this.greymarchLipNext = now + LIP_STEP_MS;
        var sp = this.sp;
        var want: any = {};
        if (this.greymarchLipMe && !this.greymarchWolfOn && !this.greymarchShapeOn) want[0x14] = true;
        var ids = this.greymarchLipIds || [], seen = this.greymarchEarsSeen || {};
        for (var i = 0; i < ids.length; i++) { var s = seen[ids[i]]; if (s && s.localId && now - s.at < 1000) want[s.localId] = true; } // drawn here, near enough to be heard
        var moving = this.greymarchLipOn || (this.greymarchLipOn = {});
        if (!Object.keys(want).length && !Object.keys(moving).length) return;
        var step = this.greymarchLipStep = (this.greymarchLipStep || 0) + 1;
        this.greymarchCrumbEvery("lips", 2000, "moving mouths: " + Object.keys(want).length + " talking");
        for (var key in want) {
            var id = Number(key), ac: any = null;
            try { ac = id === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(id)); } catch (e) { ac = null; }
            if (!ac) continue;
            var prev = moving[key];
            var pool = (step + id) % 3 === 0 ? LIP_CLOSED : LIP_OPEN; // every third step or so the lips meet (B, D, N)
            var shape = pool[Math.floor(Math.random() * pool.length)];
            if (prev !== undefined && prev[0] === shape[0]) shape = pool[(pool.indexOf(shape) + 1) % pool.length];
            var value = shape[1] * (0.6 + Math.random() * 0.6);
            try { if (prev !== undefined) ac.setExpressionPhoneme(prev[0], 0); ac.setExpressionPhoneme(shape[0], Math.min(1, value)); } catch (e) { continue; }
            moving[key] = [shape[0], value];
        }
        for (var mk in moving) {
            if (want[mk]) continue;
            var was = moving[mk];
            delete moving[mk];
            var mid = Number(mk), mac: any = null;
            try { mac = mid === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(mid)); } catch (e) { mac = null; }
            if (!mac) continue;
            try { mac.setExpressionPhoneme(was[0], 0); } catch (e) { /* the next face clears it */ }
            var face = null; // a face from the wheel goes back on at once
            if (mid === 0x14) face = this.greymarchFaceMine ? this.greymarchFaceMine.face : null;
            else { var others = this.greymarchFaceOthers || {}; for (var fk in others) if (others[fk].localId === mid) face = others[fk].face; }
            if (face) this.greymarchFaceApply(mac, face, false);
        }
    }
    greymarchEmoteEnd(why: string): any {
        var sp = this.sp, cur = this.greymarchEmoteNow;
        this.greymarchEmoteNow = null;
        if (!cur) return;
        this.greymarchCrumb("emote end " + cur.id + " (" + why + ")");
        try {
            var player = sp.Game.getPlayer();
            var idle = sp.Idle.from(sp.Game.getFormEx(cur.stop));
            var ok = !!idle && !!player.playIdle(idle);
            if (!ok) sp.Debug.sendAnimationEvent(player, cur.stop === emoteMod.OFFSET_STOP ? "OffsetStop" : cur.stop === emoteMod.DRUNK_STOP ? "DrunkStop" : "IdleStop"); // the stop event itself
        } catch (err) { /* the next movement ends it anyway */ }
        if ((this.greymarchEmoteLogged || 0) <= 20) this.greymarchLog("emote: " + cur.id + " ended (" + why + ")");
    }
    // The game's menus and the console: Y does nothing while any of them is up (typing a "y" in the console must not open the chat).
    greymarchInMenu(): any {
        var ui = this.sp.Ui;
        var menus = ["Console", "Console Native UI Menu", "InventoryMenu", "MagicMenu", "FavoritesMenu", "MapMenu", "Journal Menu", "StatsMenu", "TweenMenu", "ContainerMenu", "BarterMenu", "GiftMenu", "Dialogue Menu", "MessageBoxMenu", "Crafting Menu", "Lockpicking Menu", "Sleep/Wait Menu", "Book Menu", "Training Menu", "LevelUp Menu", "RaceSex Menu", "MainMenu", "Loading Menu", "Custom Menu", "TutorialMenu", "MistMenu"];
        for (var i = 0; i < menus.length; i++) { try { if (ui.isMenuOpen(menus[i])) { this.greymarchMenuName = menus[i]; return true; } } catch (e) { /* a menu this game does not know */ } }
        this.greymarchMenuName = "";
        return false;
    }
    // The chat page answers every "show" (a few seconds apart) with whether it is really typing. If the game thinks otherwise, the game gives way: a keyboard that the page is not using is released,
    // so movement can never stay locked behind a chat that is not open. (An input opened less than a second ago is left alone: the answer may have been sent before it.)
    // The windows that hold the keyboard (and the mouse cursor) while they are open. The chat's keyboard releases leave them alone: releasing it every 2 s took the K window's cursor away (2026-10-18).
    greymarchPanelHasKeys(): any { return !!(this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchEmoteOn); }
    // ---- THE FIELD OF VIEW (the chatbox's Settings). Skyrim Platform cannot reach the camera's field of view and the camera never reads the game's settings
    // again, so the value goes into fDefaultWorldFOV / fDefault1stPersonFOV (the Skyrim.ini ones) and Greymarch's SKSE plugin GreymarchCamera.dll (in the game
    // files; launcher repo skse/GreymarchCamera) sees the change within a quarter of a second and puts it on the camera, in any view. (Switching the view and
    // back, the old way, did not make the camera take it.) Only for this player's own screen; nothing is sent to the server. The page remembers the value and
    // sends it again each time the game starts.
    greymarchFovWanted(data: any): any {
        var fov = Number(data && data.fov);
        if (!isFinite(fov)) return;
        this.greymarchFovWant = { fov: Math.max(60, Math.min(120, Math.round(fov))) };
    }
    greymarchFovTick(): any {
        var w = this.greymarchFovWant;
        if (!w) return;
        this.greymarchFovWant = null;
        try {
            this.sp.Utility.setINIFloat("fDefaultWorldFOV:Display", w.fov);
            this.sp.Utility.setINIFloat("fDefault1stPersonFOV:Display", w.fov);
            this.greymarchLog("fov: " + w.fov + " (GreymarchCamera.dll puts it on the camera)");
        } catch (e1) { this.greymarchLog("fov: the game would not take the setting (" + e1 + ")"); }
    }
    greymarchChatSync(pageTyping: boolean): any {
        if (this.greymarchChatTyping && !pageTyping) {
            if (Date.now() - (this.greymarchChatOpenedAt || 0) < 1000) return;
            this.greymarchLog("chat: the game thought it was typing and the page was not; released the keyboard");
            this.greymarchChatFocus(false);
        } else if (!this.greymarchChatTyping && pageTyping) {
            this.greymarchChatFocus(true); // the page is showing its input: it gets the keyboard
        } else if (!pageTyping && !this.greymarchScreenUp && !this.greymarchPanelHasKeys()) {
            try { this.sp.browser.setFocused(false); } catch (e) { /* nothing to release */ } // neither is typing: nothing may hold the keyboard
        }
    }
    // While the chat says it is typing, the page must really have the keyboard. If it does not for a moment (a menu or the console took it, the layer was rebuilt), the input is closed so nothing is
    // left half open; the page, not the game, gets the keys while it is focused, so this never fires while someone is typing.
    greymarchChatWatch(now: any): any {
        if (now < (this.greymarchChatWatchNext || 0)) return;
        this.greymarchChatWatchNext = now + 250;
        if (!this.greymarchChatTyping) {
            this.greymarchChatLost = 0;
            // HARD RULE: after a close the keyboard is released again a few times, so movement cannot stay locked whatever the page did
            if (now < (this.greymarchChatReleaseUntil || 0) && !this.greymarchScreenUp && !this.greymarchPanelHasKeys()) { try { this.sp.browser.setFocused(false); } catch (e0) { /* nothing to release */ } }
            return;
        }
        // HARD RULES while the input is open: a menu or the console opening closes it; and it never stays open longer than two minutes
        if (this.greymarchInMenu()) { this.greymarchLog("chat: closed because a menu or the console opened"); this.greymarchChatClose(); return; }
        if (now - (this.greymarchChatOpenedAt || now) > 120000) { this.greymarchLog("chat: closed after two minutes open"); this.greymarchChatClose(); return; }
        var focused = true;
        try { focused = !!this.sp.browser.isFocused(); } catch (e) { focused = true; } // cannot tell: assume it is fine
        if (focused) { this.greymarchChatLost = 0; return; }
        if (!this.greymarchChatLost) { this.greymarchChatLost = now; return; }
        if (now - this.greymarchChatLost > 1500) { this.greymarchChatLost = 0; this.greymarchChatClose(); }
    }    // Enter, handled every frame: opens the chat unless a menu or the console is up.
    greymarchChatPending(): any {
        var at = this.greymarchChatWanted || 0;
        if (!at) return;
        this.greymarchChatWanted = 0;
        if (Date.now() - at > 1000) return; // a press from long ago
        if (this.greymarchChatTyping) return; // already typing: a key reaching the game now must never close or restart the input
        if (Date.now() - (this.greymarchChatClosedAt || 0) < 400) return; // the Enter that just SENT a line, or a held key, must not open the input again
        if (this.greymarchInMenu()) { this.greymarchChatWhy("Enter ignored: the game says '" + this.greymarchMenuName + "' is open"); return; }
        this.greymarchChatStaleWindows();
        this.greymarchChatOpen();
        if (!this.greymarchChatTyping) this.greymarchChatWhy("Enter did not open the input (chat on: " + !!this.greymarchChatOn + ", select screen: " + !!this.greymarchScreenUp + ", staff panel: " + !!this.greymarchAdminOn + ", X menu: " + !!this.greymarchMenuOn + ")");
    }
    // HARD RULE: Enter opens the chat. The staff panel, the X menu, the K window and the chancery hold the keyboard while they are open, so an Enter that reaches the GAME while one of
    // them is still marked open means the mark is stale (the window closed without saying so, or lost the keyboard): the mark is cleared and that window hidden, so the chat opens.
    // While the browser really has the keyboard, the window is open for real and Enter belongs to it.
    greymarchChatStaleWindows(): any {
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchProfOn && !this.greymarchChanceryOn && !this.greymarchVampMenuOn && !this.greymarchEmoteOn) return;
        var focused = true;
        try { focused = !!this.sp.browser.isFocused(); } catch (e) { focused = true; } // cannot tell: leave the window alone
        if (focused) return;
        this.greymarchLog("chat: Enter reached the game while " + [this.greymarchAdminOn ? "the staff panel" : "", this.greymarchMenuOn ? "the X menu" : "", this.greymarchProfOn ? "the K window" : "", this.greymarchChanceryOn ? "the chancery" : "", this.greymarchVampMenuOn ? "the vampire window" : "", this.greymarchEmoteOn ? "the emote wheel" : ""].filter(Boolean).join(", ") + " was marked open without the keyboard; closed it so the chat opens");
        if (this.greymarchAdminOn) { try { this.greymarchAdminHide(); } catch (e1) { this.greymarchAdminOn = false; } }
        if (this.greymarchMenuOn) { try { this.greymarchMenuHide(); } catch (e2) { this.greymarchMenuOn = false; } }
        if (this.greymarchProfOn) { try { this.greymarchProfHide(); } catch (e3) { this.greymarchProfOn = false; } }
        if (this.greymarchChanceryOn) { try { this.greymarchChanceryHide(); } catch (e4) { this.greymarchChanceryOn = false; } }
        if (this.greymarchVampMenuOn) { try { this.greymarchVampMenuHide(); } catch (e5) { this.greymarchVampMenuOn = false; } }
        if (this.greymarchEmoteOn) { try { this.greymarchEmoteHide(); } catch (e6) { this.greymarchEmoteOn = false; } }
    }
    // Why a key press did nothing, to the server log (at most once every 5 seconds, so a held key cannot flood it)
    greymarchChatWhy(text: string): any {
        var now = Date.now();
        if (now < (this.greymarchChatWhyNext || 0)) return;
        this.greymarchChatWhyNext = now + 5000;
        this.greymarchLog("chat: " + text);
    }
    // Start typing. Not over the select screen, the staff panel or the X menu.
    greymarchChatOpen(): any {
        if (!this.greymarchChatOn || this.greymarchChatTyping || this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn) return;
        this.greymarchChatTyping = true;
        this.greymarchChatOpenedAt = Date.now();
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchChatToPage("open", {});
    }
    greymarchChatClose(): any {
        if (!this.greymarchChatTyping) return;
        this.greymarchChatToPage("close", true);
        this.greymarchChatFocus(false);
    }
    // the page tells us when it has the keyboard (typing) and when it lets go
    greymarchChatFocus(on: any): any {
        this.greymarchChatTyping = !!on;
        if (!on) { this.greymarchChatClosedAt = Date.now(); this.greymarchChatReleaseUntil = Date.now() + 1000; }
        if (on) { this.sp.browser.setVisible(true); this.sp.browser.setFocused(true); return; }
        if (!this.greymarchScreenUp && !this.greymarchPanelHasKeys()) this.sp.browser.setFocused(false);
        this.greymarchChatToPage("close", true); // the page layer lets the mouse through again
    }
    greymarchChatSend(data: any): any {
        var body: any = { customPacketType: "greymarchChat", op: data.op === "send" ? "send" : "init" };
        if (body.op === "send") { body.text = String(data.text || "").slice(0, 300); body.tab = data.tab === "staff" ? "staff" : "local"; }
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify(body) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
        // HARD RULE: sending a line closes the input. The page closes itself too; this makes sure the game lets go of the keyboard even if the page's own "let go" never arrives.
        if (body.op === "send" && this.greymarchChatTyping) this.greymarchChatFocus(false);
    }
    // HOUSES AND STORAGE: the names staff gave doors ("Breezehome") are shown by every game instead of the base game's, and an owned door says who owns it on a second line
    // ("Owned by: Alda Ring"). The server sends { reference id: { label, owner } }; a door with no label of its own keeps the game's name above the owner line; a door that loses
    // both goes back to the game's own name. Every few seconds the name is compared and set again if it differs, so a redesignation or a new owner shows within moments.
    // The game's own "E Open / Guard Barracks" text for a load door comes from where the door leads and ignores the name set above (the log shows the name is kept), so it is overridden by force:
    // (1) the game's prompt text field in the HUD (Scaleform) is overwritten with the door's text every 100 ms while the door is in the crosshair; the fields that exist and what they held are logged
    // once per door so the right one is known; (2) until that is seen to work, the chat page draws the same prompt itself. Only the door in the crosshair is looked at.
    greymarchDoorPrompt(now: any): any {
        if (now < (this.greymarchDoorPromptNext || 0)) return;
        this.greymarchDoorPromptNext = now + 100;
        var text = "";
        var want = this.greymarchDoorNames || {};
        var forced = false;
        if (!this.greymarchScreenUp && !this.greymarchMenuOn && !this.greymarchAdminOn && this.greymarchChatOn) {
            try {
                var ref = this.sp.Game.getCurrentCrosshairRef();
                var remote = ref ? misc.localIdToRemoteId(ref.getFormID()) : 0;
                var done = this.greymarchDoorNamesDone || {};
                if (remote && want[remote] !== undefined && done[remote]) {
                    text = String(done[remote]);
                    forced = this.greymarchDoorForce(remote, text);
                }
            } catch (e) { text = ""; if (!this.greymarchDoorPromptErr) { this.greymarchDoorPromptErr = true; this.greymarchLog("props: door prompt failed (" + e + ")"); } }
        }
        this.greymarchDoorIcon(!!text);
        var draw = forced ? "" : text; // our own drawing is only needed while the game's text could not be overwritten
        if (draw !== (this.greymarchDoorPromptText || "")) {
            this.greymarchDoorPromptText = draw;
            this.greymarchChatToPage("door", draw);
        }
    }
    // The "E" key icon of the prompt is hidden while the door in the crosshair is a named one, and shown again the moment it is not. Which HUD clip is the icon is not known for certain, so the likely
    // ones are all tried (a path that does not exist is ignored by the game) and the log says which of them were visible, once.
    greymarchDoorIcon(hide: boolean): any {
        if (hide === !!this.greymarchDoorIconHidden) return;
        var ui = this.sp.Ui;
        var names = ["RolloverButton_mc", "RolloverButton_tf", "RolloverButtonInstance", "RolloverButton", "ActivateButton", "RolloverInstance.Button", "RolloverNameInstance.Button"];
        var seen: string[] = [];
        for (var i = 0; i < names.length; i++) {
            var target = "_root.HUDMovieBaseInstance." + names[i] + "._visible";
            try {
                if (hide && ui.getBool("HUD Menu", target)) seen.push(names[i]);
                ui.setBool("HUD Menu", target, !hide);
            } catch (e) { /* not in this HUD */ }
        }
        this.greymarchDoorIconHidden = hide;
        if (hide && !this.greymarchDoorIconLogged) { this.greymarchDoorIconLogged = true; this.greymarchLog("props: E icon hidden; HUD clips that were visible: " + (seen.length ? seen.join(", ") : "none of the guesses")); }
    }    // Overwrite the HUD's rollover (activate) text with the door's text. The log of a real door showed where it lives: RolloverNameInstance.text holds the verb and where the door leads ("Open", a line
    // break, "Whiterun"); the door's own display name sits in RolloverText.text. So the line after the verb is replaced by ours and the verb stays. Returns true when the game's own text now reads ours.
    greymarchDoorForce(remote: any, text: string): any {
        var ui = this.sp.Ui;
        var hud = "HUD Menu";
        var field = "_root.HUDMovieBaseInstance.RolloverNameInstance.text";
        var cur = "";
        try { cur = String(ui.getString(hud, field) || ""); } catch (e) { return false; }
        if (!this.greymarchDoorForceLogged) { this.greymarchDoorForceLogged = true; this.greymarchLog("props: the game's prompt on door " + Number(remote).toString(16) + " reads '" + cur + "'"); }
        if (!cur.length) return false;
        var m = cur.match(/[\r\n]+/);
        var sep = m ? m[0] : String.fromCharCode(10);
        var verb = m ? cur.substring(0, cur.indexOf(sep)) : cur;
        var want = verb + sep + text;
        if (cur === want) return true;
        try { ui.setString(hud, field, want); } catch (e2) { return false; }
        return false; // checked again 100 ms later; true once the game keeps it
    }    greymarchDoorNamesApply(now: any): any {
        if (now < (this.greymarchDoorNamesNext || 0)) return;
        this.greymarchDoorNamesNext = now + 3000;
        var want = this.greymarchDoorNames || {};
        var done = this.greymarchDoorNamesDone || (this.greymarchDoorNamesDone = {});
        var orig = this.greymarchDoorOrig || (this.greymarchDoorOrig = {}); // the game's own name of each door we have renamed
        var sp = this.sp;
        for (var id in want) {
            var w = want[id];
            var label = typeof w === "string" ? w : String((w && w.label) || "");
            var owner = typeof w === "string" ? "" : String((w && w.owner) || "");
            var local = misc.remoteIdToLocalId(Number(id));
            if (!local) continue;
            var o: any = null;
            try { o = sp.ObjectReference.from(sp.Game.getFormEx(local)); } catch (e0) { o = null; }
            if (!o) {
                if (!this.greymarchDoorMiss) this.greymarchDoorMiss = {};
                if (!this.greymarchDoorMiss[id]) { this.greymarchDoorMiss[id] = 1; this.greymarchLog("props: door " + Number(id).toString(16) + " is not loaded here (local " + local.toString(16) + ")"); }
                continue;
            }
            try {
                if (orig[id] === undefined) { var own = String(o.getDisplayName() || ""); orig[id] = own.length ? own : "Door"; } // the game's own name; never empty (an empty display name can crash the game)
                var base = label || orig[id];
                var text = owner ? base + " - Owned by: " + owner : base; // one line: a line break in a display name is not reliably drawn by the game's prompt
                if (text.length && String(o.getDisplayName()) !== text) {
                    o.setDisplayName(text, true);
                    if (done[id] !== text) this.greymarchLog("props: door " + Number(id).toString(16) + " (local " + local.toString(16) + ") named '" + text + "', reads back '" + String(o.getDisplayName()) + "'"); // once per change, so the server log shows whether the game kept the name
                }
                done[id] = text;
            } catch (e1) { if (!this.greymarchDoorErr) { this.greymarchDoorErr = true; this.greymarchLog("props: could not name door " + id + " (" + e1 + ")"); } }
        }
        for (var id2 in done) {
            if (want[id2] !== undefined) continue;
            var l2 = misc.remoteIdToLocalId(Number(id2));
            // The door goes back to the game's OWN name, which was remembered before it was first renamed. NEVER set an empty name: that is what crashed the game (and everybody near the door) when an owner was removed.
            var back = orig[id2];
            try { var o2 = l2 && back ? sp.ObjectReference.from(sp.Game.getFormEx(l2)) : null; if (o2 && String(o2.getDisplayName()) !== back) o2.setDisplayName(back, true); } catch (e2) { /* the door is not loaded: it keeps its name until it is */ }
            delete done[id2];
        }
    }
}
