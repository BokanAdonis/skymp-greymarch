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
import * as templateFixMod from "./templateFix";
import * as rmMod from "./racemenuLook";

// Runs inside SkyMP's browser page (once). Each shows a page from Platform/UI in an iframe and relays its messages.
const PAGE_SCRIPT = "(function(){if(window.__gmSend)return;var f=document.createElement('iframe');f.id='greymarch-frame';f.src='greymarch-select.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483647;background:#05080d;display:none';var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmSend=function(m){f.style.display=m.fn==='hide'?'none':'block';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const HUD_SCRIPT = "(function(){if(window.__gmHud)return;var f=document.createElement('iframe');f.id='greymarch-hud-frame';f.src='greymarch-hud.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483000;background:transparent;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmHudSend=function(m){if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};window.__gmHud=f;document.body.appendChild(f)})();";
const ADMIN_SCRIPT = "(function(){if(window.__gmAdminSend)return;var f=document.createElement('iframe');f.id='greymarch-admin-frame';f.src='greymarch-admin.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483200;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmAdminSend=function(m){if(m.fn==='show')f.style.pointerEvents='auto';else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const CHAT_SCRIPT = "(function(){if(window.__gmChatSend)return;var f=document.createElement('iframe');f.id='greymarch-chat-frame';f.src='greymarch-chat.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483100;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmChatSend=function(m){if(m.fn==='open'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='close'||m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const MENU_SCRIPT = "(function(){if(window.__gmMenuSend)return;var f=document.createElement('iframe');f.id='greymarch-menu-frame';f.src='greymarch-menu.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483210;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmMenuSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const PROF_SCRIPT = "(function(){if(window.__gmProfSend)return;var f=document.createElement('iframe');f.id='greymarch-prof-frame';f.src='greymarch-prof.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483220;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmProfSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const CONNECT_FAIL_MS = 90000; // the connecting screen over the main menu: this long without the character select, it says what to do (greymarchConnectCover)
const WOLF_MORPH_MS = 4300; // the werewolf transformation: the race changes at the animation's "SetRace" cue, or after this long if the cue is not seen (the cue is about 4.0 s in, animationdatasinglefile.txt)
const DOOR_NAMES_PER_PASS = 8; // property door labels renamed per pass (greymarchDoorNamesApply); the rest follow 250 ms later
const DOOR_FORM_TYPE = 29; // FormType.Door
const TGM_CARRY = 100000; // staff TGM: carry weight added while it is on (no carry limit, like the console's tgm), taken off again when it is switched off
const WOLF_KEY_WAIT_MS = 600; // Z with Beast Form equipped: how long the game gets to cast it before the press itself is reported (greymarchWolfTick)
const SHAPE_REST_MS = 800, SHAPE_POWER_REST_MS = 1600; // a creature's attacks: the rest after a normal and after a power attack (the server allows the same pace)
const SHAPE_LAND_MS = 450; // a creature's swing is reported this long after it starts (about when it lands)
const SHAPE_NPC_READY_MS = 8000; // a creature NPC that is not ready this long after it was placed is placed again
const SHAPE_SILENCE_MS = 20000; // a creature form: with no word from the server for this long the player changes back by themselves (the server repeats "on" every 5 seconds)
const WOLF_BACK_GRACE_MS = 2000; // Z changes back, but not in the first 2 seconds after the body changed
const STANDUP_FALLBACK_MS = 1500; // greymarchStandUp: still in the furniture this long after the get-up animation was asked for, the player is snapped to standing
const LIP_STEP_MS = 110; // a talking mouth changes shape this often
const LIP_OPEN = [[0, 0.55], [1, 0.45], [6, 0.6], [11, 0.5], [5, 0.45], [8, 0.5]]; // [phoneme, strength]: Aah, BigAah, Eh, Oh, Eee, I
const LIP_CLOSED = [[2, 0.55], [4, 0.4], [10, 0.4]]; // BMP, DST, N: the lips meet or nearly
// THE BEAST FORMS' RACES in GreymarchCore.esp (each a copy of the werewolf or werebear race with its own skin): kind -> [the record's id in the plugin, its name]. The wolf's
// kinds are what the server sends as kind (werewolf.js WOLF_KINDS); black and polar are the werebear's looks. Frost Wolf, Rabid Wolf, Moonborn and Elder Alpha: 2026-10-21; the Silvermane Alpha: 2026-10-30.
const GM_WOLF_FORMS: { [kind: string]: [number, string] } = {
  alpha: [0x804, "Alpha"], pup: [0x80a, "pup"], frost: [0x866, "Frost Wolf"], rabid: [0x86b, "Rabid Wolf"], moonborn: [0x870, "Moonborn"], elder: [0x875, "Elder Alpha"],
  silvermane: [0x87c, "Silvermane Alpha"],
  black: [0x85c, "black bear"], polar: [0x861, "polar bear"],
};
// the lists in the server's greymarchWolfAlphas packet, by kind
const GM_WOLF_LISTS: { [kind: string]: string } = { alpha: "actors", pup: "pups", black: "blackbears", polar: "polarbears", frost: "frosts", rabid: "rabids", moonborn: "moonborns", elder: "elders", silvermane: "silvermanes" };
const WOLF_ROAR_MS = 0; // R: no wait between roars (2026-10-21, the owner's call; the server has none either: werewolf.js TUNE.howlCooldownMs). One roar per press of R.
// GREYMARCH: THE HOWL SHOUT (2026-10-23). The vanilla howl is the werewolf's voice: PlayerWerewolfChangeScript puts a howl shout in the voice slot, and the graph's
// howl (HowlStart) casts it (BeginCastVoice). With none there the howl state had nothing to cast and stalled: the roar played once, then only its sound. A
// changed player's body is given this one while changed (their own voice put back after), and other players' werewolf NPCs here get it for their roar.
// HowlWerewolfDetectLife (Skyrim.esm): its effect only shows the living, so roaring (no wait between roars) changes nothing in play. HowlWerewolfFear
// (0x0CF790, Howl of Terror, the vanilla first howl) would make the NPCs near the roarer flee at every roar.
const WOLF_HOWL_SHOUT = 0x0ce218;
const WOLF_ROAR_SOUND = 0x101008, BEAR_ROAR_SOUND = 0x0f95bb; // NPCWerewolfShout (the werewolf's howl) and NPCBearAggroWarning01 (a bear's warning roar), Skyrim.esm
// vampires (gamemode vampire.js): the game's own records, inside Dawnguard.esm (read from the game files); the real IDs are looked up with Game.getFormFromFile
const FEED_REPLAY_MS = 6000; // the held feeding: the standing feed is played again at most this often (greymarchVampFeedHeld)
const FEED_RETRY_MS = 300; // ... and when the game refused it (still finishing the last one), tried again this soon
const FEED_RESET_AFTER = 4; // refused this many times in a row: the biter is put back to the default pose first (the game will not start a paired idle over a stuck one)
const FEED_STOP_KEYS = [0x11, 0x1e, 0x1f, 0x20]; // W A S D (DirectInput scan codes): the vampire's movement keys end a feeding
const VAMP_FORMS = { mist: 0x38ba, lord: 0x283b, potionFx: 0x18ef4, potion: 0x18ef3, feedIdle: 0xe6a8 }; // DLC1VampireMistform, DLC1VampireChange, DLC1BloodPotionEffect, DLC1BloodPotion, IdleVampireStandingFeedFront_Loose
// a vampire's eyes, one colour per bloodline (GreymarchCore.esp, made by tools/vampire-eyes.js in the launcher repo): GM_VampEyes{Male,Female}{Colour}0..6, glow 0 (none) to 6 (a Lord)
const VAMP_EYES: any = { blue: { male: 0x80e, female: 0x815 }, red: { male: 0x81f, female: 0x826 }, yellow: { male: 0x82e, female: 0x835 }, green: { male: 0x83d, female: 0x844 }, purple: { male: 0x84c, female: 0x853 } };
const VAMP_EYE_RACES = [0x13746, 0x13744, 0x13741, 0x13748, 0x13743, 0x13749, 0x13742, 0x13747]; // Nord, Imperial, Breton, Redguard, High Elf, Wood Elf, Dark Elf, Orc (the human eye shape; khajiit and argonian eyes are not made yet)
const VAMP_FANGS = { male: 0x81c, female: 0x81d }; // GM_VampFangsMale / GM_VampFangsFemale: the human teeth with the upper canines pulled into fangs
const VAMP_FANG_RACES = [0x13746, 0x13744, 0x13741, 0x13748, 0x13743, 0x13749, 0x13742]; // the human and elf teeth; orcs keep their tusks
const VAMP_FANG_ITEM = 0x0323fe; // Dragonborn.esm's DLC2ApocryphaBookWarpArmor (slot 61 only, on the server too): GreymarchCore.esp makes it the worn "Vampire Fangs" (DLC2DummyHelmet before: the server's copy covered nearly every armour slot and armour came off) (the server gives it, greymarchVampFangsWear puts it on)
const VAMP_OWN_TEETH = { male: 0x51631, female: 0x5150f }; // MaleMouthHumanoidDefault / FemaleMouthHumanoidDefault (Skyrim.esm): the race's teeth, put back for a character with no teeth part of their own
const CHANCERY_SCRIPT =PROF_SCRIPT.split("__gmProfSend").join("__gmChanceryRun").split("greymarch-prof").join("greymarch-chancery").split("2147483220").join("2147483221"); // the chancery window (/chancery): the same loader, another page
const EMOTE_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmEmoteRun").split("greymarch-prof").join("greymarch-emote").split("2147483220").join("2147483223").split("e.key==='x'||e.key==='X'").join("e.key==='g'||e.key==='G'"); // the emote wheel (G): the same loader, another page; letting go of G inside the page is a release too
const VAMP_MENU_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmVampRun").split("greymarch-prof").join("greymarch-vampire").split("2147483220").join("2147483222"); // the vampire window (/vampire): the same loader, another page
// THE CONSOLE (~) IS SHUT for every player, staff too (staff have F7). Its menus are closed the frame they open (greymarchConsoleTick) and the commands
// that cheat do nothing even when typed anyway (a mod's ConsoleUtil, a "bat" file, sStartingConsoleCommand in Skyrim.ini): greymarchConsoleLock.
export const CONSOLE_MENUS = ["Console", "Console Native UI Menu"];
const CONSOLE_KEY = 41; // ~ (DIK_GRAVE): pressed again to close the console when GreymarchCamera.dll is older than 1.3 (no CloseMenu)
// SkyMP's own consoleCommandsService already sends these to the server, which refuses them (consoleCommandsAllowed is never set): left to it
const CONSOLE_SKYMP = ["additem", "equipitem", "placeatme", "disable", "mp"];
export const CONSOLE_BLOCKED = [
    "coc", "cow", "moveto", "movetoqt", "setpos", "setangle", "tmm", "tcl", "tfc", "tgm", "tim", "tai", "tcai", "tdetect", // places, god mode, noclip, the map, the AI
    "kill", "killall", "resurrect", "setav", "modav", "forceav", "restoreav", "damageav", "setgs", "sgtm", "setlevel", "setscale", "setessential", // actor values, life and death
    "addperk", "removeperk", "addspell", "removespell", "psb", "addshout", "teachword", "unlockword", "advskill", "incpcs", // perks, spells, skills
    "removeitem", "removeallitems", "duplicateallitems", "unequipitem", "lock", "unlock", "setownership", "openactorcontainer", "enable", "markfordelete", // items, doors, containers
    "setcrimegold", "addtofaction", "removefromfaction", "removefromallfactions", "setfactionrank", "setrelationshiprank", "setplayerteammate", // crime and factions
    "setstage", "caqs", "completequest", "resetquest", "startquest", "stopquest", "setpqv", "sexchange", "setrace", "placeleveledactoratme", "sw", "fw", "bat", // quests, body, spawns, weather, batch files
];
const OPEN_ON_RELEASE = [65, 35, 48, 64, 66, 37]; // F7, H, B, F6, F8, K: their windows open when the key is let go (greymarchKey)
const FORGE_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmForgeRun").split("greymarch-prof").join("greymarch-forge").split("2147483220").join("2147483225"); // the Greymarch forge window: the same loader, another page
const CRAFT_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmCraftRun").split("greymarch-prof").join("greymarch-craft").split("2147483220").join("2147483224"); // the crafting panel (a station was used): the same loader, another page
const CLICK_GUARD_MS = 400; // after a window closes, attacks and drawing a weapon are ignored this long: the click on its X is not a swing (greymarchClickGuard)
const MINI_KEEP_MS = 3500; // a mini game window kept up between logs (the chopping block) closes if the next does not come within this
const MINIGAME_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmMiniRun").split("greymarch-prof").join("greymarch-minigame").split("2147483220").join("2147483226"); // the profession mini games (gamemode minigames.js): the same loader, another page, over the others
const LEDGER_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmLedgerRun").split("greymarch-prof").join("greymarch-ledger").split("2147483220").join("2147483223"); // the guard ledger (/reports)
const SCRIBE_SCRIPT = PROF_SCRIPT.split("__gmProfSend").join("__gmScribeRun").split("greymarch-prof").join("greymarch-scribe").split("2147483220").join("2147483227"); // the scribe's desk (/scribe): letters and books: the same loader, another page

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
        try { this.controller.on("magicEffectApply", (e: any) => { try { var pu = this.greymarchPotionUndo; if (pu && e && e.effect && e.activeEffect && e.target && e.target.getFormID() === 0x14 && Date.now() < pu.until && pu.mgefs[e.effect.getFormID() >>> 0]) pu.effects.push(e.activeEffect); } catch (x) { /* not ours */ } }); } catch (puErr) { /* the bar shows the first drink for a moment */ } // the first drink of a potion: its effects are ended (greymarchPotionUndoTick)
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.activeEffect && this.greymarchMagicBlock && this.greymarchMagicBlock[e.effect.getFormID() >>> 0]) (this.greymarchMagicBlockQueue || (this.greymarchMagicBlockQueue = [])).push({ active: e.activeEffect, effect: e.effect.getFormID() >>> 0, caster: e.caster ? e.caster.getFormID() >>> 0 : 0 }); } catch (x) { /* not ours */ } }); } catch (mbErr) { /* no effect events: NPC raise-the-dead and summons are not stopped */ } // an NPC raising the dead or summoning (gamemode magicblock.js): ended in greymarchMagicBlockDrive
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.effect.getFormID() === 0x92c45 && e.target && e.target.getFormID() === 0x14) this.greymarchWolfSignal("magicEffectApply"); } catch (x) { /* not ours */ } }); } catch (maErr) { /* the other signals still see it */ }
        try { this.controller.on("spellCast", (e: any) => { try { if (e && e.spell && e.caster && e.caster.getFormID() === 0x14) this.greymarchVampSignal("cast", e.spell.getFormID()); } catch (x) { /* not ours */ } }); } catch (vcErr) { /* no cast events: the powers are not reported */ } // a vampire's Mist Form or Vampire Lord (greymarchVampTick)
        try { this.controller.on("spellCast", (e: any) => { try { if (e && e.spell && e.caster && e.caster.getFormID() === 0x14) this.greymarchCastSend(e.spell.getFormID()); } catch (x) { /* not ours */ } }); } catch (hcErr) { /* no cast events: healing spells are not reported */ } // every cast of the player's own spells goes to the server, which applies the healing ones (healing.js); it never applies spell effects itself
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.target && e.target.getFormID() === 0x14) this.greymarchVampSignal("effect", e.effect.getFormID()); } catch (x) { /* not ours */ } }); } catch (veErr) { /* no effect events: a Potion of Blood is not reported */ } // a Potion of Blood drunk
        try { this.controller.on("equip", (e: any) => { try { if (e && e.baseObj && e.actor && e.actor.getFormID() === 0x14) { this.greymarchVampSignal("equip", e.baseObj.getFormID()); this.greymarchConsumeNote(e.baseObj); } } catch (x) { /* not ours */ } }); } catch (vqErr) { /* the effect event still sees it */ } // a potion is "equipped" when it is drunk
        this.controller.emitter.on("greymarchStage", (text: string) => this.greymarchLog(text)); // other services report where the game is, for the server log
        this.controller.emitter.on("greymarchEar", (e: any) => { if (e && typeof e.name === "string" && isFinite(e.x) && isFinite(e.y) && isFinite(e.z)) { const m = this.greymarchEarsSeen || (this.greymarchEarsSeen = {}); m[e.name] = { x: e.x, y: e.y, z: e.z, at: Date.now(), localId: Number(e.id) || 0 }; } }); // where each named player's head is in the world (where their voice comes from: greymarchEarsTick), and which character this game draws for them (their mouth moves while they talk: greymarchLipTick)
        this.controller.emitter.on("greymarchHead", (e: any) => { const m = this.greymarchHeads || (this.greymarchHeads = {}); m[e.name] = { x: e.x, y: e.y, at: Date.now() }; this.greymarchRes = { w: e.rw, h: e.rh }; }); // where each named player's head is on screen (for the microphone icon)
        try { this.greymarchConsoleLock(); } catch (clErr) { /* the menu is still closed every frame */ } // the console (~): the commands that cheat do nothing, from the first frame (the main menu too: "update" does not run there)
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
        if (type === "greymarchAdminReply" && this.greymarchStaffReply(msg)) return; // the staff check before F7 opens, or a staff-only refusal
        if (type === "greymarchAdminReply") { var brids = this.greymarchBuildRids; if (brids && brids[msg.rid]) { delete brids[msg.rid]; this.greymarchBuildCamSay(msg.ok ? (msg.data && msg.data.message) || "Done." : String(msg.error || "That did not work.")); return; } this.greymarchAdminToPage("reply", msg); return; }
        if (type === "greymarchNotice") { if (msg.title) { this.greymarchToast(msg); return; } var nq = this.greymarchNoticeQueue || (this.greymarchNoticeQueue = []); if (nq.length < 20) nq.push(String(msg.text).slice(0, 300)); return; } // a plain notice: the game's own top-left message, shown from the update phase (greymarchNoticeTick: Debug.notification does nothing from here)
        if (type === "greymarchStandUp") { this.greymarchStandUpWanted = Date.now(); return; } // get up from the furniture the player is in (gamemode professions.js, after a won mining game): done in greymarchStandUpTick
        if (type === "greymarchStats") { this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; return; }
        if (type === "greymarchKill") { this.greymarchKillMe(); return; }
        if (type === "greymarchKnown") { this.greymarchKnown = msg.names && typeof msg.names === "object" ? msg.names : {}; this.greymarchNamesNext = 0; try { (Function("return this")() as any).__gmKnown = this.greymarchKnown; } catch (e) { /* the floating names keep showing IDs */ } return; }
        if (type === "greymarchChatLine") { this.greymarchChatToPage("line", msg); return; }
        if (type === "greymarchChatInfo") { this.greymarchConsoleAllowed = msg.console === true; this.greymarchChatToPage("info", msg); return; } // console: true = Lead GM and up keep the console (~) open (greymarchConsoleTick)
        if (type === "greymarchProps") { this.greymarchDoorNames = msg.doors && typeof msg.doors === "object" ? msg.doors : {}; this.greymarchDoorNamesNext = 0; return; }
        if (type === "greymarchGmAlert") { this.greymarchChatToPage("alert", msg); return; } // a player typed /gm (the server only sends it to Trial GM and up)
        if (type === "greymarchMenuReply") { this.greymarchMenuToPage("reply", msg); return; }
        if (type === "greymarchShape") { this.greymarchShapeMsg(msg); return; }
        if (type === "greymarchBuildAngle") { if (Number(msg.id) > 0 && typeof msg.z === "number" && isFinite(msg.z)) (this.greymarchBuildAngleQueue || (this.greymarchBuildAngleQueue = [])).push({ id: Number(msg.id) >>> 0, z: Number(msg.z) }); return; } // a piece a GM placed was turned (gamemode buildsys.js): SkyMP's SetAngle reaches only the server's copy, so this game turns its own (greymarchBuildAngleTick)
        if (type === "greymarchStagger") { if (Number(msg.actor) > 0) (this.greymarchStaggerQueue || (this.greymarchStaggerQueue = [])).push({ actor: Number(msg.actor), self: msg.self === true }); return; } // a starving character staggers (gamemode hunger.js; played in greymarchHungerDrive, for everyone near)
        if (type === "greymarchMagicBlock") { var mb: any = {}; if (Array.isArray(msg.effects)) for (var mi = 0; mi < msg.effects.length && mi < 5000; mi++) mb[Number(msg.effects[mi]) >>> 0] = true; this.greymarchMagicBlock = mb; return; } // the raise-the-dead and summon effects to end when an NPC casts them (gamemode magicblock.js)
        if (type === "greymarchHunger") { this.greymarchHudToPage("hunger", { stage: String(msg.stage || "fed") }); return; } // the hunger bowl on the HUD (right, level with the voice display; gamemode hunger.js)
        if (type === "greymarchEnergy") { this.greymarchHudToPage("energy", { v: Number(msg.v), state: String(msg.state || "") }); return; } // the energy bar on the HUD, always on screen above the hunger bowl (gamemode exhaustion.js)
        if (type === "greymarchHungerFx") { this.greymarchHungerRegen = msg.regen !== false; return; } // starving: no health or stamina regeneration (greymarchHungerDrive)
        if (type === "greymarchFaceOf") { this.greymarchFaceOf(msg); return; } // another player's face from the emote wheel (gamemode faces.js; put on in greymarchFaceTick)
        if (type === "greymarchGround") { if (Number(msg.id) > 0 && typeof msg.z === "number" && isFinite(msg.z)) { const gl: any = Function("return this")(); const fx: any = gl.__gmGroundFix || (gl.__gmGroundFix = {}); const gr: any = msg.grid && Array.isArray(msg.grid.h) && msg.grid.h.length === 25 && [msg.grid.x, msg.grid.y, msg.grid.step].every((n: any) => typeof n === "number" && isFinite(n)) && msg.grid.step > 0 ? { x: msg.grid.x, y: msg.grid.y, step: msg.grid.step, h: msg.grid.h.map((v: any) => (typeof v === "number" && isFinite(v) ? v : null)) } : null; fx[String(Number(msg.id) >>> 0)] = { z: msg.z, off: Number(msg.off) || 0, at: Date.now(), grid: gr }; if ((this.greymarchGroundCrumbs = (this.greymarchGroundCrumbs || 0) + 1) <= 40 && typeof this.greymarchCrumb === "function") this.greymarchCrumb("ground word " + (Number(msg.id) >>> 0).toString(16) + ": " + Math.round(Number(msg.off) || 0) + " off, the ground at " + Math.round(msg.z)); } return; } // the server saw an NPC off the ground: where the ground is (formView gmHostedTick puts it down if this game hosts it; gamemode groundclamp.js)
        if (type === "greymarchBeast") { this.greymarchBeastFrames(msg); return; } // a server-driven animal moved (gamemode wildlifebrain.js): played by formView (gmPuppetMove)
        if (type === "greymarchShapeAnim") { if (typeof msg.ev === "string" && msg.ev.length < 64 && Number(msg.actor) > 0) (this.greymarchShapeAnimQueue || (this.greymarchShapeAnimQueue = [])).push({ actor: Number(msg.actor), ev: msg.ev }); return; } // another player's creature attacked (played in greymarchShapeDrive) // a creature form (staff): greymarchShapeTick changes the body
        if (type === "greymarchWolfForm") { if (this.greymarchWolfWant !== !!msg.on) this.greymarchLog("wolf: the server says " + (msg.on ? "changed" : "no (change back)")); this.greymarchWolfWant = !!msg.on; if (msg.on) { this.greymarchWolfWordAt = Date.now(); this.greymarchWolfAlpha = !!msg.alpha; this.greymarchWolfPup = !msg.alpha && !!msg.pup; this.greymarchWolfKind = msg.kind && GM_WOLF_FORMS[msg.kind] && msg.kind !== "black" && msg.kind !== "polar" ? String(msg.kind) : this.greymarchWolfAlpha ? "alpha" : this.greymarchWolfPup ? "pup" : ""; this.greymarchWolfBearRace = msg.bear && Number(msg.race) > 0 ? Number(msg.race) >>> 0 : 0; if (this.greymarchWolfBearRace) this.greymarchWolfBearSeen = this.greymarchWolfBearRace; this.greymarchWolfBlack = !!this.greymarchWolfBearRace && !!msg.black; this.greymarchWolfPolar = !!this.greymarchWolfBearRace && !!msg.polar; } return; } // (logged only when it changes: the server repeats it every 5 seconds) // the werewolf form (greymarchWolfTick)
        if (type === "greymarchWolfRoar") { if (Number(msg.actor) > 0) (this.greymarchWolfRoarQueue || (this.greymarchWolfRoarQueue = [])).push({ actor: Number(msg.actor), bear: !!msg.bear }); return; } // another player roared nearby: the sound on their NPC (greymarchWolfTick)
        if (type === "greymarchWolfAlphas") { var lists: any = {}; for (var lk in GM_WOLF_LISTS) lists[lk] = Array.isArray(msg[GM_WOLF_LISTS[lk]]) ? msg[GM_WOLF_LISTS[lk]] : []; this.greymarchWolfLists = lists; return; } // the other players in the Alpha form: drawn white (greymarchWolfAlphaOthers)
        if (type === "greymarchSpellCosts") { this.greymarchSpellCostWant = msg.costs && typeof msg.costs === "object" ? msg.costs : {}; this.greymarchSpellCostTold = {}; return; } // the Spells balance tab's costs (greymarchSpellCostTick)
        if (type === "greymarchSpellEdits") { this.greymarchSpellEditWant = msg.edits && typeof msg.edits === "object" ? msg.edits : {}; this.greymarchSpellEditTold = {}; return; } // the Magic balance tab's durations and strengths (greymarchSpellEditTick)
        if (type === "greymarchRaceMenuLook") { var rm0 = this.greymarchRmState(); rm0.want = msg.look && typeof msg.look === "object" ? msg.look : {}; rm0.tries = 0; return; } // RaceMenu's extra sliders of this character, kept by the server (greymarchRaceMenuTick)
        if (type === "greymarchVampire") { this.greymarchVampWant = msg.on ? msg : null; this.greymarchVampCostTold = {}; this.greymarchHudToPage("blood", { on: !!msg.on, blood: msg.blood, empty: !!msg.empty }); return; } // a vampire's state: the blood drop and what the game applies (greymarchVampTick)
        if (type === "greymarchVampLooks") { this.greymarchVampLookList = Array.isArray(msg.vampires) ? msg.vampires : []; if (Number(msg.me) > 0) this.greymarchMeActor = Number(msg.me) >>> 0; return; } // (me: which of them is this player: the ghosts and effects packets that also say so may not have come yet, and without it the player's own eyes and fangs were never put on) // how every vampire in the world looks (eyes and fangs)
        if (type === "greymarchVampFeed") { if (!msg.on && this.greymarchVampFeedHold) this.greymarchLog("vampire: the server ended the feeding" + (msg.why ? " (" + String(msg.why).slice(0, 80) + ")" : "")); this.greymarchVampFeedWant = msg.on ? { role: msg.role, partner: msg.partner, at: Date.now(), done: false } : { off: true }; return; } // the feeding scene (held until the vampire stops: greymarchVampFeedHeld)
        if (type === "greymarchVampMist") { if (!msg.on) this.greymarchVampMistEnd = true; return; } // Mist Form refused or over: the game's own mist is ended
        if (type === "greymarchVampLord") { if (this.greymarchVampLordWas !== !!msg.on) { this.greymarchVampLordWas = !!msg.on; this.greymarchLog("vampire: the server says the Lord's shape is " + (msg.on ? "on" : "off")); } return; } // the body itself is the creature form (greymarchShape)
        if (type === "greymarchCuffs") { this.greymarchCuffsWant = msg.on ? msg : null; return; } // in cuffs (guards.js): the cuffs worn and the bound pose (greymarchCuffsTick)
        if (type === "greymarchChains") { this.greymarchChainList = Array.isArray(msg.chains) ? msg.chains.slice(0, 16) : []; this.greymarchCuffedList = Array.isArray(msg.cuffed) ? msg.cuffed.slice(0, 64) : []; return; } // who is on whose chain (drawn on the HUD), who is in cuffs (posed)
        if (type === "greymarchProgress") { var pOn = !msg.off && Number(msg.ms) > 0; this.greymarchProgressUntil = pOn ? Date.now() + Math.min(60000, Number(msg.ms)) + 500 : 0; this.greymarchGuardsHudCheck(); this.greymarchHudToPage("progress", pOn ? { on: true, ms: Number(msg.ms), text: String(msg.text || "").slice(0, 120) } : { on: false }); return; } // a timed action (the 7 seconds of cuffing): a bar on the HUD
        if (type === "greymarchWolfFeed") { this.greymarchWolfFeedAt = Date.now(); return; } // the wolf fed (a kill or a corpse): the feeding animation (greymarchWolfTick)
        if (type === "greymarchChanceryReply") { this.greymarchChanceryToPage("reply", msg); return; } // the chancery window (/chancery)
        if (type === "greymarchChanceryOpen") { this.greymarchChanceryShow(); return; }
        if (type === "greymarchEmote") { if (typeof msg.emote === "string" && msg.emote.length < 40) this.greymarchServerEmote = { id: msg.emote, ms: Math.max(500, Math.min(30000, Number(msg.ms) || 4000)), at: Date.now() }; return; } // the server asks for an emote (a Harvester or Chef kneeling at a salt deposit): played in greymarchEmoteTick
        if (type === "greymarchMinigame") { this.greymarchMiniShow(msg); return; } // a profession mini game before the work (gamemode minigames.js)
        if (type === "greymarchMinigameDone") { this.greymarchMiniDone(msg); return; }
        if (type === "greymarchOwnLook") { if (msg.look && typeof msg.look === "object" && Array.isArray(msg.look.headpartIds) && msg.look.headpartIds.length) { this.greymarchOwnLookWant = msg.look; this.greymarchOwnLookRebuild = msg.rebuild === true; } return; } // the barber refused a race or sex change (gamemode barber.js): the old look back on this body (greymarchOwnLookTick)
        if (type === "greymarchChestGlow") { this.greymarchChestGlowWant = msg.on && typeof msg.ref === "string" ? msg.ref.slice(0, 80) : ""; this.greymarchChestGlowAt = 0; return; } // a dungeon's boss chest with its loot waiting (gamemode dungeons.js): it shines (greymarchChestGlowTick)
        if (type === "greymarchForgeOpen") { this.greymarchForgeShow(msg); return; } // a forge was used (gamemode forgemenu.js): the Greymarch forge window instead of the game's menu
        if (type === "greymarchForgeReply") { this.greymarchForgeToPage("reply", msg); return; }
        if (type === "greymarchCraftOpen") { this.greymarchCraftShow(msg); return; } // a crafting station was used (gamemode craftsys.js): the crafting panel
        if (type === "greymarchCraftReply") { this.greymarchCraftToPage("reply", msg); return; }
        if (type === "greymarchCraftDone") { this.greymarchCraftToPage("done", msg); return; }
        if (type === "greymarchVampMenuReply") { this.greymarchVampMenuToPage("reply", msg); return; } // the vampire window (/vampire)
        if (type === "greymarchVampMenuOpen") { this.greymarchVampMenuShow(); return; }
        if (type === "greymarchLedgerReply") { this.greymarchLedgerToPage("reply", msg); return; } // the guard ledger (/reports)
        if (type === "greymarchLedgerOpen") { this.greymarchLedgerShow(); return; }
        if (type === "greymarchScribeReply") { this.greymarchScribeToPage("reply", msg); return; } // the scribe's desk (/scribe)
        if (type === "greymarchScribeOpen") { this.greymarchScribeShow(); return; }
        if (type === "greymarchProfReply") { this.greymarchLog("prof: the server's answer arrived (rid " + msg.rid + ", ok " + msg.ok + ")"); this.greymarchProfToPage("reply", msg); return; } // the professions window (K)
        if (type === "greymarchCombatMod") { var cm = Number(msg.mult); this.greymarchCombatWant = cm >= 0.1 && cm <= 3 ? cm : 1; return; } // the damage multiplier for what is in hand (professions: a weapon above your rank hits weaker, a Brawler's fists hit harder)
        if (type === "greymarchMenuEvent" && msg.type === "body" && Number(msg.looking) > 0 && !this.greymarchMenuOn) { this.greymarchMenuShow({ mode: "open", looking: Number(msg.looking) }); return; } // E on the body of a dead wild animal (gamemode wildlifesystem.js): the menu opens on it to take what is on it
        if (type === "greymarchMenuEvent") { if ((msg.type === "trade_invite" || msg.type === "trade" || msg.type === "feed_invite" || msg.type === "frisk_invite" || msg.type === "guard_view") && !this.greymarchMenuOn) this.greymarchMenuShow({ mode: "invite", looking: 0 }); /* a trade, a vampire's request to feed, a guard's request to frisk or what the frisk found opens the menu by itself */ this.greymarchMenuToPage("event", msg); return; }
        if (type === "greymarchFx") { this.greymarchFxWant = { noclip: !!msg.noclip, speed: Number(msg.speed) || 100, frozen: !!msg.frozen, god: !!msg.god, tgm: !!msg.tgm }; if (msg.me) this.greymarchMeActor = msg.me; return; }
        if (type === "greymarchGhosts") { this.greymarchGhostList = Array.isArray(msg.ghosts) ? msg.ghosts : []; if (msg.me) this.greymarchMeActor = msg.me; this.greymarchOthers = Array.isArray(msg.others) ? msg.others : []; if (msg.stats !== undefined) this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; var inv = Array.isArray(msg.invisible) ? msg.invisible : []; this.greymarchInvisList = inv; var invMap = {}; for (var q = 0; q < inv.length; q++) if (inv[q] !== msg.me) invMap[inv[q]] = true; try { Function("return this")().__gmInvisible = invMap; } catch (gErr) { /* names stay visible */ } var dis = Array.isArray(msg.disguised) ? msg.disguised : []; var disMap = {}; for (var dq = 0; dq < dis.length; dq++) if (dis[dq] !== msg.me) disMap[dis[dq]] = true; try { Function("return this")().__gmDisguised = disMap; } catch (gErr2) { /* names stay visible */ } return; }
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
        if (type === "greymarchEntered") this.controller.emitter.emit("sendMessage", { message: { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchForgeReady" }) }, reliability: "reliable" }); // this game has the forge window (gamemode forgemenu.js)
        if (type === "greymarchEntered") this.controller.emitter.emit("sendMessage", { message: { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchStandUpReady" }) }, reliability: "reliable" }); // this game understands greymarchStandUp (the server stops sending the stagger to get it out of the mining animation)
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
        eq.redrawAt = [Date.now(), Date.now() + 1000]; // and the body drawn again once they are on, and a second later (greymarchTick, IRON ARMOR STILL SHOWING)
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
        this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); // stays visible (but never focused) while the voice display is on; the staff panel keeps it up and focused
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
    // OBJECTS THE START SAVE PINS (templateFix.ts): four times a second a slice of the list is looked at; anything moved goes to the server log (the first 30 in a session)
    // STUCK KEYS (2026-10-24). While one of our pages has the keyboard (chat, K, F7, the X menu ...), SkyrimPlatform gives the game none of the keyboard's
    // events, key releases included. A key held when a page took the keyboard (W while walking, then Enter for the chat) and let go there stayed held in
    // the game: the character walked on and the game's text boxes repeated the letter. Every frame: when a page takes the keyboard, the keys held right
    // then are noted (the game saw them go down); when it lets go, each of those no longer held is released in the game (SKSE Input.releaseKey, sent
    // once the page has let go, so nothing blocks it). The first few go to the server log. (The proper fix is in SkyrimPlatform's input hook.)
    greymarchKeyReleaseTick(): any {
        var sp = this.sp as any;
        var focused = false;
        try { focused = !!sp.browser.isFocused(); } catch (e) { return; }
        var was = !!this.greymarchKeysFocused;
        if (focused === was) return;
        this.greymarchKeysFocused = focused;
        var input = sp.Input;
        if (!input || typeof input.isKeyPressed !== "function" || typeof input.releaseKey !== "function") return;
        if (focused) {
            var held: number[] = [];
            for (var k = 1; k <= 0xdd; k++) { try { if (input.isKeyPressed(k)) held.push(k); } catch (e1) { /* not a key */ } }
            this.greymarchKeysHeld = held;
            return;
        }
        var list: number[] = this.greymarchKeysHeld || [];
        this.greymarchKeysHeld = [];
        var released: number[] = [];
        for (var i = 0; i < list.length; i++) {
            try { if (!input.isKeyPressed(list[i])) { input.releaseKey(list[i]); released.push(list[i]); } } catch (e2) { /* left as it is */ }
        }
        if (released.length) {
            this.greymarchKeysSaid = (this.greymarchKeysSaid || 0) + 1;
            if (this.greymarchKeysSaid <= 10) this.greymarchLog("keys: released " + released.map(function (x) { return "0x" + x.toString(16); }).join(", ") + " in the game (let go while a page had the keyboard)");
        }
    }
    greymarchTemplateFixTick(now: any): any {
        if (now < (this.greymarchTemplateFixNext || 0)) return;
        this.greymarchTemplateFixNext = now + 250;
        try {
            if (!this.greymarchTemplateFix) {
                this.greymarchTemplateFix = new templateFixMod.TemplateFix();
                var fixRef = this.greymarchTemplateFix;
                try { this.controller.on("loadGame", function () { fixRef.reset(); }); } catch (lgErr) { /* objects are then moved once per session */ } // a new world load puts the save's spots back
            }
            var sp = this.sp;
            var moved = this.greymarchTemplateFix.tick({
                look: function (id: number) {
                    var r = sp.ObjectReference.from(sp.Game.getFormEx(id));
                    if (!r) return null;
                    return { x: r.getPositionX(), y: r.getPositionY(), z: r.getPositionZ(), loaded: !!r.is3DLoaded(), actor: !!sp.Actor.from(r) };
                },
                move: function (id: number) {
                    var r = sp.ObjectReference.from(sp.Game.getFormEx(id));
                    if (r) Promise.resolve(r.moveToMyEditorLocation()).catch(function () { /* left where it is */ });
                },
            });
            for (var i = 0; i < moved.length; i++) {
                this.greymarchTemplateFixSaid = (this.greymarchTemplateFixSaid || 0) + 1;
                if (this.greymarchTemplateFixSaid <= 30) this.greymarchLog("world: " + moved[i].toString(16) + " was at the start save's old spot; moved to where the plugins put it");
            }
        } catch (e) {
            if (!this.greymarchTemplateFixErr) { this.greymarchTemplateFixErr = true; this.greymarchLog("world: the start-save fix stopped: " + e); }
            this.greymarchTemplateFixNext = now + 60000;
        }
    }
    greymarchTick(): any {
        this.greymarchRebaseAfterLoad(Date.now()); // "update" runs only once the world is loaded
        this.greymarchSelectFocusGuard(Date.now());
        this.greymarchDoorNamesApply(Date.now());
        this.greymarchDoorPrompt(Date.now());
        this.greymarchChatPending();
        this.greymarchProfPending();
        this.greymarchStaffKeyPending(); // H and B, the same way as K
        this.greymarchKeyReleaseTick(); // keys let go while a page had the keyboard are released in the game too (greymarchKeyReleaseTick)
        this.greymarchTemplateFixTick(Date.now()); // objects the start save pins to their unmodded spot go back where the plugins put them (templateFix.ts)
        this.greymarchEmoteTick(Date.now()); // the emote wheel (G): opening it, playing and stopping an emote (Skyrim functions: the update phase)
        this.greymarchChatWatch(Date.now());
        this.greymarchFovTick(); // the field of view from the chatbox's Settings
        this.greymarchWorldViewGuard(Date.now()); // other players are drawn only while SkyMP's world view is on: see greymarchWorldViewGuard
        if (this.greymarchChatOn && Date.now() >= (this.greymarchChatNext || 0)) { this.greymarchChatNext = Date.now() + 2000; this.greymarchChatToPage("show", true); }
        if (this.greymarchMenuEscAt && Date.now() - this.greymarchMenuEscAt > 700) { this.greymarchMenuEscAt = 0; this.greymarchMenuHide(); } // Esc, and the menu page did not close itself
        this.greymarchToastTick(Date.now());
        this.greymarchEffects(); // staff effects: noclip, speed, frozen, ghosts (cheap: does real work every 400 ms)
        this.greymarchTgmFrame(); // TGM: full magicka and stamina and no shout cooldown, every frame
        this.greymarchHungerDrive(); // hunger: the stagger, regeneration off while starving
        this.greymarchNoticeTick(); // plain notices from the server, the game's own top-left message
        this.greymarchStandUpTick(Date.now()); // the server asked the player to get up from their furniture (the end of a won mining game)
        this.greymarchBuildAngleTick(); // a piece a GM placed was turned: this game turns its copy
        this.greymarchBuildCamTick(Date.now()); // the build system's free camera: the preview where the camera looks
        this.greymarchChopTick(Date.now()); // sitting at a chopping block: the server counts the chops (XP, firewood)
        this.greymarchForgeTick(Date.now()); // after the forge window closed: the smith is surely out of the forge's animation
        this.greymarchChestGlowTick(Date.now()); // a dungeon's boss chest shines while its loot waits
        this.greymarchOwnLookTick(); // the barber put the old look back: the body's race and sex too
        this.greymarchForgePreviewTick(Date.now()); // the forge's display of the picked piece: made, turned and always removed (never left behind)
        this.greymarchPointerGuard(Date.now()); // a window that holds the mouse always has its pointer (the game's Cursor Menu)
        this.greymarchHotkeyTick(Date.now()); // a window hotkey whose key-up the game never sent
        this.greymarchConsoleTick(Date.now()); // the console (~) is closed the frame it opens
        this.greymarchMiniActivateTick(); // a mini game won: the thing is used again (the server lets it through)
        this.greymarchClickGuardTick(); // the click that closed a window is not a swing
        this.greymarchMagicBlockDrive(); // NPC raise-the-dead and summons: ended at once
        this.greymarchShapeDrive(); // a creature form as an NPC: moved every frame like SkyMP moves other players; other players' creature attacks
        this.greymarchShapeTick(); // a creature form staff put the player in (a goat, a giant ...): the server decides, the body is changed here
        this.greymarchRaceMenuTick(Date.now()); // RaceMenu's extra sliders: sent when the race menu closes, put back after a relog (racemenuLook.ts)
        this.greymarchWolfTick(); // the werewolf form: the game's Beast Form power is the trigger, the server decides, the change is done here
        this.greymarchSpellCostTick(); // the Spells balance tab's costs on the spell records (GreymarchCamera.dll 1.5)
        this.greymarchSpellEditTick(); // the Magic balance tab's durations and strengths on the spell records
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
                    // IRON ARMOR STILL SHOWING (2026-10-28, the owner: new characters spawn in iron armor and must change race to lose it). The reset takes the game's default gear
                    // out of the inventory (the log shows only the starting kit), but the body's 3D was never redrawn, so the iron stayed on screen; changing race rebuilds
                    // the body, which is why that cleared it. After each reset, once the clothes are on, it is redrawn, and again a second later. In the race menu too
                    // (2026-10-28, the owner's second log: the redraw waited for the menu to close, and the menu's preview kept the iron while they built the character;
                    // the menu redraws the body at every slider, so a redraw there is what it does itself)
                    if (eq.redrawAt && eq.redrawAt.length && eq.ids.length === 0) {
                        for (var rd = eq.redrawAt.length - 1; rd >= 0; rd--) {
                            if (eq.redrawAt[rd] > now) continue;
                            eq.redrawAt.splice(rd, 1);
                            try { if (player.is3DLoaded()) { player.queueNiNodeUpdate(); this.greymarchLog("body redrawn after reset #" + eq.resets + (raceMenuOpen ? " (race menu open)" : "")); } } catch (rErr) { this.greymarchLog("could not redraw the body: " + rErr); }
                        }
                    }
                    // the race menu has just opened: the default armor can come back with it, so take it off again and re-dress
                    // the race menu has just opened: the game's default gear (iron armor) can come with it, so it is REMOVED (the full reset: only the starting kit stays), before the player builds the character
                    if (raceMenuOpen && !eq.menuOpened) { eq.menuOpened = true; this.greymarchReset(eq, player, "race menu opened"); }
                    if (!raceMenuOpen && eq.menuOpened && !eq.menuClosed) { eq.menuClosed = true; eq.pending.push(now + 600, now + 3000, now + 8000); this.greymarchLog("race menu closed: clean-ups scheduled"); }
                    if (eq.menuClosed && eq.pending.length === 0 && eq.ids.length === 0 && !(eq.redrawAt && eq.redrawAt.length)) this.greymarchEquip = null;
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
        if (changed && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || hud || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); if (!this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.sp.browser.setFocused(false); } catch (err) { /* nothing to do */ } }
    }
    greymarchBrowserMessage(e: any): any {
        if (!e.arguments || e.arguments[0] !== "greymarch") return;
        var data;
        try { data = JSON.parse(e.arguments[1]); } catch (err) { return; }
        if (data && data.type === "voice") { this.greymarchVoiceMessage(data); return; } // from the voice display: is it on, and who is talking
        if (data && data.type === "release") { this.greymarchLift("the screen released it"); return; } // the screen's own safety timer
        if (data && data.type === "admin") { this.greymarchAdminSend(data); return; } // the staff panel asks the server for something (the SERVER decides if it is allowed)
        if (data && data.type === "admin-close") { this.greymarchAdminHide(); return; }
        if (data && data.type === "build-cam") { this.greymarchBuildCamWanted = { mode: data.mode, key: data.key, name: data.name, id: data.id, at: Date.now() }; this.greymarchAdminHide(); return; } // the Build tab: place or move a piece with the free camera (greymarchBuildCamTick)
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
        if (data && data.type === "minigame-shown") { this.greymarchMiniSend("greymarchMinigameShown", { token: data.token }); return; } // the mini game window is up
        if (data && data.type === "minigame-result") { this.greymarchMiniSend("greymarchMinigameResult", { token: data.token, ok: data.ok === true }); if (this.greymarchMiniKeep) { this.greymarchMiniKeptAt = Date.now(); return; } this.greymarchMiniHide(); return; } // keep: the window waits for the server's word (greymarchMiniDone)
        if (data && data.type === "craft") { this.greymarchCraftAsk(data); return; } // the crafting panel asks the server (the SERVER decides and makes the item)
        if (data && data.type === "craft-close") { this.greymarchCraftHide(); return; }
        if (data && data.type === "forge") { this.greymarchForgeAsk(data); return; } // the forge window asks the server (the SERVER decides and makes the item)
        if (data && data.type === "forge-close") { this.greymarchForgeHide(); return; }
        if (data && data.type === "forge-turn") { this.greymarchForgeTurn(data); return; } // a drag, the wheel or a double-click over the display: the smith examines the piece
        if (data && data.type === "forge-preview") { if (this.greymarchForgeOn) this.greymarchForgePreviewWant = (this.greymarchForgeStation === "smelter" || this.greymarchForgeStation === "kiln") ? "" : String(data.key || "").slice(0, 80); return; } // never at the smelter or the charcoal kiln (2026-10-26, the owner) // the piece picked in the forge window: shown in front of the smith (greymarchForgePreviewTick); only while the window is open
        if (data && data.type === "vampire") { this.greymarchVampMenuAsk(data); return; } // the vampire window asks the server (the SERVER decides)
        if (data && data.type === "vampire-close") { this.greymarchVampMenuHide(); return; }
        if (data && data.type === "ledger") { this.greymarchLedgerAsk(data); return; } // the guard ledger asks the server (the SERVER decides)
        if (data && data.type === "ledger-close") { this.greymarchLedgerHide(); return; }
        if (data && data.type === "scribe") { this.greymarchScribeAsk(data); return; } // the scribe's desk asks the server (the SERVER decides)
        if (data && data.type === "scribe-close") { this.greymarchScribeHide(); return; }
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
        this.greymarchAdminToPage("show", mode === "tester" || mode === "dungeons" || mode === "encounters" || mode === "build" ? mode : true);
    }
    greymarchAdminHide(): any {
        if (this.greymarchAdminOn) this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchAdminOn = false;
        this.greymarchAdminToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); }
    }
    greymarchAdminSend(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchAdmin", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // F7, H, B and F6 are for STAFF. Unless the server already said yes, the game asks it first ({ op: "check" }) and opens the panel only on a yes,
    // so a player with no rank sees nothing at all. The yes is remembered; a later refusal marked staffOnly (rank taken away, off duty) forgets it and
    // closes the panel. The server refuses a player with no rank everything anyway (gamemode admin.js), whatever this game does.
    greymarchStaffOpen(mode?: any): any {
        if (this.greymarchStaffOk) { this.greymarchAdminShow(mode); return; }
        var rid = 1100000000 + (this.greymarchStaffRidN = (this.greymarchStaffRidN || 0) + 1);
        this.greymarchStaffAsk = { rid: rid, mode: mode, at: Date.now() };
        this.greymarchAdminSend({ rid: rid, op: "check", args: {} });
    }
    // a staff panel reply: true when it was the answer to greymarchStaffOpen's question (nothing else to do with it)
    greymarchStaffReply(msg: any): boolean {
        var ask = this.greymarchStaffAsk;
        if (ask && msg.rid === ask.rid) {
            this.greymarchStaffAsk = null;
            this.greymarchStaffOk = msg.ok === true;
            if (!this.greymarchStaffOk) { this.greymarchLog("staff panel: not opened, the server says no (" + msg.error + ")"); return true; }
            if (Date.now() - ask.at < 5000 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchAdminShow(ask.mode); }
            return true;
        }
        if (msg.staffOnly === true) {
            this.greymarchStaffOk = false;
            if (this.greymarchAdminOn) { this.greymarchAdminHide(); var nq = this.greymarchNoticeQueue || (this.greymarchNoticeQueue = []); if (nq.length < 20) nq.push(String(msg.error || "The staff panel is for staff only.").slice(0, 300)); }
            this.greymarchLog("staff panel: closed, the server says staff only (" + msg.error + ")");
        }
        return false;
    }
    // F7 opens the panel (the page itself closes it with F7 or Escape). Escape also closes it from here, because the game un-focuses the browser on Escape.
    greymarchKey(e: any): any {
        if (this.greymarchBuildCam && this.greymarchBuildCamKey(e)) return; // the build system's free camera has the keys it uses
        if (this.greymarchEmoteNow && this.greymarchEmoteNow.kind === "loop" && !this.greymarchEmoteNow.meal && (e.code === 17 || e.code === 30 || e.code === 31 || e.code === 32 || e.code === 57)) { var mvDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (mvDown && e.isUp !== true) this.greymarchEmoteStopWanted = Date.now(); } // W A S D or Space ends an emote that lasts (greymarchEmoteTick)
        if (e.code === 19) { var rDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) rDown = false; if (rDown && !this.greymarchKey19 && this.greymarchWolfOn && !this.greymarchChatTyping) this.greymarchWolfRoarAt = Date.now(); this.greymarchKey19 = rDown; return; } // R: the werewolf roars (greymarchWolfTick; only while changed)
        if (e.code === 44) { var zDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) zDown = false; if (zDown && !this.greymarchKey44 && !this.greymarchChatTyping) { if (this.greymarchWolfOn) this.greymarchWolfBackAt = Date.now(); else this.greymarchWolfKeyAt = Date.now(); } this.greymarchKey44 = zDown; return; } // Z while changed: ask the server to change back (greymarchWolfTick)
        if (e.code === 256 || e.code === 257) { var mDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) mDown = false; if (mDown && !this["greymarchKey" + e.code]) this.greymarchShapeButton(e.code === 257); this["greymarchKey" + e.code] = mDown; return; } // mouse buttons: a creature's attacks (greymarchShapeTick)
        if (e.code !== 65 && e.code !== 66 && e.code !== 64 && e.code !== 35 && e.code !== 48 && e.code !== 1 && e.code !== 45 && e.code !== 28 && e.code !== 37 && e.code !== 34 && e.code !== 59) return;
        var down = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true);
        if (e.isUp === true) down = false;
        if (e.code === 1 && down && this.greymarchChatTyping) { this.greymarchChatClose(); return; } // Esc cancels whenever the input is open (the messages stay on screen), whatever the key-up history says
        if (e.code === 28) { if (down && e.isRepeating !== true) { this.greymarchChatWanted = Date.now(); if (!this.greymarchEnterSeen) { this.greymarchEnterSeen = true; this.greymarchLog("chat: the first Enter press reached the game"); } } return; } // Enter: the chat is opened from the update phase (greymarchChatPending), where the game's menus can be asked about; a held key does not repeat it and a missed key-up can never swallow the next press
        var was = this["greymarchKey" + e.code];
        this["greymarchKey" + e.code] = down;
        if (e.code === 45 && !down && was) { this.greymarchMenuRelease(); return; } // X let go
        if (e.code === 34 && !down && was) { if (this.greymarchEmoteOn) this.greymarchEmoteToPage("release", true); else if (this.greymarchEmoteWanted) this.greymarchEmoteTapped = true; return; } // G let go: the wheel plays what the pointer is on (a quick tap leaves it open)
        // F7, H, B, F6, F8 and K open a window that takes the keyboard: opened when the key is LET GO, not when it goes down. Taken on the press, the page never
        // saw the key go up, so the browser held it down and repeated the letter into the chat line or a search box until another key was pressed.
        if (OPEN_ON_RELEASE.indexOf(e.code) >= 0) {
            if (down && !was) { this.greymarchHotkeyHeld = { code: e.code, at: Date.now() }; return; }
            if (!down && was && this.greymarchHotkeyHeld && this.greymarchHotkeyHeld.code === e.code) { this.greymarchHotkeyHeld = null; this.greymarchHotkeyOpen(e.code); }
            return;
        }
        if (!down || was) return;
        if (e.code === 59) { if (!this.greymarchChatTyping) this.greymarchHudToPage("logoToggle", true); return; } // F1: the Greymarch logo top right hides and shows (greymarch-hud.html; 2026-10-31, the owner)
        if (e.code === 34 && !this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.greymarchEmoteWanted = Date.now(); // G: the emote wheel, opened from the update phase (greymarchEmoteTick), where the game's menus can be asked about
        else if (e.code === 1 && this.greymarchEmoteOn) this.greymarchEmoteHide();
        else if (e.code === 45 && !this.greymarchMenuOn && !this.greymarchAdminOn && !this.greymarchChatTyping && !this.greymarchEmoteOn) this.greymarchMenuHold(); // X held while looking at a player
        else if (e.code === 1 && this.greymarchMenuOn) this.greymarchMenuEscape();
        else if (e.code === 1 && this.greymarchProfOn) this.greymarchProfHide();
        else if (e.code === 1 && this.greymarchChanceryOn) this.greymarchChanceryHide();
        else if (e.code === 1 && this.greymarchVampMenuOn) this.greymarchVampMenuHide();
        else if (e.code === 1 && this.greymarchLedgerOn) this.greymarchLedgerHide();
        else if (e.code === 1 && this.greymarchScribeOn) this.greymarchScribeHide();
        else if (e.code === 1 && this.greymarchMiniOn) this.greymarchMiniToPage("escape", true); // Esc gives the mini game up (the page sends the loss)
        else if (e.code === 1 && this.greymarchCraftOn) this.greymarchCraftHide();
        else if (e.code === 1 && this.greymarchForgeOn) this.greymarchForgeHide();
        else if (e.code === 1 && this.greymarchAdminOn) this.greymarchAdminHide();
    }
    // a window hotkey let go (greymarchKey): what it opens, checked now (the state may have changed while it was held)
    greymarchHotkeyOpen(code: number): any {
        if (code === 65 && !this.greymarchAdminOn && !this.greymarchMenuOn) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchStaffOpen(); } // F7: staff only (greymarchStaffOpen asks the server first)
        else if (code === 35 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.greymarchStaffKeyWanted = { at: Date.now(), mode: "encounters", key: "H" }; // H: the staff panel straight on its Encounters tab (GM and up; staff below GM see the page close again at once; the page closes it with H)
        else if (code === 48 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping && !this.greymarchPanelHasKeys()) this.greymarchStaffKeyWanted = { at: Date.now(), mode: "build", key: "B" }; // B: the staff panel straight on its Build tab (GM and up; staff below GM see the page close again at once)
        else if (code === 64 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchStaffOpen("dungeons"); } // F6: the staff panel straight on its Dungeons tab (GM and up; the server checks the "dungeons" command, the page closes it with F6)
        else if (code === 66 && !this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchChatTyping) { if (this.greymarchEmoteOn) this.greymarchEmoteHide(); this.greymarchStaffOpen("tester"); } // F8: the same panel as the tester menu (teleports, items, NPCs; the server gives testers those commands on the test server only); asks the server first like F7, so a player sees nothing
        else if (code === 37 && !this.greymarchChatTyping && !this.greymarchEmoteOn && !(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)) this.greymarchProfWanted = Date.now(); // K opens the professions window from the update phase (greymarchProfPending), where the game's menus can be asked about (the page itself closes it with K or Esc, like the staff panel with F7)
    }
    // a missed key-up (the game did not send it): once the key reads as up, the hotkey opens anyway (every frame, from greymarchTick)
    greymarchHotkeyTick(now: number): any {
        var held = this.greymarchHotkeyHeld;
        if (!held || now - held.at < 100) return;
        var up = false;
        try { up = !(this.sp as any).Input.isKeyPressed(held.code); } catch (e) { up = now - held.at > 400; } // no way to ask: as a quick tap
        if (!up) return;
        this.greymarchHotkeyHeld = null; this["greymarchKey" + held.code] = false;
        this.greymarchHotkeyOpen(held.code);
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
                    // the howl is the werewolf's voice: after one, the game keeps the voice recovering and drops the next HowlStart (the roar played once, then only
                    // its sound, 2026-10-23). Roars have no wait here (WOLF_ROAR_MS), so the recovery is cleared first.
                    var gmVoiceWas = -1; try { gmVoiceWas = player.getVoiceRecoveryTime(); player.setVoiceRecoveryTime(0); } catch (vErr) { /* the howl as before */ }
                    if ((this.greymarchRoarLogged = (this.greymarchRoarLogged || 0) + 1) <= 10) this.greymarchLog("wolf: roar: the voice was recovering for " + (Math.round(gmVoiceWas * 10) / 10) + " s (cleared)");
                    this.greymarchCrumb("beast: howl"); sp.Debug.sendAnimationEvent(player, "HowlStart"); this.greymarchWolfRoarRelease = now + 200; // released at once: a short howl, as a quick tap of the shout key does it
                    if (this.greymarchWolfBearRace) { this.greymarchWolfRoarSound(player, true); this.greymarchLog("wolf: roar (R, the werebear's howl and roar)"); }
                    else this.greymarchLog("wolf: roar (R, the howl)");
                    // reported: the server sends it to every player near enough to hear it (werewolf.js howl; it keeps the same wait)
                    var howlMsg = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchWolf", op: "howl" }) };
                    this.controller.emitter.emit("sendMessage", { message: howlMsg, reliability: "reliable" });
                }
            }
            // DIAGNOSTIC (2026-10-23, other players saw a werewolf slide instead of walk): every 2 s, at most 40 times, what this werewolf body reports; SkyMP's
            // movement (movementGet.ts) takes the run mode from SpeedSampled and isSprinting/isRunning
            if (this.greymarchWolfOn && !this.greymarchWolfMorph && now >= (this.greymarchWalkDiagNext || 0) && (this.greymarchWalkDiagLeft === undefined ? (this.greymarchWalkDiagLeft = 40) : this.greymarchWalkDiagLeft) > 0) {
                this.greymarchWalkDiagNext = now + 2000; this.greymarchWalkDiagLeft--;
                try { this.greymarchLog("wolf walk (mine): SpeedSampled " + Math.round(player.getAnimationVariableFloat("SpeedSampled")) + ", Speed " + Math.round(player.getAnimationVariableFloat("Speed")) + ", Direction " + (Math.round(player.getAnimationVariableFloat("Direction") * 100) / 100) + ", sprinting " + player.isSprinting() + ", running " + player.isRunning() + ", weapon drawn " + player.isWeaponDrawn() + ", animation driven " + player.getAnimationVariableBool("bAnimationDriven")); } catch (dErr) { /* diagnostics only */ }
            }
            var otherRel = this.greymarchWolfOtherRelease;
            if (otherRel) for (var orl in otherRel) { if (now >= otherRel[orl]) { delete otherRel[orl]; try { var oa = sp.Actor.from(sp.Game.getFormEx(Number(orl))); if (oa) sp.Debug.sendAnimationEvent(oa, "HowlRelease"); } catch (oErr) { /* gone */ } } }
            if (this.greymarchWolfRoarRelease && now >= this.greymarchWolfRoarRelease) { this.greymarchWolfRoarRelease = 0; if (this.greymarchWolfOn) sp.Debug.sendAnimationEvent(player, "HowlRelease"); }
            // other players' roars: the sound on their NPC here (never an animation)
            var roars = this.greymarchWolfRoarQueue;
            if (roars && roars.length) {
                this.greymarchWolfRoarQueue = [];
                for (var ri = 0; ri < roars.length && ri < 8; ri++) {
                    try { var rl = misc.remoteIdToLocalId(roars[ri].actor); var who = rl ? sp.ObjectReference.from(sp.Game.getFormEx(rl)) : null; if (who) { this.greymarchWolfRoarSound(who, roars[ri].bear); this.greymarchWolfHowlOther(rl, now); } } catch (rErr) { /* not drawn here: not heard */ }
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
            this.greymarchWolfHowlOn(player);
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
            this.greymarchWolfHowlOff(player);
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
    // Other players in one of the forms (GM_WOLF_FORMS: an Alpha, a pup, a Frost Wolf, a Rabid Wolf, a Moonborn, an Elder Alpha, a Silvermane Alpha, a black or polar bear): SkyMP draws them with the race of their appearance, which the server can only set to the normal werewolf. Every second the
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
    greymarchVampSpellOf(desc: string): any { // "8d5bf:Skyrim.esm" -> that Spell in this game (null when the plugin or the record is not there)
        // looked up fresh every time: a game object kept from an earlier frame is refused by the game ("Invalid _skyrimPlatform_indexInPool", 2026-10-25)
        var at = desc.indexOf(":"), id = parseInt(desc.slice(0, at), 16), file = desc.slice(at + 1);
        try { var fm = at > 0 && id > 0 ? this.sp.Game.getFormFromFile(id, file) : null; return fm ? this.sp.Spell.from(fm) : null; } catch (e) { return null; }
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
    // a spell the player cast: the server heals for the healing ones once it has seen the magicka spent (gamemode healing.js)
    greymarchCastSend(spell: number): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchCast", spell: spell >>> 0 }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // The costs the F7 Spells balance tab set (greymarchSpellCosts { costs: { "<hex id>:<plugin>": magicka a cast, or a second for a concentration spell } }) go on
    // the spell records in this game through GreymarchCamera.dll (GreymarchCam.SetSpellCost: the record's cost override), so the game charges that number itself and
    // the Magic menu shows it. Each is told back (greymarchSpellCost { spell, cost }) and the server stops correcting that spell's cost for this player; a record
    // this set that the server no longer names gets its own cost back (cost null told). An older DLL: the call fails, nothing is told, the server keeps correcting.
    // Told again after every costs packet (sent when the player joins and when a cost changes). Looked at every half second.
    greymarchSpellCostTick(): any {
        var now = Date.now();
        if (now < (this.greymarchSpellCostNext || 0)) return;
        this.greymarchSpellCostNext = now + 500;
        var sp = this.sp;
        var want: any = this.greymarchSpellCostWant || {};
        var mine = this.greymarchSpellCostMine || (this.greymarchSpellCostMine = {});
        var told = this.greymarchSpellCostTold || (this.greymarchSpellCostTold = {});
        var send = (spell: string, cost: any) => { var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchSpellCost", spell: spell, cost: cost }) }; this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" }); };
        for (var d in want) {
            var c = Math.round(Number(want[d]));
            if (!(c >= 0) || told[d] === c) continue;
            told[d] = c;
            var spell = this.greymarchVampSpellOf(d);
            if (!spell) continue;
            var got = -1;
            try { got = Number(sp.callNative("GreymarchCam", "SetSpellCost", undefined, spell, c)); } catch (e) { got = -1; if (!this.greymarchSpellCostNoDll) { this.greymarchSpellCostNoDll = true; this.greymarchLog("spell costs: cannot go on the spells (GreymarchCamera.dll 1.5 missing): " + e); } }
            if (got === c) { mine[d] = true; send(d, c); }
        }
        for (var k in mine) {
            if (k in want) continue;
            delete mine[k]; delete told[k];
            var back = this.greymarchVampSpellOf(k);
            try { if (back) sp.callNative("GreymarchCam", "SetSpellCost", undefined, back, -1); } catch (e2) { /* no plugin */ }
            send(k, null);
        }
    }
    // The durations and strengths the F7 Magic balance tab set (greymarchSpellEdits { edits: { "<hex id>:<plugin>": { dur: seconds, pct: percent } } }, either may be
    // missing) go on the spell records in this game (SKSE's Spell.setNthEffectDuration / setNthEffectMagnitude): every effect that lasts is scaled so the longest
    // lasts the seconds set (the others keep their share), and every effect's magnitude is the percent set of the record's own. The record's own numbers are kept
    // the first time it is changed and put back when the server no longer sets that part (an empty packet puts every one back). Told again after every edits
    // packet (sent when the player joins and when one changes). Looked at every half second. Only for this game: everyone's game gets the same packet.
    greymarchSpellEditTick(): any {
        var now = Date.now();
        if (now < (this.greymarchSpellEditNext || 0)) return;
        this.greymarchSpellEditNext = now + 500;
        var want: any = this.greymarchSpellEditWant || {};
        var orig = this.greymarchSpellEditOrig || (this.greymarchSpellEditOrig = {});
        var told = this.greymarchSpellEditTold || (this.greymarchSpellEditTold = {});
        var keys: any = {};
        for (var k1 in want) keys[k1] = true;
        for (var k2 in orig) keys[k2] = true;
        for (var d in keys) {
            var w = want[d] && typeof want[d] === "object" ? want[d] : {};
            var wd = Number(w.dur), wp = Number(w.pct);
            var hasDur = w.dur !== null && w.dur !== undefined && wd >= 0, hasMag = w.pct !== null && w.pct !== undefined && wp >= 0;
            var sig = (hasDur ? wd : "-") + "|" + (hasMag ? wp : "-");
            if (told[d] === sig) continue;
            told[d] = sig;
            var spell = this.greymarchVampSpellOf(d);
            if (!spell) continue;
            try {
                var o = orig[d];
                if (!o) {
                    if (!hasDur && !hasMag) continue; // never changed here: nothing to put back
                    o = { dur: [], mag: [] };
                    var n = Number(spell.getNumEffects()) || 0;
                    for (var i = 0; i < n; i++) { o.dur.push(Number(spell.getNthEffectDuration(i)) || 0); o.mag.push(Number(spell.getNthEffectMagnitude(i)) || 0); }
                    orig[d] = o;
                }
                var maxDur = 0;
                for (var j = 0; j < o.dur.length; j++) maxDur = Math.max(maxDur, o.dur[j]);
                for (var e = 0; e < o.dur.length; e++) {
                    var dd = hasDur && maxDur > 0 && o.dur[e] > 0 ? Math.max(1, Math.round(o.dur[e] * wd / maxDur)) : o.dur[e];
                    var mm = hasMag ? Math.round(o.mag[e] * wp) / 100 : o.mag[e];
                    spell.setNthEffectDuration(e, dd);
                    spell.setNthEffectMagnitude(e, mm);
                }
                if (!hasDur && !hasMag) { delete orig[d]; delete told[d]; } // its own numbers are back
            } catch (err) {
                if (!this.greymarchSpellEditFailed) { this.greymarchSpellEditFailed = true; this.greymarchLog("spell edits: could not change " + d + ": " + err); }
            }
        }
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
        // the powers the server names (want.spells, "<hex id>:<plugin>"). The server teaches them with Actor.AddSpell, which did not always reach this game's Magic menu
        // (a vampire had none of them, 2026-10-25, though the server's log said each was given). Every 2 seconds a listed power the game is missing is added, and one this
        // added that the server no longer names is taken away again (Mist Form while it cools down, the Lord's own outside that shape). The server still decides every use.
        if (now >= (this.greymarchVampSpellNext || 0)) {
            this.greymarchVampSpellNext = now + 2000;
            var listed: string[] = want && Array.isArray(want.spells) ? want.spells : [];
            var mine = this.greymarchVampSpellMine || (this.greymarchVampSpellMine = {});
            var keep: any = {};
            for (var si = 0; si < listed.length; si++) {
                var d = String(listed[si]); keep[d] = true;
                var sw = this.greymarchVampSpellOf(d);
                if (!sw) continue;
                try {
                    if (!player.hasSpell(sw)) { player.addSpell(sw, false); mine[d] = true; this.greymarchLog("vampire: the power " + d + " was missing from this game: added"); }
                } catch (addErr) { var bad = this.greymarchVampSpellBad || (this.greymarchVampSpellBad = {}); if (!bad[d]) { bad[d] = true; this.greymarchLog("vampire: the power " + d + " could not be added: " + addErr); } } // said once
            }
            for (var dk in mine) {
                if (keep[dk]) continue;
                delete mine[dk];
                var sg = this.greymarchVampSpellOf(dk);
                try { if (sg && player.hasSpell(sg)) player.removeSpell(sg); } catch (rmErr) { /* gone already */ }
                this.greymarchLog("vampire: the power " + dk + " taken away again (the server no longer names it)");
            }
        }
        // the drain costs the server names (want.costs, { "<hex id>:<plugin>": magicka a second, or a cast for the Lord's drain }: F7's Vampires tab) go on the spell
        // records in this game through GreymarchCamera.dll (GreymarchCam.SetSpellCost: the record's cost override), so the game charges that number itself and the
        // magicka bar no longer jumps. Each is told back to the server (greymarchVamp op "cost"), which then stops correcting that drain's magicka; a record this set
        // that the server no longer names gets its own cost back. An older DLL: the call fails, nothing is told, and the server keeps correcting (its fallback).
        // Told again after every state packet, so a reconnect or a new cost is reported.
        var costs: any = want && want.costs && typeof want.costs === "object" ? want.costs : {};
        var costMine = this.greymarchVampCostMine || (this.greymarchVampCostMine = {});
        var told = this.greymarchVampCostTold || (this.greymarchVampCostTold = {});
        for (var cd in costs) {
            var cw = Math.round(Number(costs[cd]));
            if (!(cw >= 0) || told[cd] === cw) continue;
            told[cd] = cw;
            var cs = this.greymarchVampSpellOf(cd);
            if (!cs) continue;
            var got = -1;
            try { got = Number(sp.callNative("GreymarchCam", "SetSpellCost", undefined, cs, cw)); } catch (cErr) { got = -1; if (!this.greymarchVampCostNoDll) { this.greymarchVampCostNoDll = true; this.greymarchLog("vampire: the drain cost cannot go on the spell (GreymarchCamera.dll 1.5 missing): " + cErr); } }
            if (got === cw) { costMine[cd] = true; this.greymarchLog("vampire: the drain " + cd + " costs " + cw); this.greymarchVampSend({ op: "cost", spell: cd, cost: cw }); }
        }
        for (var ck in costMine) {
            if (ck in costs) continue;
            delete costMine[ck]; delete told[ck];
            var cr = this.greymarchVampSpellOf(ck);
            try { if (cr) sp.callNative("GreymarchCam", "SetSpellCost", undefined, cr, -1); } catch (rErr) { /* no plugin */ }
            this.greymarchLog("vampire: the drain " + ck + " back to its own cost");
            this.greymarchVampSend({ op: "cost", spell: ck, cost: null });
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
                this.greymarchVampFeedWant = null; this.greymarchVampFeedHold = null;
                try { sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); } catch (e1) { /* it ends by itself */ }
                var was = this.greymarchVampFeedOther; this.greymarchVampFeedOther = null;
                if (was) { try { sp.Debug.sendAnimationEvent(was, "IdleForceDefaultState"); } catch (e2) { /* gone */ } }
            } else {
                // held until the server says off: the animation is played again whenever it ran out, and the vampire's own movement key asks the server to end it
                this.greymarchVampFeedHold = { role: fd.role, partner: fd.partner, playedAt: 0, keysUp: {}, asked: false };
                if (!other) this.greymarchLog("vampire: the feeding partner is not loaded here");
                else { this.greymarchVampFeedOther = other; this.greymarchVampFeedPlay(player, other, now, true); }
            }
        }
        this.greymarchVampFeedHeld(player, now);
        this.greymarchVampFangsWear(now); // the worn fangs the server gave: put on (SkyMP then shows them to everyone)
        this.greymarchVampEyes(now); // every vampire's blue eyes, on this screen
    }
    // THE HELD FEEDING (2026-10-30, the owner): the server keeps the scene on until the vampire stops it and drains the victim meanwhile; the game's standing feed
    // is one paired animation of a few seconds, so it is played again each time it has run out (bIsSynced is the game's flag for a paired animation still
    // playing; at least FEED_REPLAY_MS apart, so a game that never sets it is not restarted mid-bite). On the vampire's game a movement key pressed during the
    // scene (it has to be seen up first: the one they walked up with does not count) sends { op: "feed_end" }; the server ends it for both.
    greymarchVampFeedPlay(player: any, other: any, now: number, first: boolean): any {
        var sp = this.sp, h = this.greymarchVampFeedHold; if (!h) return;
        var biter = h.role === "vampire" ? player : other, bitten = h.role === "vampire" ? other : player;
        // TEST 2026-10-30 (the owner: it stopped at the usual time): the replay 6 s in was refused (the bite was still finishing) and the next try was 6 s later, so
        // the vampire stood up. A refusal is now tried again after FEED_RETRY_MS, and after FEED_RESET_AFTER refusals the biter is reset to the default pose first.
        if ((h.refused || 0) >= FEED_RESET_AFTER) { try { sp.Debug.sendAnimationEvent(biter, "IdleForceDefaultState"); } catch (rErr) { /* tried anyway */ } }
        var played = false;
        try { var idle = sp.Idle.from(sp.Game.getFormEx(this.greymarchVampForm("feedIdle"))); played = !!idle && !!biter.playIdleWithTarget(idle, bitten); } catch (pErr) { played = false; }
        if (played) {
            if (first || h.refused) this.greymarchLog("vampire: feeding (" + h.role + "), the animation " + (first ? "plays" : "plays again after " + h.refused + " refusal(s)"));
            h.playedAt = now; h.refused = 0;
        } else {
            h.refused = (h.refused || 0) + 1;
            if (h.refused === 1 || h.refused === FEED_RESET_AFTER) this.greymarchLog("vampire: feeding (" + h.role + "), the animation " + (first ? "" : "again ") + "was refused by the game" + (h.refused === FEED_RESET_AFTER ? " " + FEED_RESET_AFTER + " times: resetting the pose" : ""));
            h.playedAt = now - FEED_REPLAY_MS + FEED_RETRY_MS; // soon again
        }
    }
    greymarchVampFeedHeld(player: any, now: number): any {
        var sp = this.sp, h = this.greymarchVampFeedHold; if (!h) return;
        var other: any = this.greymarchVampFeedOther;
        if (!other) { // not loaded when it began: try again
            try { var lid = misc.remoteIdToLocalId(h.partner); other = lid ? sp.Actor.from(sp.Game.getFormEx(lid)) : null; } catch (oErr) { other = null; }
            if (other) { this.greymarchVampFeedOther = other; this.greymarchVampFeedPlay(player, other, now, true); }
        } else if (now - h.playedAt >= FEED_REPLAY_MS) {
            var biter = h.role === "vampire" ? player : other, synced = false;
            try { synced = !!biter.getAnimationVariableBool("bIsSynced"); } catch (sErr) { synced = false; }
            if (!synced || h.refused) this.greymarchVampFeedPlay(player, other, now, false); // after a refusal the flag is no reason to wait
        }
        if (h.role !== "vampire" || h.asked) return;
        var input = sp.Input; if (!input || typeof input.isKeyPressed !== "function") return;
        try { if (sp.browser && sp.browser.isFocused && sp.browser.isFocused()) return; } catch (fErr) { /* no browser: keys count */ } // typing in a window is not walking away
        for (var i = 0; i < FEED_STOP_KEYS.length; i++) {
            var k = FEED_STOP_KEYS[i], down = false;
            try { down = !!input.isKeyPressed(k); } catch (kErr) { down = false; }
            if (!down) { h.keysUp[k] = true; continue; }
            if (h.keysUp[k]) { h.asked = true; this.greymarchLog("vampire: a movement key ends the feeding"); this.greymarchVampSend({ op: "feed_end" }); return; }
        }
    }
    // Every vampire in the world (the player included) gets their bloodline's eye part for their glow and, while their fangs show, the fanged teeth, by the server's
    // list (greymarchVampLooks). Only those parts change: the character is not redrawn. Their OWN eyes and teeth are kept and put back while /eyes or /fangs hides
    // them (glow 0) and when they are no longer a vampire. Greymarch's own eye parts never count as "their own" (a reload or a colour change finds one already on).
    // Checked again every 2 seconds, because SkyMP puts a character's saved look back now and then (a load, a redraw): that look is their own eyes, kept again.
    // ANOTHER PLAYER'S EYES (2026-10-30, the owner: the eyes still popped out of the head with /eyes after the redraw of 2026-10-29): a part swapped on their
    // character with ChangeHeadPart is never shaped to their face (SkyMP shapes the head when it builds the character), so it sat at the plain spot, out of the
    // face. Their eyes are no longer swapped here: __gmVampEyes (server actor id -> the eye part's form id, none = their own eyes) tells formView.ts, which
    // builds their character with those eyes in their look, shaped like any part, and builds it again when that changes. Only the player's own head is swapped.
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
        var others: any = {}; // server actor id -> the eye part their character is built with (formView.ts, __gmVampEyes)
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
                if (localId !== 0x14) { // another player: built with the eyes (formView.ts); glow 0 is their own look as it is
                    if (glow > 0) others[v.actor] = hp.getFormID();
                    if (rec.key !== key) { this.greymarchLog("vampire: " + localId.toString(16) + (glow === 0 ? " is built with their own eyes (/eyes)" : " is built with " + colour + " eyes, glow " + glow)); rec.key = key; }
                } else if (!(rec.key === key && cur && cur.getFormID() === wantEyes.getFormID())) {
                    actor.changeHeadPart(wantEyes); // the player's own head: the game shapes it
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
        try { (Function("return this")() as any).__gmVampEyes = others; } catch (gErr) { /* their own eyes */ }
        for (var k in done) {
            if (seen[k]) continue;
            var back = done[k]; delete done[k];
            try {
                var a2 = Number(k) === 0x14 ? sp.Game.getPlayer() : sp.Actor.from(sp.Game.getFormEx(Number(k)));
                var orig = back.orig ? sp.HeadPart.from(sp.Game.getFormEx(back.orig)) : null;
                if (a2 && orig && Number(k) === 0x14) { a2.changeHeadPart(orig); this.greymarchLog("vampire: " + Number(k).toString(16) + " has their own eyes back"); } // another player: built from their own look again (no __gmVampEyes)
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
    // THE WORN FANGS. The server gives a vampire "Vampire Fangs" and asks for them on while their fangs show and off while /fangs hides them (vampire.js fangsWorn).
    // The game puts them on here (kept on: they cannot be taken off by hand) ONLY while the server's look of this player says the fangs show (greymarchVampLooks),
    // and takes them off while it says hidden: putting them on whenever they were in the inventory undid /fangs at once. SkyMP sends what the player wears to every
    // other game, which shows the fangs like any gear. Once a second; nothing is done when the player does not have them.
    greymarchVampFangsWear(now: number): any {
        if (now < (this.greymarchVampFangsNext || 0)) return;
        this.greymarchVampFangsNext = now + 1000;
        try {
            var sp = this.sp, player = sp.Game.getPlayer();
            var f = sp.Game.getFormFromFile(VAMP_FANG_ITEM, "Dragonborn.esm");
            if (!player || !f || player.getItemCount(f) <= 0) return;
            var me = this.greymarchMeActor, list = this.greymarchVampLookList || [], mine = null;
            for (var i = 0; i < list.length; i++) if (me && list[i].actor === me) mine = list[i];
            var show = !!mine && !!mine.fangs, on = !!player.isEquipped(f);
            if (show && !on) { player.equipItem(f, true, true); if (!this.greymarchVampFangsSaid) { this.greymarchVampFangsSaid = true; this.greymarchLog("vampire: the worn fangs put on"); } } // preventRemoval, silent
            else if (!show && on) player.unequipItem(f, false, true); // /fangs hides them (or no look of this player yet): off
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
    // RaceMenu's extra sliders (racemenuLook.ts). A second after the race menu closes, this game exports RaceMenu's preset and sends the RaceMenu-only parts.
    // The server sends this character's kept parts when it enters the world; 4 seconds after the player's 3D is there (SkyMP has applied the vanilla look
    // by then) the look the player has now is exported, the kept parts put in and the result loaded. Nothing is loaded when the parts already match,
    // and nothing while the race menu is open or the body is the werewolf or a creature (done again after changing back).
    greymarchRmState(): any {
        return this.greymarchRm || (this.greymarchRm = { menuWas: false, sendAt: 0, want: null, done: null, loadedSince: 0, next: 0, tries: 0, beast: false, said: {} });
    }
    greymarchRaceMenuTick(now: number): any {
        var sp = this.sp, rm = this.greymarchRmState(), open = false;
        try { open = !!sp.Ui.isMenuOpen("RaceSex Menu"); } catch (mErr) { open = false; }
        if (rm.menuWas && !open) rm.sendAt = now + 1000; // RaceMenu finishes its own work as the menu closes
        rm.menuWas = open;
        if (open) { rm.sendAt = 0; return; } // RaceMenu is the editor while it is open
        if (this.greymarchWolfOn || this.greymarchShapeOn) { rm.beast = true; rm.loadedSince = 0; return; }
        if (rm.beast) { rm.beast = false; rm.done = null; rm.tries = 0; } // back in the character's own body: the sliders go on again
        if (rm.sendAt && now >= rm.sendAt) { rm.sendAt = 0; this.greymarchRaceMenuReport(); return; }
        if (rm.want === null || now < rm.next) return;
        rm.next = now + 1000;
        try {
            var player = sp.Game.getPlayer();
            if (!player || !player.is3DLoaded()) { rm.loadedSince = 0; return; }
            if (!rm.loadedSince) rm.loadedSince = now;
            if (now - rm.loadedSince < 4000) return;
            var key = JSON.stringify(rm.want);
            if (rm.done === key || rm.tries >= 3) return;
            rm.tries++;
            var current = this.greymarchRaceMenuExport(player);
            if (!current) return;
            if (rmMod.sameRaceMenuParts(current, rm.want)) { rm.done = key; rm.tries = 0; return; }
            sp.writeCharGenPreset(rmMod.PRESET_NAME, JSON.stringify(rmMod.spliceRaceMenuParts(current, rm.want)));
            var ok = sp.callNative("CharGen", "LoadCharacterPresetEx", undefined, player, rmMod.PRESET_NAME, null, rmMod.APPLY_ALL);
            if (!ok) { this.greymarchLog("racemenu: RaceMenu did not load the kept sliders (try " + rm.tries + " of 3)"); return; }
            rm.done = key; rm.tries = 0;
            this.greymarchLog("racemenu: sliders put back (" + this.greymarchRaceMenuSay(rm.want) + ")");
        } catch (err) {
            this.greymarchLog("racemenu: the sliders could not be put back (try " + rm.tries + " of 3): " + err);
        }
    }
    // RaceMenu's preset of the player's look right now, or null (no RaceMenu, or a SkyrimPlatform without readCharGenPreset). Logged once per reason.
    greymarchRaceMenuExport(player: any): any {
        var sp = this.sp, rm = this.greymarchRmState();
        var say = (why: string) => { if (!rm.said[why]) { rm.said[why] = true; this.greymarchLog("racemenu: " + why); } return null; };
        if (typeof sp.readCharGenPreset !== "function" || typeof sp.writeCharGenPreset !== "function") return say("this SkyrimPlatform cannot read RaceMenu presets, the extra sliders are not kept");
        sp.writeCharGenPreset(rmMod.PRESET_NAME, ""); // a failed export is never mistaken for an older one
        sp.callNative("CharGen", "SaveCharacterPreset", undefined, player, rmMod.PRESET_NAME);
        var text = sp.readCharGenPreset(rmMod.PRESET_NAME);
        if (!text) return say("RaceMenu wrote no preset (is RaceMenu installed?)");
        return JSON.parse(text);
    }
    greymarchRaceMenuReport(): any {
        var rm = this.greymarchRmState();
        try {
            var current = this.greymarchRaceMenuExport(this.sp.Game.getPlayer());
            if (!current) return;
            var parts = rmMod.pickRaceMenuParts(current);
            rm.want = parts; rm.done = JSON.stringify(parts); rm.tries = 0; // what the player just made is on the body already
            var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchRaceMenuLook", look: parts }) };
            this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
            this.greymarchLog("racemenu: sent after the race menu (" + this.greymarchRaceMenuSay(parts) + ")");
        } catch (err) {
            this.greymarchLog("racemenu: the sliders could not be read: " + err);
        }
    }
    greymarchRaceMenuSay(parts: any): string {
        var out = [];
        if (parts.morphs && parts.morphs.custom) out.push(parts.morphs.custom.length + " extra face sliders");
        if (parts.morphs && parts.morphs.sculpt) out.push("sculpting");
        if (parts.transforms) out.push(parts.transforms.length + " body scales");
        if (parts.bodyMorphs) out.push(parts.bodyMorphs.length + " body morphs");
        if (parts.overrides || parts.skinOverrides) out.push("overlays");
        return out.length ? out.join(", ") : "none beyond the vanilla look";
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
                try { var a = sp.Actor.from(sp.Game.getFormEx(lid)); if (a && !this.greymarchIsBeastBody(a)) { sp.Debug.sendAnimationEvent(a, "OffsetBoundStandingStart"); posed[lid] = now; } } catch (aErr) { /* tried again */ }
            }
            for (var k in posed) {
                if (still[k]) continue;
                delete posed[k];
                try { var b = sp.Actor.from(sp.Game.getFormEx(Number(k))); if (b) sp.Debug.sendAnimationEvent(b, "OffsetStop"); } catch (bErr) { /* gone */ }
            }
        }
        this.greymarchChainsDraw(now);
    }
    // THE CHAIN IN THE WORLD (since 2026-10-23; before, a line drawn on the HUD). Pieces of Skyrim's own iron chain (GreymarchCore.esp GM_PrisonerChain 0x878, the
    // model tools/chain-link.js cuts from the ship's anchor chain: 34 units long along +Y, no collision) are placed in this game only and laid end to end, every
    // frame, from the prisoner's right hand to the holder's left hand along a sagging curve: the chain is CHAIN_SLACK longer than the gap (at least CHAIN_EXTRA),
    // so it hangs by about sqrt(3 * gap * (length - gap) / 8) in the middle. Without the record (old game files) the HUD line is drawn as before.
    greymarchChain3D(now: number): boolean {
        var sp = this.sp, self = this;
        if (this.greymarchChainBase === undefined) { try { this.greymarchChainBase = sp.Game.getFormFromFile(0x878, "GreymarchCore.esp") || null; } catch (e) { this.greymarchChainBase = null; } }
        var base = this.greymarchChainBase;
        if (!base) { if (!this.greymarchChainSaid) { this.greymarchChainSaid = true; this.greymarchLog("guards: chain: no GM_PrisonerChain (0x878, GreymarchCore.esp) in this game: drawn on the HUD"); } return false; }
        // pieces that never showed (no 3D 2 s after they were placed) or a draw that keeps failing: the HUD line instead, so the chain is always seen (2026-10-27: "the chain is still invisible")
        if (this.greymarchChain3DOff) {
            var left = this.greymarchChainPools || {};
            for (var lk in left) { for (var li = 0; li < left[lk].refs.length; li++) { try { left[lk].refs[li].disable(false); left[lk].refs[li].delete(); } catch (lErr) { /* gone */ } } }
            this.greymarchChainPools = {};
            return false;
        }
        var PIECE = 34, CHAIN_SLACK = 1.15, CHAIN_EXTRA = 40, MAX_PIECES = 40;
        var pools = this.greymarchChainPools || (this.greymarchChainPools = {});
        var list = this.greymarchChainList || [], seen: any = {};
        var player = sp.Game.getPlayer();
        var refOf = function (id: number) { if (self.greymarchMeActor && id === self.greymarchMeActor) return player; var l = misc.remoteIdToLocalId(id); return l ? sp.Actor.from(sp.Game.getFormEx(l)) : null; };
        var hand = function (a: any, node: string) {
            var q = [sp.NetImmerse.getNodeWorldPositionX(a, node, false), sp.NetImmerse.getNodeWorldPositionY(a, node, false), sp.NetImmerse.getNodeWorldPositionZ(a, node, false)];
            if (!q.every(function (n: any) { return isFinite(n); }) || (q[0] === 0 && q[1] === 0 && q[2] === 0)) q = [a.getPositionX(), a.getPositionY(), a.getPositionZ() + 90];
            return q;
        };
        for (var i = 0; i < list.length; i++) {
            var key = String(list[i].from) + ">" + String(list[i].to);
            try {
                var a = refOf(Number(list[i].from)), b = refOf(Number(list[i].to));
                if (!a || !b || !a.is3DLoaded() || !b.is3DLoaded() || (player.getDistance(a) > 6000 && player.getDistance(b) > 6000)) continue;
                var A = hand(a, "NPC R Hand [RHnd]"), B = hand(b, "NPC L Hand [LHnd]");
                var gap = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
                if (!(gap > 1) || gap > PIECE * MAX_PIECES) continue;
                seen[key] = true;
                var pool = pools[key] || (pools[key] = { refs: [], at: "", made: now, checked: false });
                var sig = A.concat(B).map(function (n: number) { return Math.round(n / 2); }).join(",");
                if (!pool.checked && pool.refs.length && now - pool.made > 2000) {
                    pool.checked = true;
                    var shown = 0; for (var c = 0; c < pool.refs.length; c++) { try { if (pool.refs[c].is3DLoaded()) shown++; } catch (cErr) { /* gone */ } }
                    var r0 = pool.refs[0];
                    this.greymarchLog("guards: chain: " + shown + " of " + pool.refs.length + " pieces have 3D after 2 s (first at " + [r0.getPositionX(), r0.getPositionY(), r0.getPositionZ()].map(function (v: number) { return Math.round(v); }).join(",") + ", prisoner hand at " + A.map(function (v: number) { return Math.round(v); }).join(",") + ")");
                    if (!shown) { this.greymarchChain3DOff = true; this.greymarchLog("guards: chain: no piece is drawn in this game: the HUD line from now on"); }
                }
                if (sig === pool.at) continue; // nothing moved
                pool.at = sig;
                var length = Math.max(gap * CHAIN_SLACK, gap + CHAIN_EXTRA);
                var sag = Math.sqrt(3 * gap * (length - gap) / 8);
                var n = Math.min(MAX_PIECES, Math.max(1, Math.ceil(length / PIECE)));
                var at = function (t: number) { return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t - sag * 4 * t * (1 - t)]; };
                while (pool.refs.length < n) { var r = player.placeAtMe(base, 1, false, false); if (!r) break; pool.refs.push(r); }
                while (pool.refs.length > n) { var old = pool.refs.pop(); try { old.disable(false); old.delete(); } catch (dErr) { /* gone */ } }
                for (var k = 0; k < pool.refs.length; k++) {
                    var p0 = at(k / n), p1 = at((k + 1) / n);
                    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
                    var heading = Math.atan2(dx, dy) * 180 / Math.PI, pitch = -Math.atan2(dz, Math.hypot(dx, dy)) * 180 / Math.PI; // +Y of the piece along the chain (X angle: positive tips it down)
                    pool.refs[k].setPosition(p0[0], p0[1], p0[2]);
                    pool.refs[k].setAngle(pitch, 0, heading);
                }
            } catch (err) {
                this.greymarchChainErrs = (this.greymarchChainErrs || 0) + 1;
                if (this.greymarchChainErrs === 1) this.greymarchLog("guards: chain: drawing failed: " + ((err && (err as any).message) || err));
                if (this.greymarchChainErrs >= 30) { this.greymarchChain3DOff = true; this.greymarchLog("guards: chain: drawing failed 30 times: the HUD line from now on"); }
                if (pools[key]) { for (var x = 0; x < pools[key].refs.length; x++) { try { pools[key].refs[x].delete(); } catch (xErr) { /* gone */ } } delete pools[key]; } } // a piece went with a cell change: built again next frame
        }
        for (var key2 in pools) {
            if (seen[key2]) continue;
            for (var j = 0; j < pools[key2].refs.length; j++) { try { pools[key2].refs[j].disable(false); pools[key2].refs[j].delete(); } catch (dErr2) { /* gone */ } }
            delete pools[key2];
        }
        return true;
    }
    // the chains on the HUD (only without the chain record): each end where the hand is on screen (0..1 from the top left), about 30 times a second while one is in sight
    greymarchChainsDraw(now: number): any {
        if (this.greymarchChain3D(now)) { if (this.greymarchChainsShown) { this.greymarchChainsKey = "[]"; this.greymarchChainsShown = false; this.greymarchGuardsHudCheck(); this.greymarchHudToPage("chains", { list: [] }); } return; }
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
    // HUNGER (gamemode hunger.js). A starving character staggers now and then: the server sends greymarchStagger to them (self) and to everyone near, and each game plays
    // it on that character (their own player, or the copy of the other player). Regeneration: while starving the server says regen false and the player's HealRate
    // and StaminaRate are set to 0 (put back as they were when it says true); the server also undoes any rise that looks like regeneration.
    // RAISING THE DEAD AND SUMMONING BY NPCs (gamemode magicblock.js). Every game runs an NPC's spell by itself and the server never knows, so a necromancer's
    // Reanimate raised a corpse in one game only (the server still has it dead) and a conjurer's atronach existed in one game only; a skeleton mage's Reanimate
    // Corpse came one second before a crash on test (2026-10-22). Such an effect is ended the frame after it starts when an NPC cast it: the caster's base is a
    // real record of the plugins (another player's copy has a base made at runtime, 0xFF...; this player is 0x14), so players keep their own summons.
    greymarchMagicBlockDrive(): any {
        var q = this.greymarchMagicBlockQueue;
        if (!q || !q.length) return;
        this.greymarchMagicBlockQueue = [];
        for (var i = 0; i < q.length && i < 32; i++) {
            try {
                if (q[i].caster === 0x14) continue;
                var caster = this.sp.Actor.from(this.sp.Game.getFormEx(q[i].caster));
                var base = caster ? caster.getLeveledActorBase() || caster.getBaseObject() : null;
                var baseId = base ? base.getFormID() >>> 0 : 0;
                if (!baseId || baseId >= 0xff000000) continue; // a player (their copy here) or unknown: left alone
                q[i].active.dispel();
                this.greymarchCrumb("magic block: ended effect " + q[i].effect.toString(16) + " of NPC " + q[i].caster.toString(16));
            } catch (dErr) { /* it ended by itself */ }
        }
    }
    // ---- THE BUILD SYSTEM'S FREE CAMERA (gamemode buildsys.js "place_at" / "move_to"). Place or Hold in the Build tab closes the panel and turns on the game's own free
    // camera (the console's "tfc", given by Greymarch's SKSE plugin GreymarchCamera.dll through the script GreymarchCam). The GM flies it as usual (WASD, the mouse);
    // a preview of the piece (a copy in this game only) stands where the camera looks. Up / Down arrows: closer / farther; Left / Right: turn it; Page Up / Page Down:
    // raise / lower it; Shift: bigger steps; Enter: put it there (the server checks the spot is in the GM's cell, near their body); B or Esc: leave.
    // Placing keeps the camera on for the next one; moving a placed piece ends with it. Nothing here decides anything: the server does the placing.
    greymarchBuildCamSay(text: string): any { try { this.greymarchToast({ title: "Build", text: String(text).slice(0, 300), kind: "info", ms: 4500 }); } catch (e) { try { this.sp.Debug.notification(String(text).slice(0, 200)); } catch (e2) { /* a hint is a nicety */ } } }
    greymarchBuildCamStart(w: any): any {
        var sp = this.sp, key = String(w.key || ""), m = /^([0-9a-f]{1,8}):(.+)$/i.exec(key), base: any = null;
        try { base = m ? sp.Game.getFormFromFile(parseInt(m[1], 16), m[2]) : null; } catch (e) { base = null; }
        if (!base) { this.greymarchBuildCamSay("That piece is not in this game's files."); return; }
        var on = false;
        try { on = !!sp.callNative("GreymarchCam", "SetFreeCamera", undefined, true); } catch (e) { on = false; this.greymarchLog("build: no free camera (" + e + ")"); }
        if (!on) { this.greymarchBuildCamSay("The free camera needs the latest game files (GreymarchCamera.dll). The Build tab's own buttons still place and move things."); return; }
        this.greymarchBuildCam = { mode: w.mode === "move" ? "move" : "place", key: key, name: String(w.name || "It").slice(0, 60), id: Number(w.id) >>> 0, base: base, ghost: null, dist: 400, turn: 0, up: 0, last: "", next: 0, shift: false };
        this.greymarchLog("build: free camera on, " + this.greymarchBuildCam.mode + " " + key);
        this.greymarchBuildCamSay(this.greymarchBuildCam.name + ": fly with WASD and the mouse. Up / Down arrows closer / farther, Left / Right turn, Page Up / Down raise / lower, Shift bigger steps, Enter puts it there, B or Esc leaves.");
    }
    greymarchBuildCamEnd(why: string): any {
        var b = this.greymarchBuildCam;
        this.greymarchBuildCam = null;
        if (!b) return;
        if (b.ghost) { try { b.ghost.disable(false); b.ghost.delete(); } catch (e) { /* gone */ } }
        try { if (this.sp.callNative("GreymarchCam", "IsFreeCamera", undefined)) this.sp.callNative("GreymarchCam", "SetFreeCamera", undefined, false); } catch (e) { /* the camera is the player's again on the next view change */ }
        this.greymarchLog("build: free camera off (" + why + ")");
    }
    // where the preview goes: the camera's spot plus its forward direction times the distance, raised by up; turned to face the camera, plus the GM's turn
    greymarchBuildCamSpot(): any {
        var sp = this.sp, b = this.greymarchBuildCam, c: number[] = [];
        for (var i = 0; i < 6; i++) c.push(Number(sp.callNative("GreymarchCam", "GetCamera", undefined, i)));
        if (!c.every(function (n) { return isFinite(n); })) return null;
        var len = Math.hypot(c[3], c[4], c[5]); if (!(len > 0.01)) return null;
        var fx = c[3] / len, fy = c[4] / len, fz = c[5] / len;
        var pos = [c[0] + fx * b.dist, c[1] + fy * b.dist, c[2] + fz * b.dist + b.up];
        var face = Math.atan2(-fx, -fy) * 180 / Math.PI; // towards the camera (0 = north, like the game's Z angle)
        var rot = (((face + b.turn) % 360) + 360) % 360;
        return { pos: pos, rot: rot };
    }
    greymarchBuildCamTick(now: number): any {
        var w = this.greymarchBuildCamWanted;
        if (w) { this.greymarchBuildCamWanted = null; if (now - w.at <= 3000) { if (this.greymarchBuildCam) this.greymarchBuildCamEnd("another piece"); this.greymarchBuildCamStart(w); } }
        var b = this.greymarchBuildCam;
        if (!b || now < b.next) return;
        b.next = now + 33;
        try {
            if (!this.sp.callNative("GreymarchCam", "IsFreeCamera", undefined)) { this.greymarchBuildCamEnd("the free camera went off"); return; }
            var spot = this.greymarchBuildCamSpot();
            if (!spot) return;
            var sig = spot.pos.map(function (n: number) { return Math.round(n); }).join(",") + "," + Math.round(spot.rot);
            if (sig === b.last) return;
            b.last = sig;
            if (!b.ghost) { var player = this.sp.Game.getPlayer(); b.ghost = player ? player.placeAtMe(b.base, 1, false, false) : null; if (!b.ghost) return; }
            b.ghost.setPosition(spot.pos[0], spot.pos[1], spot.pos[2]);
            b.ghost.setAngle(0, 0, spot.rot);
        } catch (err) { if (b.ghost) { try { b.ghost.delete(); } catch (dErr) { /* gone */ } b.ghost = null; } } // a cell change took the preview: made again next time
    }
    // the free camera's keys; true when the key was the build system's (the game still flies the camera with its own)
    greymarchBuildCamKey(e: any): boolean {
        var b = this.greymarchBuildCam; if (!b) return false;
        var down = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true);
        if (e.isUp === true) down = false;
        if (e.code === 42 || e.code === 54) { b.shift = down; return false; } // Shift: bigger steps (it still runs the camera faster)
        var mine = [28, 1, 200, 208, 203, 205, 201, 209, 48];
        if (mine.indexOf(e.code) < 0) return false;
        if (!down) return true;
        var big = !!b.shift;
        if (e.code === 200) b.dist = Math.min(2000, b.dist + (big ? 200 : 40));
        else if (e.code === 208) b.dist = Math.max(80, b.dist - (big ? 200 : 40));
        else if (e.code === 203) b.turn -= big ? 90 : 15;
        else if (e.code === 205) b.turn += big ? 90 : 15;
        else if (e.code === 201) b.up += big ? 100 : 10;
        else if (e.code === 209) b.up -= big ? 100 : 10;
        else if (e.code === 28 && e.isRepeating !== true) this.greymarchBuildCamSend();
        else if (e.code === 48 || e.code === 1) { this.greymarchBuildCamEnd(e.code === 48 ? "B" : "Esc"); if (e.code === 48) this.greymarchAdminShow("build"); }
        b.next = 0; // the preview follows at once
        return true;
    }
    greymarchBuildCamSend(): any {
        var b = this.greymarchBuildCam; if (!b) return;
        var spot: any = null; try { spot = this.greymarchBuildCamSpot(); } catch (e) { spot = null; }
        if (!spot) { this.greymarchBuildCamSay("The camera could not be read. Try again."); return; }
        var rid = 1000000000 + (this.greymarchBuildRidN = (this.greymarchBuildRidN || 0) + 1);
        (this.greymarchBuildRids || (this.greymarchBuildRids = {}))[rid] = true;
        var pos = spot.pos.map(function (n: number) { return Math.round(n * 10) / 10; }), rot = Math.round(spot.rot * 10) / 10;
        this.greymarchAdminSend({ rid: rid, op: "build", args: b.mode === "move" ? { sub: "move_to", id: b.id, pos: pos, rot: rot } : { sub: "place_at", key: b.key, pos: pos, rot: rot } });
        if (b.mode === "move") this.greymarchBuildCamEnd("moved");
    }
    // ---- THE CHOPPING BLOCK (gamemode professions.js chopSeen): while the player sits in a piece of furniture, its id goes to the server once a second; 0 once when they get up.
    // The server only counts it for the chopping block it let them sit at (a Woodcutter): a chop every few seconds, XP each chop, firewood every second chop. Nothing is given here.
    greymarchChopTick(now: number): any {
        if (now < (this.greymarchChopNext || 0)) return;
        this.greymarchChopNext = now + 1000;
        var ref = 0;
        try { var player = this.sp.Game.getPlayer(); var furn = player ? player.getFurnitureReference() : null; ref = furn ? misc.localIdToRemoteId(furn.getFormID()) || 0 : 0; } catch (e) { ref = 0; }
        // sitting or lying on the ground from the emote wheel is resting too (gamemode exhaustion.js); so is any furniture that is not a work station (the server tells them apart)
        var em = this.greymarchEmoteNow, rest = !!(em && em.kind === "loop" && (em.id === "wounded2" || em.id === "lie" || em.id === "sit" || em.id === "sitledge"));
        if (!ref && !rest && !this.greymarchChopRef && !this.greymarchChopRest) return;
        this.greymarchChopRef = ref; this.greymarchChopRest = rest;
        this.controller.emitter.emit("sendMessage", { message: { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify(rest ? { customPacketType: "greymarchChop", ref: ref >>> 0, rest: true } : { customPacketType: "greymarchChop", ref: ref >>> 0 }) }, reliability: "unreliable" });
    }
    // a piece a GM placed was turned (gamemode buildsys.js): this game's copy of it, if it has one loaded, takes the server's angle
    greymarchBuildAngleTick(): any {
        var q = this.greymarchBuildAngleQueue;
        if (!q || !q.length) return;
        this.greymarchBuildAngleQueue = [];
        for (var i = 0; i < q.length && i < 32; i++) {
            try {
                var localId = misc.remoteIdToLocalId(q[i].id);
                var ref = localId ? this.sp.ObjectReference.from(this.sp.Game.getFormEx(localId)) : null;
                if (ref) ref.setAngle(0, 0, q[i].z);
            } catch (aErr) { /* not drawn here: it loads with the server's angle */ }
        }
    }
    // Plain notices ({ customPacketType: "greymarchNotice", text } with no title): the game's own message at the top left. Debug.notification only works in the update
    // phase, so the packet handler queues them and they are shown here, two per frame at most.
    greymarchNoticeTick(): any {
        var q = this.greymarchNoticeQueue;
        if (!q || !q.length) return;
        var some = q.splice(0, 2);
        for (var i = 0; i < some.length; i++) { try { this.sp.Debug.notification(some[i]); } catch (e) { /* a notice is a nicety */ } }
    }
    // GET UP ({ customPacketType: "greymarchStandUp" }): the player leaves the furniture they are in (the pickaxe at an ore vein after a won mining game; a chair, a chopping
    // block) with the normal get-up animation, as a movement key would do it. Skyrim never ends the mining animation by itself on this server. Not in furniture: nothing.
    //   1. the behaviour graph's own furniture exit (IdleFurnitureExit): the get-up animation, and SkyMP passes it to the other games.
    //   2. still in the same furniture STANDUP_FALLBACK_MS later: IdleForceDefaultState (a snap to standing, never a stagger).
    // The furniture is never activated again: that activation would go to the server (it could start mining again). Each step is logged ("standup: ...").
    greymarchStandUpTick(now: number): any {
        var sp = this.sp;
        var at = this.greymarchStandUpWanted || 0;
        if (at) {
            this.greymarchStandUpWanted = 0;
            if (now - at > 5000) return; // a request from long ago
            var player: any = null, furn: any = null;
            try { player = sp.Game.getPlayer(); furn = player ? player.getFurnitureReference() : null; } catch (e) { furn = null; }
            if (!player || !furn) { this.greymarchStandUpLog("not in furniture: nothing to do"); return; }
            var fid = 0; try { fid = furn.getFormID(); } catch (e) { fid = 0; }
            try { sp.Debug.sendAnimationEvent(player, "IdleFurnitureExit"); } catch (e) { /* the fallback gets them up */ }
            this.greymarchStandUp = { at: now, furn: fid };
            this.greymarchStandUpLog("getting up from " + fid.toString(16) + " (IdleFurnitureExit)");
            return;
        }
        var job = this.greymarchStandUp;
        if (!job || now - job.at < STANDUP_FALLBACK_MS) return;
        this.greymarchStandUp = null;
        var still = false, pl: any = null;
        try { pl = sp.Game.getPlayer(); var f2 = pl ? pl.getFurnitureReference() : null; still = !!f2 && f2.getFormID() === job.furn; } catch (e) { still = false; }
        if (!still) { this.greymarchStandUpLog("up after " + (now - job.at) + " ms"); return; }
        try { sp.Debug.sendAnimationEvent(pl, "IdleForceDefaultState"); } catch (e) { /* nothing else to try */ }
        this.greymarchStandUpLog("still in the furniture after " + (now - job.at) + " ms: IdleForceDefaultState");
    }
    greymarchStandUpLog(text: string): any { if ((this.greymarchStandUpLogged = (this.greymarchStandUpLogged || 0) + 1) <= 30) this.greymarchLog("standup: " + text); }
    greymarchHungerDrive(): any {
        var q = this.greymarchStaggerQueue;
        if (q && q.length) {
            this.greymarchStaggerQueue = [];
            for (var i = 0; i < q.length; i++) {
                try {
                    if (q[i].self) { this.sp.Debug.sendAnimationEvent(this.sp.Game.getPlayer(), "staggerStart"); continue; }
                    var localId = misc.remoteIdToLocalId(q[i].actor);
                    var ref = localId ? this.sp.ObjectReference.from(this.sp.Game.getFormEx(localId)) : null;
                    if (ref) {
                        var g: any = Function("return this")(); var allow = g.__gmStaggerAllow || (g.__gmStaggerAllow = {}); allow[localId] = Date.now() + 1000; // the death service blocks staggers on other players' copies: this one is the server's (deathService.ts)
                        animMod.applyAnimation(ref, { animEventName: "staggerStart", numChanges: 1 }, { lastNumChanges: 0, useAnimOverrides: false });
                    }
                } catch (sErr) { /* that player is not drawn here */ }
            }
        }
        var want = this.greymarchHungerRegen !== false;
        var had = this.greymarchHungerRegenApplied !== false;
        if (want === had) return;
        try {
            var player = this.sp.Game.getPlayer();
            if (!player) return;
            if (!want) {
                this.greymarchHungerSaved = { heal: player.getActorValue("HealRate"), stamina: player.getActorValue("StaminaRate") };
                player.setActorValue("HealRate", 0); player.setActorValue("StaminaRate", 0);
            } else {
                var saved = this.greymarchHungerSaved || {};
                player.setActorValue("HealRate", Number.isFinite(saved.heal) && saved.heal > 0 ? saved.heal : player.getBaseActorValue("HealRate"));
                player.setActorValue("StaminaRate", Number.isFinite(saved.stamina) && saved.stamina > 0 ? saved.stamina : player.getBaseActorValue("StaminaRate"));
            }
            this.greymarchHungerRegenApplied = want;
        } catch (rErr) { /* tried again next frame */ }
    }
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
    // TGM, every frame (the game ignores Debug.SetGodMode in release, 2026-10-27): the player's own magicka and stamina are put back to full the moment they drop and the
    // shout cooldown is cleared, so neither bar visibly drains and shouts can be used back to back. Health is never touched: other players can still hurt and kill a staff
    // member with TGM on. The carry weight bonus (TGM_CARRY) is switched with TGM in greymarchEffects.
    greymarchTgmFrame(): any {
        if (!this.greymarchFxWant || !this.greymarchFxWant.tgm) return;
        try {
            var player = this.sp.Game.getPlayer();
            if (!player) return;
            if (player.getActorValuePercentage("Magicka") < 1) player.restoreActorValue("Magicka", 100000);
            if (player.getActorValuePercentage("Stamina") < 1) player.restoreActorValue("Stamina", 100000);
            if (player.getVoiceRecoveryTime() > 0) player.setVoiceRecoveryTime(0);
        } catch (err) {
            if (!this.greymarchTgmErr) { this.greymarchTgmErr = true; this.greymarchLog("staff: TGM refill error (shown once): " + err); }
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
            var have = this.greymarchFxHave || (this.greymarchFxHave = { noclip: false, speed: 100, frozen: false, god: false, tgm: false });
            if (want) {
                if (want.noclip !== have.noclip) { sp.Debug.toggleCollisions(); have.noclip = want.noclip; this.greymarchLog("staff: noclip " + (want.noclip ? "on" : "off")); }
                if (want.speed !== have.speed) { player.setActorValue("SpeedMult", want.speed); have.speed = want.speed; this.greymarchLog("staff: speed " + want.speed + "%"); }
                if (!!want.god !== have.god) { try { player.setGhost(!!want.god); } catch (gErr) { this.greymarchLog("staff: setGhost is not available (" + gErr + "), god mode relies on refilling"); } have.god = !!want.god; this.greymarchLog("staff: god " + (want.god ? "on" : "off")); } if (want.god) { try { player.restoreActorValue("health", 100000); player.restoreActorValue("stamina", 100000); player.restoreActorValue("magicka", 100000); } catch (rErr) { /* the invulnerable flag still protects */ } } 
                // TGM: the game's own god mode, what the console's tgm switches (Debug.SetGodMode): no drain, no shout cooldown, no carry limit, no arrows used. The server still
                // works out other players' hits, so it never protects against them (God above is the switch that does).
                if (!!want.tgm !== have.tgm) { try { sp.Debug.setGodMode(!!want.tgm); } catch (tErr) { this.greymarchLog("staff: SetGodMode is not available (" + tErr + "), TGM relies on the server refill"); } have.tgm = !!want.tgm; this.greymarchLog("staff: TGM " + (want.tgm ? "on" : "off")); }
                if (!!want.tgm !== !!have.tgmCarry) { try { player.modActorValue("CarryWeight", want.tgm ? TGM_CARRY : -TGM_CARRY); have.tgmCarry = !!want.tgm; } catch (cErr) { this.greymarchLog("staff: TGM carry weight failed (" + cErr + ")"); have.tgmCarry = !!want.tgm; } }
                if (want.frozen !== have.frozen) {
                    if (want.frozen) sp.Game.disablePlayerControls(true, true, true, true, true, true, true, true, 0); else sp.Game.enablePlayerControls(true, true, true, true, true, true, true, true, 0);
                    have.frozen = want.frozen;
                }
            }
            this.greymarchNoHostApply(now, player, !!have.god);
            this.greymarchGhostApply(now, ghosts || []); this.greymarchNamesApply(now); this.greymarchInvisApply(now); this.greymarchNoTalkApply(now); this.greymarchSeenLog(now); this.greymarchStatsApply(player); this.greymarchCombatApply(player);
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
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchHudOn && !this.greymarchChatOn && !this.greymarchGuardsHud && !(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(false); } catch (e2) { /* fine */ } }
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
    // NPC HOSTING IN GOD MODE (2026-10-22). God mode makes this player a ghost, and an NPC whose AI runs in a ghost's game ignores the ghost and every other player,
    // so it stood still for everyone (a GM in a dungeon). So while god mode is on AND another player (not a staff ghost) is within two cells, this game drops the
    // NPCs it runs and asks for none (storage greymarchNoHost: sendInputsService.ts, remoteServer.ts); the other game takes them over within 2 s. Alone, a god-mode
    // game runs its NPCs as usual: nobody else would, and NPCs nobody runs walk through the ground and the sky (the same day, alone in god mode).
    greymarchNoHostApply(now: any, player: any, god: any): any {
        var want = false;
        if (god) {
            if (now - (this.greymarchNoHostCheckAt || 0) < 1500) return;
            this.greymarchNoHostCheckAt = now;
            want = this.greymarchOtherHostNear(player);
        }
        if (want === !!this.greymarchNoHostOn) return;
        this.greymarchNoHostOn = want;
        try { (this.sp.storage as any)["greymarchNoHost"] = want; if (want) this.sp.storage["hosted"] = []; } catch (e) { /* hosting stays as SkyMP has it */ }
        this.greymarchLog("staff: " + (want ? "god mode with another player near: this game hands its NPCs over" : "this game runs NPCs again"));
    }
    // another player who could run NPCs instead of this one: online (greymarchOthers), not a staff ghost, loaded in this game and within two cells
    greymarchOtherHostNear(player: any): any {
        var others = this.greymarchOthers || [];
        var ghosts = (this.greymarchGhostList || []).map(function (g: any) { return g && g.actor; });
        for (var i = 0; i < others.length; i++) {
            if (ghosts.indexOf(others[i]) >= 0) continue;
            try {
                var localId = misc.remoteIdToLocalId(others[i]);
                var actor = localId ? this.sp.Actor.from(this.sp.Game.getFormEx(localId)) : null;
                if (!actor || !actor.is3DLoaded()) continue;
                var dx = actor.getPositionX() - player.getPositionX(), dy = actor.getPositionY() - player.getPositionY();
                if (dx * dx + dy * dy <= 8192 * 8192) return true;
            } catch (e) { /* not here */ }
        }
        return false;
    }
    // INVISIBLE: done on every game's own screen (alpha 0), NOT by switching the body off on the server, which disconnects the owner. The name over their head is hidden too (see hide-invisible-name).
    greymarchIsInvisible(actorId: any, isMe: any): any {
        return !isMe && !!this.greymarchInvisList && this.greymarchInvisList.indexOf(actorId) >= 0;
    }
    // NO "E TALK" ON SOMEONE INVISIBLE (2026-10-30, the owner): looking at an invisible GM still showed the prompt to talk to them. Their body here is
    // blocked from activation with the prompt hidden (Papyrus BlockActivation(abBlocked, abHideActivateText), the second argument since Skyrim 1.6.1130;
    // SkyrimPlatform passes it on though its typings list one), and unblocked when they show again.
    // 2026-10-30, the owner: "the fix for invisibility did not work". SkyrimPlatform's own blockActivation passes only the one argument it knows from older
    // Skyrim, so the hide-the-text flag never arrived. The game's Papyrus function is called by name instead (callNative passes every argument), and the old
    // call is the fallback. The first outcome is logged once: "talk prompt: hidden (BlockActivation, 2 arguments)" or why not.
    greymarchNoPrompt(actor: any, hide: boolean): any {
        var sp: any = this.sp, how = "";
        try { sp.callNative("ObjectReference", "BlockActivation", actor, hide, hide); how = "BlockActivation, 2 arguments"; }
        catch (nErr) {
            try { (actor as any).blockActivation(hide); how = "blockActivation, 1 argument (the prompt still shows): " + nErr; }
            catch (bErr) { how = "failed: " + bErr; }
        }
        if (!this.greymarchNoPromptLogged) { this.greymarchNoPromptLogged = true; this.greymarchLog("talk prompt: " + (hide ? "hidden" : "shown") + " (" + how + ")"); }
    }
    // NO "E TALK STRANGER" ON PLAYERS (2026-10-30, the owner: remove the prompt from people completely). Every other living player's body here is blocked from
    // activation with the prompt hidden (greymarchNoPrompt), checked every 2 s (a body built again would show it again). A dead body is left open: a werewolf
    // feeds on it with E (gamemode werewolf.js). Robbing, frisking, trading and the rest go through the X menu, not E. Invisible players: greymarchInvisApply.
    greymarchNoTalkApply(now: any): any {
        if (now < (this.greymarchNoTalkNext || 0)) return;
        this.greymarchNoTalkNext = now + 2000;
        var sp = this.sp, others = this.greymarchOthers || [];
        for (var i = 0; i < others.length; i++) {
            if (this.greymarchIsInvisible(others[i], false)) continue; // hidden with the body there
            var lid = misc.remoteIdToLocalId(others[i]); if (!lid) continue;
            var actor: any = null; try { actor = sp.Actor.from(sp.Game.getFormEx(lid)); } catch (e1) { actor = null; }
            if (!actor) continue;
            var dead = false; try { dead = !!actor.isDead(); } catch (e2) { dead = false; }
            this.greymarchNoPrompt(actor, !dead);
        }
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
            this.greymarchNoPrompt(actor, true); // nothing to talk to: no prompt, no activation
            if (!cur || cur.removing) this.greymarchLog("staff: invisible on " + localId.toString(16));
            applied[localId] = { at: now };
        }
        for (var key in applied) {
            if (seen[key]) continue;
            var old = applied[key];
            var gone = null; try { gone = sp.Actor.from(sp.Game.getFormEx(Number(key))); } catch (e2) { gone = null; }
            if (!old.removing) { if (gone) { try { gone.setAlpha(1, false); } catch (e3) { /* nothing to restore */ } this.greymarchNoPrompt(gone, false); } applied[key] = { removing: true, at: now, passes: 0 }; this.greymarchLog("staff: invisible removed from " + Number(key).toString(16)); continue; }
            if (old.passes === 0 && now - old.at >= 600) { if (gone) { try { gone.setAlpha(1, false); } catch (e4) { /* fine */ } } old.passes = 1; }
            else if (old.passes === 1 && now - old.at >= 2500) { if (gone) { try { gone.setAlpha(1, false); } catch (e5) { /* fine */ } this.greymarchNoPrompt(gone, false); } delete applied[key]; }
        }
    }
    // SERVER-DRIVEN ANIMALS (gamemode wildlifebrain.js, switch wildlife-brain.on): their frames { f: [[id, x, y, z, heading, speed, anim], ...] } are kept by the
    // animal's server id in storage["greymarchBeastFrames"], where formView reads them (gmPuppetMove). Old ones are dropped after a minute.
    greymarchBeastFrames(msg: any): any {
        try {
            if (!msg || !Array.isArray(msg.f)) return;
            const st: any = this.sp.storage as any;
            // GREYMARCH (2026-10-28): the frames also go through a global, as every other value the bridge hands to formView does (__gmBeastHeld, __gmWolfRace):
            // with storage alone the owner's deer never moved (the server had sent 219 frames). One object, kept in both.
            const gl: any = Function("return this")();
            const frames: any = gl.__gmBeastFrames || st["greymarchBeastFrames"] || {};
            gl.__gmBeastFrames = frames; st["greymarchBeastFrames"] = frames;
            if (!this.greymarchBeastSeen && typeof this.greymarchCrumb === "function") { this.greymarchBeastSeen = true; this.greymarchCrumb("beast: first frames from the server (" + msg.f.length + " animal(s), e.g. " + (Array.isArray(msg.f[0]) ? Number(msg.f[0][0]).toString(16) : "?") + ")"); }
            const now = Date.now();
            for (const f of msg.f.slice(0, 200)) {
                if (!Array.isArray(f) || f.length < 7) continue;
                const id = Number(f[0]);
                if (!(id > 0) || ![f[1], f[2], f[3], f[4], f[5]].every((n: any) => typeof n === "number" && isFinite(n))) continue;
                // f[7]: the server's health, 0..1 (2026-10-28: the bar of a server-driven animal; an older server sends seven values)
                const hp = typeof f[7] === "number" && isFinite(f[7]) ? Math.max(0, Math.min(1, f[7])) : undefined;
                // f[8]: hunting (1: after a player; formView holds it in its fighting stance, where a creature's attack plays; 2026-10-28)
                frames[String(id)] = { pos: [f[1], f[2], f[3]], heading: f[4], speed: f[5], anim: String(f[6]).slice(0, 12), at: now, ...(hp !== undefined ? { hp } : {}), ...(f[8] === 1 ? { hunt: 1 } : {}), ...(typeof f[9] === "string" && f[9].length < 64 && /^[A-Za-z0-9_]+$/.test(f[9]) && /attack/i.test(f[9]) ? { ev: f[9] } : {}), ...(f[10] === 1 && typeof f[11] === "number" && isFinite(f[11]) && typeof f[12] === "number" && isFinite(f[12]) ? { mine: 1, reach: Math.max(50, Math.min(600, f[11])), run: Math.max(50, Math.min(1500, f[12])) } : {}) };
                // f[10..12] (2026-10-28): it hunts THIS player, whose game moves it (formView gmPuppetDriveLocal), with its reach and run speed
                // f[9]: on an attack, the creature's own attack event (a creature does not answer a person's "attackStart"; 2026-10-28)
            }
            if ((this.greymarchBeastSweepAt || 0) < now - 10000) {
                this.greymarchBeastSweepAt = now;
                for (const k of Object.keys(frames)) if (now - frames[k].at > 60000) delete frames[k];
            }
        } catch (err) { /* a lost frame: the next one comes within a second */ }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)) return; // not over the select screen, the staff panel, the professions window, or itself
        this.greymarchMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchMenuToPage("show", { mode: (arg && arg.mode) || "hold", looking: (arg && arg.looking) || 0, object: !!(arg && arg.object) }); // looking = the remote actor id of the player the menu is about
    }
    // HOLD X: look at a player and hold X, and the menu for THAT player appears; let go of X over an option to pick it (the page does the picking: it gets "release").
    // Not looking at a player: nothing opens (a short hint says why). The page is shown and focused while it is up, so the mouse is a cursor.
    greymarchMenuHold(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)) return;
        var looking = 0, isObject = false;
        try {
            var ref = this.sp.Game.getCurrentCrosshairRef();
            if (ref) {
                looking = misc.localIdToRemoteId(ref.getFormID()) || 0;
                if (looking && (this.greymarchOthers || []).indexOf(looking) < 0) {
                    // not a player: a door (form type 29) or a storage (28) can be managed from the same menu (the SERVER checks what it really is),
                    // and a dead body is looked at like a player (the server shows what can be taken from a dead wild animal, or says no)
                    var kind = 0;
                    try { var base = ref.getBaseObject(); kind = base ? base.getType() : 0; } catch (e1) { kind = 0; }
                    var body = false;
                    try { var ac = this.sp.Actor.from(ref); body = !!ac && ac.isDead(); } catch (e3) { body = false; }
                    if (kind === 29 || kind === 28) isObject = true; else if (!body) looking = 0;
                }
            }
        } catch (e) { looking = 0; isObject = false; }
        if (!looking) {
            try { this.sp.Debug.notification("Look at a player, a door, a chest or a body and hold X"); } catch (e2) { /* a hint is a nicety */ }
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
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchMenuOn = false;
        this.greymarchMenuToPage("hide", true);
        this.greymarchMenuEscAt = 0;
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); }
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
    // H AND B, handled every frame the way K is (2026-10-29, the owner: "the H key follows the fix we did for the chat box and K"): an H or a B typed into a game
    // menu (the console, the race menu's name box) is a letter, not the staff panel; the log says why. A press older than a second is dropped.
    greymarchStaffKeyPending(): any {
        var want = this.greymarchStaffKeyWanted;
        if (!want) return;
        this.greymarchStaffKeyWanted = null;
        if (Date.now() - want.at > 1000) return;
        if (this.greymarchInMenu()) { this.greymarchChatWhy(want.key + " ignored: the game says '" + this.greymarchMenuName + "' is open"); return; }
        if (this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchChatTyping || this.greymarchPanelHasKeys()) return; // something took the keyboard meanwhile
        if (this.greymarchEmoteOn) this.greymarchEmoteHide();
        this.greymarchStaffOpen(want.mode);
    }
    greymarchProfShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) || this.greymarchChatTyping) return; // not over the select screen, the other panels, or while typing
        this.greymarchProfOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchProfToPage("show", true);
    }
    greymarchProfHide(): any {
        if (!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchProfOn = false;
        this.greymarchProfToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) return; // not over the select screen or the other panels
        this.greymarchChanceryOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchChanceryToPage("show", true);
    }
    greymarchChanceryHide(): any {
        if (!this.greymarchChanceryOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchChanceryOn = false;
        this.greymarchChanceryToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchVampMenuOn || !!this.greymarchLedgerOn || !!this.greymarchScribeOn); }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) return; // not over the select screen or the other panels
        this.greymarchVampMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchVampMenuToPage("show", true);
    }
    greymarchVampMenuHide(): any {
        if (!this.greymarchVampMenuOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchVampMenuOn = false;
        this.greymarchVampMenuToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchLedgerOn || !!this.greymarchScribeOn); }
    }
    greymarchVampMenuAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchVampMenu", rid: data.rid, op: data.op }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // ---- THE GUARD LEDGER (/reports). The page is Platform/UI/greymarch-ledger.html; the SERVER decides everything (gamemode/src/reports.js, off unless
    // greymarch-data/reports.on exists), which opens it ({ customPacketType: "greymarchLedgerOpen" }). Built like the vampire window; the requests carry args.
    greymarchLedgerToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(LEDGER_SCRIPT + "window.__gmLedgerRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the guard ledger: " + err);
        }
    }
    greymarchLedgerShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) { // not over the select screen or the other panels
            this.greymarchLog("ledger: not opened, " + [this.greymarchScreenUp ? "the select screen" : "", this.greymarchAdminOn ? "the staff panel" : "", this.greymarchMenuOn ? "the X menu" : "", this.greymarchProfOn ? "the K window" : "", this.greymarchChanceryOn ? "the chancery" : "", this.greymarchVampMenuOn ? "the vampire window" : "", this.greymarchLedgerOn ? "the ledger itself" : "", this.greymarchScribeOn ? "the scribe's desk" : ""].filter(Boolean).join(", ") + " is marked open");
            return;
        }
        this.greymarchLog("ledger: opened");
        this.greymarchLedgerOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchLedgerToPage("show", true);
    }
    greymarchLedgerHide(): any {
        if (!this.greymarchLedgerOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchLedgerOn = false;
        this.greymarchLedgerToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchVampMenuOn); }
    }
    // ---- THE SCRIBE'S DESK (/scribe or /write). The page is Platform/UI/greymarch-scribe.html; the SERVER decides everything (gamemode/src/scribe.js, off unless
    // greymarch-data/scribe.on exists), which opens it ({ customPacketType: "greymarchScribeOpen" }). Built like the guard ledger; the requests carry args.
    greymarchScribeToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(SCRIBE_SCRIPT + "window.__gmScribeRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the scribe's desk: " + err);
        }
    }
    greymarchScribeShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn) { // not over the select screen or the other panels
            this.greymarchLog("scribe: not opened, " + [this.greymarchScreenUp ? "the select screen" : "", this.greymarchAdminOn ? "the staff panel" : "", this.greymarchMenuOn ? "the X menu" : "", this.greymarchProfOn ? "the K window" : "", this.greymarchChanceryOn ? "the chancery" : "", this.greymarchVampMenuOn ? "the vampire window" : "", this.greymarchLedgerOn ? "the guard ledger" : "", this.greymarchScribeOn ? "the desk itself" : "", this.greymarchCraftOn ? "the crafting panel" : "", this.greymarchForgeOn ? "the forge window" : ""].filter(Boolean).join(", ") + " is marked open");
            return;
        }
        this.greymarchLog("scribe: opened");
        this.greymarchScribeOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchScribeToPage("show", true);
    }
    greymarchScribeHide(): any {
        if (!this.greymarchScribeOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchScribeOn = false;
        this.greymarchScribeToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchVampMenuOn); }
    }
    // ---- THE CRAFTING PANEL. The page is Platform/UI/greymarch-craft.html; the SERVER decides everything (gamemode/src/craftsys.js), which opens it when a station is used
    // ({ customPacketType: "greymarchCraftOpen", station, title }; the Charcoal Kiln always, every other station only while greymarch-data/crafting.on exists).
    greymarchCraftToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(CRAFT_SCRIPT + "window.__gmCraftRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the crafting panel: " + err);
        }
    }
    greymarchCraftShow(msg: any): any {
        if (this.greymarchCraftOn) { this.greymarchCraftToPage("show", msg); return; } // another station: the open panel lists its recipes
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchForgeOn) return; // not over the select screen or the other panels (the forge window included: closing a panel on top of it took its mouse away)
        this.greymarchLog("craft: opened at " + String((msg && msg.station) || "?"));
        this.greymarchCraftOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchCraftToPage("show", msg);
    }
    // ---- THE PROFESSION MINI GAMES. The page is Platform/UI/greymarch-minigame.html; the SERVER decides (gamemode minigames.js): it refuses the work, sends
    // { customPacketType: "greymarchMinigame", token, kind, level, target }, and after a win ({ greymarchMinigameDone, ok, target }) lets the next use of target
    // through, which this game makes at once (greymarchMiniActivateTick: target used again by the player). A loss shows the server's words.
    greymarchMiniToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(MINIGAME_SCRIPT + "window.__gmMiniRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the mini game: " + err);
        }
    }
    greymarchMiniShow(msg: any): any {
        if (this.greymarchScreenUp) return; // the select screen: the server lets the work through once it sees no window (or the player tries again)
        this.greymarchLog("minigame: " + String((msg && msg.kind) || "?") + " (level " + String((msg && msg.level) || 1) + ")");
        this.greymarchMiniOn = true;
        // keep (gamemode professions.js, the chopping block): the window stays up between one log and the next; the server's greymarchMinigameDone { keep: true }
        // says another is coming, anything else closes it, and with no next one within MINI_KEEP_MS it closes by itself (greymarchMiniActivateTick)
        this.greymarchMiniKeep = msg.keep === true; this.greymarchMiniKeptAt = 0;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchMiniToPage("show", { token: msg.token, kind: msg.kind, level: msg.level, quick: msg.quick === true, recipe: msg.recipe || null, animal: msg.animal || "", ore: msg.ore || "", keep: msg.keep === true }); // recipe: the Chef's dish and ingredients; animal: the Hunter's kill (its coat); ore: the Miner's vein
        // the character acts it out: kneeling over the body to skin it (the emote wheel's "Search a body"; the other work has the game's own animation already:
        // the forge, the pot, the chopping block, the vein)
        // the server names it (msg.emote: examine for mining, searchbody for skinning); an older server: skinning kneels
        var mEm = emoteMod.emoteById(typeof msg.emote === "string" ? msg.emote : msg.kind === "skin" ? "searchbody" : "");
        if (mEm && mEm.kind !== "face") { this.greymarchEmotePlayWanted = { id: mEm.id, at: Date.now() }; this.greymarchMiniActing = true; }
    }
    greymarchMiniHide(): any {
        if (this.greymarchMiniActing && !this.greymarchMiniOn) { this.greymarchMiniActing = false; this.greymarchEmoteStopWanted = Date.now(); }
        this.greymarchMiniKeep = false; this.greymarchMiniKeptAt = 0;
        if (!this.greymarchMiniOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchMiniOn = false;
        this.greymarchMiniToPage("hide", true);
        if (!this.greymarchScreenUp && !this.greymarchPanelHasKeys()) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchVampMenuOn || !!this.greymarchLedgerOn || !!this.greymarchScribeOn); }
    }
    greymarchMiniSend(type: string, body: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify(Object.assign({ customPacketType: type }, body)) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchMiniDone(msg: any): any {
        if (msg && msg.keep === true && this.greymarchMiniOn && this.greymarchMiniKeep) { this.greymarchMiniKeptAt = Date.now(); return; } // the next log is coming: the window stays up (the page shows how this one went)
        this.greymarchMiniHide();
        var acted = !!this.greymarchMiniActing;
        if (acted) { this.greymarchMiniActing = false; this.greymarchEmoteStopWanted = Date.now(); } // up again before the body menu opens
        if (msg && msg.ok === true && Number(msg.target) > 0) { this.greymarchMiniActivate = { target: Number(msg.target) >>> 0, at: Date.now() + (acted ? 600 : 0) }; return; }
        if (msg && msg.text) { try { this.sp.Debug.notification(String(msg.text)); } catch (e) { /* the page showed it already */ } }
    }
    // the thing the player won a mini game for is used again, from the update phase (Papyrus calls)
    // THE CLICK GUARD (2026-10-26, the owner: closing the guard ledger or the scribe's desk with its X drew the sword or raised the fists). When a window that
    // held the mouse closes, the game gets the mouse back with that same click still to come, and takes it for a swing. So for CLICK_GUARD_MS after a window
    // closes, the player's fighting controls (attack, draw a weapon) are switched off, from the update phase, and then on again unless something else of
    // ours holds them (a meal being eaten, a staff freeze).
    greymarchClickGuard(): any { this.greymarchClickGuardUntil = Date.now() + CLICK_GUARD_MS; this.greymarchClickGuardWanted = true; }
    greymarchClickGuardTick(): any {
        var sp = this.sp, now = Date.now();
        if (this.greymarchClickGuardWanted && !this.greymarchClickGuardOn) {
            this.greymarchClickGuardWanted = false;
            try { sp.Game.disablePlayerControls(false, true, false, false, false, false, false, false, 0); this.greymarchClickGuardOn = true; } catch (e) { /* no guard this time */ }
        }
        if (this.greymarchClickGuardOn && now >= (this.greymarchClickGuardUntil || 0)) {
            this.greymarchClickGuardOn = false; this.greymarchClickGuardWanted = false;
            var fx = this.greymarchFxHave;
            if (!this.greymarchMealLocked && !(fx && fx.frozen)) { try { sp.Game.enablePlayerControls(false, true, false, false, false, false, false, false, 0); } catch (e) { /* the next frame */ } }
        }
    }
    greymarchMiniActivateTick(): any {
        // a window kept up between logs with no next one in time: closed, so it never holds the keys for nothing
        if (this.greymarchMiniOn && this.greymarchMiniKeptAt && Date.now() - this.greymarchMiniKeptAt > MINI_KEEP_MS) { this.greymarchLog("minigame: no next one, the window closes"); this.greymarchMiniHide(); }
        var want = this.greymarchMiniActivate;
        if (!want || Date.now() < want.at) return; // a moment after the kneel ends
        this.greymarchMiniActivate = null;
        if (Date.now() - want.at > 5000) return;
        try {
            var sp = this.sp;
            var localId = want.target >= 0xff000000 ? misc.remoteIdToLocalId(want.target) : want.target;
            var ref = localId ? sp.ObjectReference.from(sp.Game.getFormEx(localId)) : null;
            var me = sp.Game.getPlayer();
            if (ref && me) { ref.activate(me, false); this.greymarchLog("minigame: won, " + (localId >>> 0).toString(16) + " used again"); }
            else this.greymarchLog("minigame: won, but " + (want.target >>> 0).toString(16) + " is not here any more");
        } catch (err) { this.greymarchLog("minigame: could not use it again: " + err); }
    }
    greymarchCraftHide(): any {
        if (!this.greymarchCraftOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchCraftOn = false;
        this.greymarchCraftToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchVampMenuOn || !!this.greymarchLedgerOn || !!this.greymarchScribeOn || this.greymarchScribeOn || !!this.greymarchForgeOn); }
    }
    // ---- THE GREYMARCH FORGE WINDOW. The page is Platform/UI/greymarch-forge.html; the SERVER decides everything (gamemode/src/forgemenu.js). Using a forge, the server
    // keeps the game's menu shut and opens this ({ customPacketType: "greymarchForgeOpen" }) for a game that said it has it ("greymarchForgeReady", sent on entering the world).
    greymarchForgeToPage(fn: any, arg: any): any {
        var json = JSON.stringify({ fn: fn, arg: arg }).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        try {
            this.sp.browser.executeJavaScript(FORGE_SCRIPT + "window.__gmForgeRun(" + json + ");");
        } catch (err) {
            this.sp.printConsole("[greymarch] could not reach the forge window: " + err);
        }
    }
    // THE STATION WINDOWS (gamemode/src/stationmenu.js) are this window too: { customPacketType: "greymarchForgeOpen", station: "smelter" | "tan" | "cookpot" ..., title, ref, anim }
    // opens the same page in that station's mode, and the player is put at the station's furniture marker doing its own animation (anim: IdleSmelterEnter ...).
    greymarchForgeShow(msg?: any): any {
        var station = (msg && typeof msg.station === "string" && msg.station) || "forge";
        var page = { station: station, title: (msg && typeof msg.title === "string" && msg.title) || (station === "forge" ? "Forge" : "") };
        if (this.greymarchForgeOn) { this.greymarchForgeToPage("show", page); return; }
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn) return; // not over the select screen or the other panels
        this.greymarchLog(station === "forge" ? "forge: opened" : "station window: opened, " + station);
        this.greymarchForgeOn = true;
        this.greymarchForgeStation = station;
        if (station === "forge") this.greymarchForgeAnimStart(msg && msg.forge);
        else this.greymarchForgeAnimWant = { on: true, forge: Number(msg && msg.ref) >>> 0, station: station, anim: (msg && typeof msg.anim === "string" && /^Idle[A-Za-z]{1,40}$/.test(msg.anim)) ? msg.anim : "", stand: (msg && Array.isArray(msg.stand) && msg.stand.length === 3 && msg.stand.every((v: any) => typeof v === "number" && isFinite(v) && Math.abs(v) <= 400)) ? msg.stand : null };
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchForgeToPage("show", page);
    }
    greymarchForgeHide(): any {
        if (!this.greymarchForgeOn) return;
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchForgeOn = false;
        this.greymarchForgeToPage("hide", true);
        this.greymarchForgeAnimEnd();
        this.greymarchForgePreviewWant = ""; // the preview goes with the window
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchEmoteOn || !!this.greymarchGuardsHud || !!this.greymarchProfOn || !!this.greymarchChanceryOn || !!this.greymarchVampMenuOn || !!this.greymarchLedgerOn || !!this.greymarchScribeOn || this.greymarchScribeOn || !!this.greymarchCraftOn); }
    }
    // At the forge like the game's own menu: the smith turns to the forge and does the forge's hammering (the game's IdleBlackSmithForgeEnter, what the
    // forge furniture plays) while the window is open, and steps out of it (IdleChairExitStart, the forge's exit) when it closes. SkyMP passes the player's
    // animation events on, so the others see the smith at work. The window holds the keyboard, so the smith cannot walk off mid-swing.
    // The game's functions cannot be called from a packet or a browser message (SkyrimPlatform: "can't be called in this context"), so open and close
    // only ask; the turn and the animation happen on the next frame (greymarchForgeTick, from the update loop).
    greymarchForgeAnimStart(forgeId: any): any { this.greymarchForgeAnimWant = { on: true, forge: Number(forgeId) >>> 0 }; }
    greymarchForgeAnimEnd(): any { this.greymarchForgeAnimWant = { on: false }; }
    // a station (not the forge): the player is put where the game puts a worker (the furniture's own marker, read by GreymarchCamera.dll 1.4: GetFurnitureMarker), facing
    // its way, and its own animation plays a moment later. A station without a marker or an animation (the kiln, a loom, a mill) only opens the window.
    greymarchStationAnimStart(want: any, now: number): any {
        var sp = this.sp;
        var player = sp.Game.getPlayer(); if (!player) return;
        var id = want.forge >>> 0;
        var local = id >= 0xff000000 ? misc.remoteIdToLocalId(id) : id;
        var ref = local ? sp.ObjectReference.from(sp.Game.getFormEx(local)) : null;
        this.greymarchForgeAnimExit = "";
        if (!ref || !want.anim) { this.greymarchLog("station window: " + want.station + ", no animation here"); return; }
        var m: any = [];
        try { for (var k = 0; k < 4; k++) m.push(Number(sp.callNative("GreymarchCam", "GetFurnitureMarker", undefined, ref, k))); } catch (e) { m = []; }
        var fx0 = ref.getPositionX(), fy0 = ref.getPositionY(), fz0 = ref.getPositionZ();
        if ((m.length < 4 || !(m[0] > -99990) || !isFinite(m[0] + m[1] + m[2] + m[3])) && want.stand) {
            // no marker in the mesh (the spinning wheels): the spot the server gives, in the furniture's own frame (right, forward, turn), turned with it
            var a = ref.getAngleZ() * Math.PI / 180, sx = want.stand[0], sy = want.stand[1];
            m = [fx0 + sx * Math.cos(a) + sy * Math.sin(a), fy0 - sx * Math.sin(a) + sy * Math.cos(a), fz0, a + want.stand[2] * Math.PI / 180];
        }
        if (m.length < 4 || !(m[0] > -99990) || !isFinite(m[0] + m[1] + m[2] + m[3])) { this.greymarchLog("station window: " + want.station + ", no furniture marker (GreymarchCamera.dll older than 1.4?), no animation"); return; }
        player.moveTo(ref, m[0] - fx0, m[1] - fy0, m[2] - fz0, false); // MoveTo: SetPosition on the player does nothing (the forge's log)
        try { player.setAngle(0, 0, m[3] * 180 / Math.PI); } catch (e) { /* facing as they were */ }
        this.greymarchForgeAt = { fx: m[0], fy: m[1], fz: m[2], fa: m[3] * 180 / Math.PI, at: now + 1500 }; // where the worker is a moment later goes to the log
        this.greymarchLog("station window: " + want.station + " at " + id.toString(16) + ", the marker " + Math.round(m[0] - fx0) + "," + Math.round(m[1] - fy0) + "," + Math.round(m[2] - fz0) + " from it, facing " + Math.round(m[3] * 180 / Math.PI));
        this.greymarchForgeAnimEvent = want.anim;
        this.greymarchForgeAnimExit = want.anim.replace(/Enter$/, "Exit"); // IdleSmelterExit, IdleTanningExit ... (the game's own)
        this.greymarchForgeAnimGo = now + 350;
        this.greymarchForgeAnim = true; this.greymarchForgeAnimSafety = 0;
    }
    greymarchForgeTick(now: number): any {
        var sp = this.sp, want = this.greymarchForgeAnimWant;
        if (want) {
            this.greymarchForgeAnimWant = null;
            if (want.on && want.station && want.station !== "forge") {
                try { this.greymarchStationAnimStart(want, now); } catch (e) { this.greymarchLog("station window: no animation (" + e + ")"); }
            } else if (want.on) {
                this.greymarchForgeAnimEvent = "IdleBlackSmithForgeEnter"; this.greymarchForgeAnimExit = "";
                try {
                    var player = sp.Game.getPlayer();
                    if (player) {
                        var id = want.forge;
                        var local = id >= 0xff000000 ? misc.remoteIdToLocalId(id) : id;
                        var ref = local ? sp.ObjectReference.from(sp.Game.getFormEx(local)) : null;
                        // where the game itself puts a smith: the forge's furniture marker is at the forge's origin, facing its way (BlacksmithForgeMarker.nif,
                        // ...WR.nif: heading 0; its origin is the floor: a smith standing there is 1 unit above it). SetPosition on the player did nothing
                        // (the log showed the smith where they were), so MoveTo, the game's own teleport onto an object, with its rotation; the hammering
                        // starts once the smith is there (greymarchForgeAnimGo, a moment later).
                        if (ref) {
                            var fx0 = ref.getPositionX(), fy0 = ref.getPositionY(), fz0 = ref.getPositionZ(), fa = ref.getAngleZ();
                            var bx = player.getPositionX(), by = player.getPositionY(), bz = player.getPositionZ();
                            player.moveTo(ref, 0, 0, 0, true);
                            try { sp.callNative("GreymarchCam", "SetForge", undefined, ref); } catch (e) { /* an older GreymarchCamera.dll: no bellows */ } // the bellows follow the smith's pulls (GreymarchCamera.dll 1.2)
                            this.greymarchForgeAt = { fx: fx0, fy: fy0, fz: fz0, fa: fa, at: now + 1500 }; // where the smith is a moment later goes to the log
                            this.greymarchLog("forge: at " + id.toString(16) + " (" + Math.round(fx0) + "," + Math.round(fy0) + "," + Math.round(fz0) + " angle " + Math.round(fa) + "), the smith was " + Math.round(bx - fx0) + "," + Math.round(by - fy0) + "," + Math.round(bz - fz0) + " from it");
                        }
                        this.greymarchForgeAnimGo = now + (ref ? 350 : 0);
                        this.greymarchForgeAnim = true; this.greymarchForgeAnimSafety = 0;
                    }
                } catch (e) { this.greymarchLog("forge: no forge animation (" + e + ")"); }
            } else if (this.greymarchForgeAnim) {
                this.greymarchForgeAnim = false;
                try { sp.callNative("GreymarchCam", "SetForge", undefined, null); } catch (e) { /* no plugin */ }
                try { var pl = sp.Game.getPlayer(); if (pl) sp.Debug.sendAnimationEvent(pl, this.greymarchForgeAnimExit || "IdleChairExitStart"); } catch (e) { /* the next movement ends it */ } // a station: its own exit
                this.greymarchForgeAnimSafety = now + 2500; // and to be sure the smith is free: the default state once the exit has played
            }
        }
        if (this.greymarchForgeAnimGo && now >= this.greymarchForgeAnimGo) {
            this.greymarchForgeAnimGo = 0;
            if (this.greymarchForgeAnim) { try { var ps = sp.Game.getPlayer(); if (ps) sp.Debug.sendAnimationEvent(ps, this.greymarchForgeAnimEvent || "IdleBlackSmithForgeEnter"); } catch (e) { this.greymarchLog("forge: no forge animation (" + e + ")"); } }
        }
        // the game's own crafting menu must never be open under the forge window (it took the pointer, and its E Create made things the window would refuse):
        // closed at once through GreymarchCamera.dll 1.3 (CloseMenu), noted in the log
        if (this.greymarchForgeOn && now >= (this.greymarchForgeMenuNext || 0)) {
            this.greymarchForgeMenuNext = now + 250;
            try {
                if (sp.Ui.isMenuOpen("Crafting Menu")) {
                    var shut = false; try { shut = !!sp.callNative("GreymarchCam", "CloseMenu", undefined, "Crafting Menu"); } catch (e) { shut = false; }
                    this.greymarchForgeMenuSaid = (this.greymarchForgeMenuSaid || 0) + 1;
                    if (this.greymarchForgeMenuSaid <= 5) this.greymarchLog("forge: the game's own crafting menu was open under the forge window; " + (shut ? "closed it" : "could not close it (GreymarchCamera.dll older than 1.3)"));
                }
            } catch (e) { /* next time */ }
        }
        // the forge window holds the mouse and keyboard while it is open: SkyMP takes them away when it rebuilds the player's body (skympClient.ts
        // setFocused(false), which moving onto the forge can cause), so they are given back whenever they are lost, like the character select (greymarchSelectFocusGuard)
        if (this.greymarchForgeOn && now >= (this.greymarchForgeFocusNext || 0)) {
            this.greymarchForgeFocusNext = now + 200;
            try { if (!sp.browser.isFocused()) { sp.browser.setVisible(true); sp.browser.setFocused(true); this.greymarchForgeRefocused = (this.greymarchForgeRefocused || 0) + 1; if (this.greymarchForgeRefocused <= 5) this.greymarchLog("forge: the window lost the mouse and keyboard, took them back"); } } catch (e) { /* next frame */ }
        }
        var fa2 = this.greymarchForgeAt;
        if (fa2 && now >= fa2.at) {
            this.greymarchForgeAt = null;
            try { var pp = sp.Game.getPlayer(); this.greymarchLog("forge: the smith stands " + Math.round(pp.getPositionX() - fa2.fx) + "," + Math.round(pp.getPositionY() - fa2.fy) + "," + Math.round(pp.getPositionZ() - fa2.fz) + " from the forge, angle " + Math.round(pp.getAngleZ() - fa2.fa) + " from its"); } catch (e) { /* only a log line */ }
        }
        if (!this.greymarchForgeAnimSafety || now < this.greymarchForgeAnimSafety) return;
        this.greymarchForgeAnimSafety = 0;
        if (this.greymarchForgeAnim) return; // opened again meanwhile
        try { var p2 = sp.Game.getPlayer(); if (p2) sp.Debug.sendAnimationEvent(p2, "IdleForceDefaultState"); } catch (e) { /* nothing to free */ }
    }
    // THE DISPLAY (back 2026-10-26, the owner: smiths show customers the piece). The piece picked in the forge window, as a copy in this game only, floating
    // on the right of the screen in front of the camera and slowly turning, like the game's own crafting menu. Before (removed 2026-10-25) copies were left
    // behind and picked up: free items. Now each copy is guarded:
    //  - it cannot be used or picked up: the game's BlockActivation, and keyframed (it does not fall, it cannot be grabbed or knocked away);
    //  - it lives only while the forge window is open and stays at the smith: the window closed, a new piece picked, too far from the player or the
    //    frame's move failing (a cell change) and it is removed;
    //  - it is never forgotten: every copy made is kept by its form id and base, and checked every 2 s until the game no longer has it (a copy in a cell
    //    that unloaded is deleted when the cell is back). A form id the game gave to something else since (the base differs) is let go, never touched.
    //  - ONLY BY ITS FORM ID, fetched again on every frame: a game object SkyrimPlatform hands over is good for the frame it was fetched in only ("Invalid
    //    _skyrimPlatform_indexInPool" on the next, 2026-10-26: the display was removed at once, and the old version's deletes through such a handle failed,
    //    which is how its copies were left on the floor). A copy whose id cannot be read is deleted in the frame it was made.
    // THE BARBER'S REFUSAL (2026-10-29, the owner: "I was able to change my race and my sex, even though it said it would revert"). SkyMP writes a new look onto
    // the player's own character (remoteServer.ts applyAppearanceToPlayer: the base's race, sex, head parts and tints), but the body keeps the race the race menu
    // gave it: Actor.SetRace is never called for the player's own body. So the old look is put back as the werewolf's way back does it: ONE real SetRace to the
    // look's race (the body is rebuilt for it), then the look itself (sex, head parts, tints) with a 3D rebuild. Not while a creature form or the werewolf is on.
    greymarchOwnLookTick(): any {
        var look = this.greymarchOwnLookWant;
        if (!look || this.greymarchShapeOn || this.greymarchWolfOn) return;
        var sp = this.sp;
        var player = null; try { player = sp.Game.getPlayer(); } catch (e) { player = null; }
        if (!player || !player.is3DLoaded()) return;
        try { if (sp.Ui.isMenuOpen("RaceSex Menu")) return; } catch (e) { /* asked again next frame */ }
        this.greymarchOwnLookWant = null;
        var step = "race";
        try {
            // ORDER (2026-10-30, the owner: "I still walk like a woman"): the race was set back BEFORE the character's sex, so the body was rebuilt as the other sex and
            // got its walk. Now: the look first (the character's sex, race, head parts), then the body is rebuilt by two real race changes (another race and back,
            // since a SetRace to the race it has changes nothing), then the look again for the face on the new body
            var race = sp.Race.from(sp.Game.getFormEx(look.raceId));
            this.greymarchOwnLookRebuild = false;
            step = "sex"; appearanceMod.applyAppearanceToPlayer(look);
            var other = sp.Race.from(sp.Game.getFormEx((look.raceId >>> 0) === 0x13744 ? 0x13746 : 0x13744)); // Imperial, or Nord for an Imperial
            step = "rebuild";
            if (race) { if (other) player.setRace(other); player.setRace(race); this.greymarchLog("barber: the body rebuilt as race " + (look.raceId >>> 0).toString(16) + ", " + (look.isFemale ? "female" : "male")); }
            step = "look"; appearanceMod.applyAppearanceToPlayer(look);
            this.greymarchLog("barber: the old look put back on this body");
        } catch (e) { this.greymarchLog("barber: the old look could not be put back (" + step + "): " + e); }
    }
    // THE BOSS CHEST SHINES (2026-10-29, the owner: "so it's easy for players to find"): the server names the chest ("<id>:<plugin>", "" none) while its loot
    // waits; the game's AzuraGoodCrystal shader (Azura's Star's glow, Skyrim.esm 0B6BFA) plays on it once its 3D is there, again if the 3D came back, and stops
    // when the server says so. Checked once a second.
    greymarchChestGlowRef(key: any): any {
        var m = /^([0-9a-f]{1,8}):([^:]{1,64})$/i.exec(String(key || ""));
        if (!m) return null;
        try { var f = this.sp.Game.getFormFromFile(parseInt(m[1], 16), m[2]); return f ? this.sp.ObjectReference.from(f) : null; } catch (e) { return null; }
    }
    greymarchChestGlowTick(now: number): any {
        if (now - (this.greymarchChestGlowAt || 0) < 1000) return;
        this.greymarchChestGlowAt = now;
        var sp = this.sp, want = this.greymarchChestGlowWant || "", on = this.greymarchChestGlowOn || "";
        var shader: any = null; try { shader = sp.EffectShader.from(sp.Game.getFormEx(0x0b6bfa)); } catch (e) { shader = null; }
        if (!shader) return;
        var ref = want ? this.greymarchChestGlowRef(want) : null;
        var loaded = false; try { loaded = !!(ref && ref.is3DLoaded()); } catch (e) { loaded = false; }
        if (on && (on !== want || !loaded)) { // not wanted any more, or its 3D went (it plays again once it is back)
            var old = this.greymarchChestGlowRef(on);
            try { if (old) shader.stop(old); } catch (e) { /* gone with its 3D */ }
            this.greymarchChestGlowOn = ""; on = "";
        }
        if (want && loaded && !on) {
            try { shader.play(ref, -1); this.greymarchChestGlowOn = want; this.greymarchLog("dungeon: the boss chest shines (" + want + ")"); } catch (e) { this.greymarchLog("dungeon: the boss chest could not shine (" + e + ")"); this.greymarchChestGlowWant = ""; }
        }
    }
    greymarchForgePreviewTick(now: number): any {
        var sp = this.sp, want = this.greymarchForgePreviewWant;
        if (!this.greymarchForgeOn) want = this.greymarchForgeGhostId ? "" : null; // no window, no display
        if (want !== undefined && want !== null) {
            this.greymarchForgePreviewWant = null;
            this.greymarchForgeGhostDrop();
            this.greymarchForgeGhostDiag = 0; if (want) this.greymarchLog("forge: display asked for " + want);
            var m = /^([0-9a-f]{1,8}):([^:]{1,64})$/i.exec(want);
            if (m && this.greymarchForgeOn) {
                try {
                    var base = sp.Game.getFormFromFile(parseInt(m[1], 16), m[2]);
                    var player = sp.Game.getPlayer();
                    var g = base && player ? player.placeAtMe(base, 1, false, false) : null;
                    var id = 0, baseId = 0;
                    if (g) {
                        try { id = g.getFormID() >>> 0; } catch (e) { id = 0; }
                        try { baseId = base.getFormID() >>> 0; } catch (e) { baseId = 0; }
                        if (!id || !baseId) { try { g.disable(false); } catch (e) { /* - */ } try { g.delete(); } catch (e) { /* - */ } g = null; this.greymarchLog("forge: display not kept (no form id)"); }
                    }
                    if (g) {
                        (this.greymarchForgeGhostIds = this.greymarchForgeGhostIds || []).push({ id: id, base: baseId });
                        try { g.blockActivation(true); } catch (e) { /* the window holds the keyboard meanwhile */ }
                        try { g.setMotionType(4, false); } catch (e) { /* again once its 3D is there (greymarchForgePreviewTick) */ }
                        // a weapon or a piece of armour is made lying down (how it rests when dropped): stood up, so it can be seen
                        var isArmor = false, upright = false; try { isArmor = !!sp.Armor.from(base); } catch (e) { isArmor = false; }
                        try { upright = isArmor || !!sp.Weapon.from(base); } catch (e) { upright = isArmor; }
                        this.greymarchForgeGhostYaw = 0; this.greymarchForgeGhostPitch = 0; this.greymarchForgeGhostZoom = 0; this.greymarchForgeGhostLook = ""; // a new piece starts from the front view
                        this.greymarchForgeGhostId = id; this.greymarchForgeGhostBase = baseId; this.greymarchForgeGhostSince = now;
                        this.greymarchLog("forge: display made " + id.toString(16) + " (base " + baseId.toString(16) + (upright ? ", stood up" : "") + ")");
                        this.greymarchForgeLightMake(); this.greymarchForgeGhostTilt = upright ? -90 : 0;
                        this.greymarchForgeGhostAt = null; this.greymarchForgeGhostTurnNext = 0; this.greymarchForgeGhostReady = false; this.greymarchForgeGhostCheck = 0; this.greymarchForgeGhostPlacedAt = 0;
                    }
                } catch (e) { this.greymarchLog("forge: no display (" + e + ")"); }
            }
        }
        this.greymarchForgeGhostSweep(now);
        // Placed ONCE (SetPosition every frame redraws the piece: it flickered, 2026-10-26) and again only if the spot moves (the camera turned);
        // it turns with the game's own smooth movement (TranslateTo, to the same spot), asked again every second.
        if (!this.greymarchForgeGhostId) return;
        var ghost = this.greymarchForgeGhostRef(this.greymarchForgeGhostId, this.greymarchForgeGhostBase);
        if (!ghost) { this.greymarchForgeGhostSay("the game no longer has it"); this.greymarchForgeGhostDrop(); return; } // its lamp goes with it // gone (the sweep lets it go)
        try {
            var pl = sp.Game.getPlayer();
            var c: number[] = [];
            try { for (var i = 0; i < 6; i++) c.push(Number(sp.callNative("GreymarchCam", "GetCamera", undefined, i))); } catch (e) { c = []; }
            var px: number, py: number, pz: number, fx: number, fy: number, fz: number;
            if (c.length === 6 && c.every(function (n) { return isFinite(n); }) && Math.hypot(c[3], c[4], c[5]) > 0.01) {
                var len = Math.hypot(c[3], c[4], c[5]); px = c[0]; py = c[1]; pz = c[2]; fx = c[3] / len; fy = c[4] / len; fz = c[5] / len;
            } else { // no camera plugin: from the player's eyes, the way they face
                var a = pl.getAngleZ() * Math.PI / 180;
                px = pl.getPositionX(); py = pl.getPositionY(); pz = pl.getPositionZ() + 110; fx = Math.sin(a); fy = Math.cos(a); fz = 0;
            }
            var hl = Math.hypot(fx, fy) || 1, rx = fy / hl, ry = -fx / hl; // the camera's right, level
            var d = 90 + (this.greymarchForgeGhostZoom || 0) * 10; // the wheel: 50 (close) to 150 (far)
            var x = px + fx * d + rx * d * 0.45, y = py + fy * d + ry * d * 0.45, z = pz + fz * d - 6;
            if (Math.hypot(x - pl.getPositionX(), y - pl.getPositionY(), z - pl.getPositionZ()) > 1500) throw new Error("too far from the smith");
            var tilt = this.greymarchForgeGhostTilt || 0, at = this.greymarchForgeGhostAt;
            // what happens to it, logged for the first 6 seconds (twice a second): where it is, where it should be, the camera, the smith
            var dn = this.greymarchForgeGhostDiag || 0;
            if (dn < 12 && now >= (this.greymarchForgeGhostDiagAt || 0)) {
                this.greymarchForgeGhostDiag = dn + 1; this.greymarchForgeGhostDiagAt = now + 500;
                var r0 = function (n: number) { return Math.round(n); };
                var st = ""; try { st = "at " + [ghost.getPositionX(), ghost.getPositionY(), ghost.getPositionZ()].map(r0).join(",") + " 3D " + ghost.is3DLoaded() + " on " + !ghost.isDisabled(); } catch (e) { st = "? (" + e + ")"; }
                this.greymarchLog("forge: display " + st + " | spot " + [x, y, z].map(r0).join(",") + " | camera " + [px, py, pz].map(r0).join(",") + " looking " + [fx, fy, fz].map(function (n: number) { return n.toFixed(2); }).join(",") + (c.length === 6 ? "" : " (no plugin)") + " | smith " + [pl.getPositionX(), pl.getPositionY(), pl.getPositionZ()].map(r0).join(",") + " | ready " + !!this.greymarchForgeGhostReady);
            }
            var face = (((Math.atan2(-fx, -fy) * 180 / Math.PI) % 360) + 360) % 360; // towards the camera (0 = north, like the game's Z angle)
            // PLACED ONCE, THEN LEFT TO LOAD (2026-10-26, from the log: SetPosition restarts the piece's 3D, so placing it every frame while waiting kept
            // it from ever loading: "3D false" for 15 s, nothing to see). Placed again only if it has not loaded after 3 s. Once its 3D is there it is
            // keyframed (asked earlier the game ignores it and the piece falls); every move after that is the game's smooth movement (TranslateTo),
            // which keeps the 3D.
            if (!this.greymarchForgeGhostReady) {
                var loaded = false; try { loaded = ghost.is3DLoaded() === true; } catch (e) { loaded = false; }
                if (!this.greymarchForgeGhostPlacedAt || (!loaded && now - this.greymarchForgeGhostPlacedAt > 3000)) {
                    ghost.setAngle(tilt, 0, face);
                    ghost.setPosition(x, y, z);
                    this.greymarchForgeGhostPlacedAt = now; this.greymarchForgeGhostAt = [x, y, z];
                    this.greymarchForgeLightMove(x, y, z, fx, fy);
                    return;
                }
                if (!loaded) return;
                try { ghost.setMotionType(4, false); } catch (e) { /* checked below: a piece that drops is put back */ }
                this.greymarchForgeGhostNoCollision(); // the smith cannot bump into it or push themselves off it (2026-10-26, the owner)
                this.greymarchForgeGhostReady = true; at = this.greymarchForgeGhostAt || [x, y, z];
                this.greymarchForgeGhostTurnNext = now + 100;
            }
            // a piece that moved off its spot anyway (fell, was pushed): keyframed again and moved back fast
            if (now >= (this.greymarchForgeGhostCheck || 0)) {
                this.greymarchForgeGhostCheck = now + 200;
                var off = 0; try { off = Math.hypot(ghost.getPositionX() - at[0], ghost.getPositionY() - at[1], ghost.getPositionZ() - at[2]); } catch (e) { off = 0; }
                if (off > 6) {
                    try { ghost.setMotionType(4, false); } catch (e) { /* moved back anyway */ }
                    this.greymarchForgeGhostNoCollision();
                    this.greymarchForgeGhostLook = ""; // moved back to the spot and the angle below
                    this.greymarchForgeGhostTurnNext = 0;
                }
            }
            // the camera turned or the wheel moved it: to the new spot; the smith turned it: to the new angle. Both with the smooth movement, fast, at most 30 times
            // a second. It stands still otherwise (2026-10-26, the owner: examined with the mouse, no turning by itself).
            var zoomed = (this.greymarchForgeGhostZoomAt || 0) !== (this.greymarchForgeGhostZoom || 0);
            if (zoomed || Math.hypot(x - at[0], y - at[1], z - at[2]) > 12) { this.greymarchForgeGhostAt = [x, y, z]; at = this.greymarchForgeGhostAt; this.greymarchForgeGhostZoomAt = this.greymarchForgeGhostZoom || 0; this.greymarchForgeLightMove(x, y, z, fx, fy); }
            var ax = tilt + (this.greymarchForgeGhostPitch || 0), az = face + (this.greymarchForgeGhostYaw || 0);
            var look = at.map(function (n: number) { return Math.round(n); }).join(",") + "," + Math.round(ax) + "," + Math.round(az);
            if (look !== this.greymarchForgeGhostLook && now >= (this.greymarchForgeGhostTurnNext || 0)) {
                this.greymarchForgeGhostLook = look; this.greymarchForgeGhostTurnNext = now + 33;
                this.greymarchForgeGhostCheck = now + 700; // moving on purpose: not mistaken for a drop
                var short = function (want: number, cur: number) { if (!isFinite(cur)) return want; return cur + (((((want - cur) % 360) + 540) % 360) - 180); }; // the short way round
                var curX = NaN, curZ = NaN; try { curX = Number(ghost.getAngleX()); curZ = Number(ghost.getAngleZ()); } catch (e) { /* from the wanted angles */ }
                // turned at a steady 600 degrees a second towards where the mouse put it (2026-10-26, the owner: snapping there 30 times a second was jerky)
                ghost.translateTo(at[0], at[1], at[2], short(ax, curX), 0, short(az, curZ), 500, 600);
            }
        } catch (e) { this.greymarchForgeGhostSay(String(e)); this.greymarchForgeGhostDrop(); }
    }
    // the page's drag (dx, dy in pixels: left / right turns it round, up / down tips it), the wheel (zoom: +1 farther, -1 closer) or a double-click (reset)
    greymarchForgeTurn(data: any): any {
        if (!this.greymarchForgeOn || !this.greymarchForgeGhostId) return;
        if (data.reset === true) { this.greymarchForgeGhostYaw = 0; this.greymarchForgeGhostPitch = 0; this.greymarchForgeGhostZoom = 0; return; }
        var dx = Number(data.dx), dy = Number(data.dy), zoom = Number(data.zoom);
        if (isFinite(dx) && Math.abs(dx) <= 4000) this.greymarchForgeGhostYaw = (((this.greymarchForgeGhostYaw || 0) - dx * 0.5) % 360 + 360) % 360;
        if (isFinite(dy) && Math.abs(dy) <= 4000) this.greymarchForgeGhostPitch = (((this.greymarchForgeGhostPitch || 0) + dy * 0.4) % 360 + 360) % 360; // all the way round (2026-10-26, the owner: a piece facing away could not be turned to the smith)
        if (zoom === 1 || zoom === -1) this.greymarchForgeGhostZoom = Math.max(-4, Math.min(6, (this.greymarchForgeGhostZoom || 0) + zoom));
    }
    // NOTHING COLLIDES WITH THE SHOWN COPY: its 3D on the game's non-collidable layer (15) with powerofthree's Papyrus Extender (a required mod:
    // PO3_SKSEFunctions.SetCollisionLayer(akRef, asNodeName, aiCollisionLayer), "" = the whole piece). SkyrimPlatform's setCollision did nothing here
    // (it is for actors): the smith still pushed themselves on the piece (2026-10-26). Needs the 3D, so asked once it is loaded and when it is put back.
    greymarchForgeGhostNoCollision(): any {
        var id = this.greymarchForgeGhostId; if (!id) return;
        var ref = this.greymarchForgeGhostRef(id, this.greymarchForgeGhostBase); if (!ref) return;
        try { this.sp.callNative("PO3_SKSEFunctions", "SetCollisionLayer", undefined, ref, "", 15); }
        catch (e) { if (!this.greymarchForgeGhostCollSaid) { this.greymarchForgeGhostCollSaid = true; this.greymarchLog("forge: display collision could not be switched off: " + e); } }
    }
    // A LAMP FOR THE DISPLAY (2026-10-26, the owner: at night the piece could hardly be seen). The game's own shadowless, steady, near-white light
    // (Skyrim.esm DefaultSunlight01NS_NotPortalStrict, 256 units), in this game only, between the smith and the piece and a little above. Kept and
    // removed exactly like the copy: by its form id and base, in the same list, swept until the game no longer has it.
    greymarchForgeLightMake(): any {
        var sp = this.sp;
        try {
            var base = sp.Game.getFormFromFile(0x5eae2, "Skyrim.esm"), player = sp.Game.getPlayer();
            var l = base && player ? player.placeAtMe(base, 1, false, false) : null;
            if (!l) return;
            var id = 0, baseId = 0;
            try { id = l.getFormID() >>> 0; baseId = base.getFormID() >>> 0; } catch (e) { id = 0; }
            if (!id || !baseId) { try { l.disable(false); } catch (e) { /* - */ } try { l.delete(); } catch (e) { /* - */ } return; }
            (this.greymarchForgeGhostIds = this.greymarchForgeGhostIds || []).push({ id: id, base: baseId });
            this.greymarchForgeLightId = id; this.greymarchForgeLightBase = baseId;
        } catch (e) { if (!this.greymarchForgeLightSaid) { this.greymarchForgeLightSaid = true; this.greymarchLog("forge: no lamp for the display (" + e + ")"); } }
    }
    // 40 units from the piece towards the camera (level), 25 up
    greymarchForgeLightMove(x: number, y: number, z: number, fx: number, fy: number): any {
        var lid = this.greymarchForgeLightId; if (!lid) return;
        var l = this.greymarchForgeGhostRef(lid, this.greymarchForgeLightBase); if (!l) return;
        var hl = Math.hypot(fx, fy) || 1;
        try { l.setPosition(x - fx / hl * 40, y - fy / hl * 40, z + 25); } catch (e) { /* stays where it was */ }
    }
    greymarchForgeGhostSay(why: string): any { this.greymarchForgeGhostSaid = (this.greymarchForgeGhostSaid || 0) + 1; if (this.greymarchForgeGhostSaid <= 10) this.greymarchLog("forge: display removed (" + why + ")"); }
    // the copy with this form id, fetched now (good for this frame only), while it is still a copy of the same piece; otherwise null
    greymarchForgeGhostRef(id: number, base: number): any {
        var sp = this.sp, ref: any = null;
        try { var f = sp.Game.getFormEx(id); ref = f ? sp.ObjectReference.from(f) : null; } catch (x) { ref = null; }
        if (!ref) return null;
        try { var b = ref.getBaseObject(); if (!b || (b.getFormID() >>> 0) !== base) return null; } catch (x) { return null; }
        return ref;
    }
    // the shown copy goes (disabled and deleted); it stays in the list, so the sweep makes sure
    greymarchForgeGhostDrop(): any {
        var lid = this.greymarchForgeLightId; this.greymarchForgeLightId = 0;
        if (lid) { var l = this.greymarchForgeGhostRef(lid, this.greymarchForgeLightBase); if (l) { try { l.disable(false); } catch (e) { /* the sweep */ } try { l.delete(); } catch (e) { /* the sweep */ } } this.greymarchForgeGhostNext = 0; }
        var id = this.greymarchForgeGhostId; this.greymarchForgeGhostId = 0;
        if (!id) return;
        var g = this.greymarchForgeGhostRef(id, this.greymarchForgeGhostBase);
        if (g) { try { g.disable(false); } catch (e) { /* the sweep */ } try { g.delete(); } catch (e) { /* the sweep */ } }
        this.greymarchForgeGhostNext = 0; // sweep at once
    }
    // every 2 s: each copy this game made that is not the one shown is disabled and deleted again, until the game no longer has its form
    greymarchForgeGhostSweep(now: number): any {
        var list = this.greymarchForgeGhostIds;
        if (!list || !list.length || now < (this.greymarchForgeGhostNext || 0)) return;
        this.greymarchForgeGhostNext = now + 2000;
        var shown = this.greymarchForgeGhostId, keep: any[] = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e.id === shown || (e.id === this.greymarchForgeLightId && e.id)) { keep.push(e); continue; }
            var ref = this.greymarchForgeGhostRef(e.id, e.base);
            if (!ref) continue; // the game no longer has it, or the id is something else now: never touched again
            try { ref.disable(false); } catch (x) { /* again next time */ }
            try { ref.delete(); } catch (x) { /* again next time */ }
            keep.push(e);
        }
        this.greymarchForgeGhostIds = keep.slice(-200);
    }
    // THE POINTER. SkyrimPlatform draws it through the game's Cursor Menu, which it opens when a page takes the focus (BrowserApiTilted SetFocused) and only
    // then: something that closes the Cursor Menu while a page has the focus (moving the player onto a forge, a game menu closing) leaves the window without a
    // pointer until the focus is dropped and taken again (F6 did that by hand). Four times a second, while one of our windows holds the mouse and keyboard and
    // has the focus but the Cursor Menu is not open, the focus is dropped and taken again, which opens it. Only then: doing it while the Cursor Menu IS open
    // queues its closing after the check for it (the cause of the missing pointer, 2026-10-25).
    greymarchPointerGuard(now: number): any {
        if (now < (this.greymarchPointerNext || 0)) return;
        this.greymarchPointerNext = now + 250;
        if (this.greymarchScreenUp || !this.greymarchPanelHasKeys() || this.greymarchEmoteOn) return; // the emote wheel needs no pointer
        var sp = this.sp;
        try {
            if (!sp.browser.isFocused()) return; // the focus guards of each window take it back
            if (sp.Ui.isMenuOpen("Cursor Menu")) return;
            sp.browser.setFocused(false); sp.browser.setVisible(true); sp.browser.setFocused(true);
            this.greymarchPointerFixed = (this.greymarchPointerFixed || 0) + 1;
            if (this.greymarchPointerFixed <= 8) this.greymarchLog("pointer: a window had the mouse but no pointer (the Cursor Menu was closed); opened it again (" + (sp.Ui.isMenuOpen("Cursor Menu") ? "open now" : "opens next frame") + ")");
        } catch (e) { /* next time */ }
    }
    greymarchForgeAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchForge", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchCraftAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchCraft", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchLedgerAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchLedger", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    greymarchScribeAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchScribe", rid: data.rid, op: data.op, args: data.args }) };
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
        this.greymarchClickGuard(); // the click that closed it is not a swing
        this.greymarchEmoteOn = false;
        this.greymarchEmoteToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchCraftOn || !!this.greymarchForgeOn || !!this.greymarchHudOn || !!this.greymarchChatOn || !!this.greymarchGuardsHud || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!(this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn)); }
    }
    greymarchEmoteSay(text: string): any { try { this.sp.Debug.notification(text); } catch (e) { /* a hint is a nicety */ } }
    // Every frame (update phase): open the wheel, play or stop an emote, and end a lasting one when the player moves (keys can be rebound, so the speed is watched too) or draws a weapon.
    greymarchEmoteTick(now: number): any {
        var sp = this.sp;
        this.greymarchPotionUndoTick(now);
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
        this.greymarchServerEmoteTick(now);
        this.greymarchFaceTick(now);
        // eating, drinking or a potion (greymarchConsumeNote): played in turn once the menu is closed, unless an emote is on or the body is a beast. Waiting behind a meal
        // does not count towards the 15 seconds after which one is forgotten (a second meal plays after the first, it never replaces it).
        var cq = this.greymarchConsumeQueue;
        if (cq && cq.length) {
            var eating = !!(this.greymarchEmoteNow && this.greymarchEmoteNow.meal);
            if (eating) for (var qi = 0; qi < cq.length; qi++) cq[qi].at = now;
            else {
                while (cq.length && now - cq[0].at > 15000) cq.shift();
                if (cq.length && !this.greymarchEmoteNow && !this.greymarchWolfOn && !this.greymarchShapeOn && !this.greymarchInMenu()) { var next = cq.shift(); this.greymarchConsumePlay(next.id, now); }
            }
        }
        if (this.greymarchMealLocked && !(this.greymarchEmoteNow && this.greymarchEmoteNow.meal)) this.greymarchMealLock(false, "the meal ended another way"); // never left frozen (a beast form, an emote dropped elsewhere)
        var cur = this.greymarchEmoteNow;
        if (!cur) { this.greymarchEmoteStopWanted = 0; return; }
        var stopWhy = "";
        if (this.greymarchEmoteStopWanted && !cur.meal) { this.greymarchEmoteStopWanted = 0; stopWhy = "stopped"; }
        else if (this.greymarchWolfOn || this.greymarchShapeOn) { this.greymarchEmoteNow = null; if (cur.meal) this.greymarchMealLock(false, "beast form"); return; } // the body changed: the emote went with it
        else if (cur.until && now >= cur.until) stopWhy = "done eating";
        else if (now >= (this.greymarchEmoteCheckAt || 0)) {
            this.greymarchEmoteCheckAt = now + 250;
            try {
                var player = sp.Game.getPlayer();
                if (cur.meal) { this.greymarchEmoteStopWanted = 0; if (player.isDead()) stopWhy = "died"; } // a meal lasts its full time: moving, a weapon or Stop do not end it (the controls are locked)
                else if (player.isWeaponDrawn()) stopWhy = "weapon drawn";
                else if (cur.kind === "loop" && now - cur.at > 700 && player.getAnimationVariableFloat("Speed") > 30) stopWhy = "moved";
            } catch (e) { /* asked again in a moment */ }
        }
        if (stopWhy) this.greymarchEmoteEnd(stopWhy);
    }
    // the player ate, drank or took a potion (the game "equips" it): remember which emote goes with it (emotes.ts consumeEmoteId)
    greymarchConsumeNote(baseObj: any): any {
        try {
            var pot = this.sp.Potion.from(baseObj);
            if (!pot) return;
            var id = emoteMod.consumeEmoteId({ food: !!pot.isFood(), poison: !!pot.isPoison(), name: String(baseObj.getName() || "") });
            if (id === "potion") {
                var fid = baseObj.getFormID() >>> 0;
                var blood = 0; try { blood = this.greymarchVampForm("potion") >>> 0; } catch (bErr) { blood = 0; }
                if (blood && fid === blood) return; // the Potion of Blood is the vampire code's
                if (this.greymarchPotionServerDrink(fid)) return; // the server drinking it after the swig: no animation, its effect stays
                this.greymarchPotionFirstDrink(pot, fid);
            }
            if (id) { var cq = this.greymarchConsumeQueue || (this.greymarchConsumeQueue = []); if (cq.length < 5) cq.push({ id: id, at: Date.now() }); } // in turn: a meal never replaces the one playing
            if (id === "bread" || id === "mug") this.greymarchConsumeCloseMenu(); // food or a drink: the inventory closes so the meal is seen (a potion leaves it open: several in a row)
        } catch (err) { /* not something eaten */ }
    }
    // POTIONS TAKE A SWIG (gamemode potions.js). The player drinks: the swig plays, and the server keeps the effects back, puts that one potion back after the swig and
    // has this game drink it again (the server's Papyrus Actor.EquipItem); that second drink's effects stay. The game itself applies the first drink at once, so
    // here that is undone: the effects it starts are ended and health, magicka and stamina go back to the frame before (greymarchPotionUndoTick).
    greymarchPotionFirstDrink(pot: any, fid: number): any {
        var now = Date.now(), mgefs: any = {};
        try { var n = pot.getNumEffects(); for (var i = 0; i < n && i < 16; i++) { var m = pot.getNthEffectMagicEffect(i); if (m) mgefs[m.getFormID() >>> 0] = true; } } catch (e) { /* only the values are put back */ }
        var pend = this.greymarchPotionPending || (this.greymarchPotionPending = {});
        pend[fid] = (pend[fid] || []).filter(function (t: number) { return t > now; }).concat([now + emoteMod.POTION_WAIT_MS]);
        this.greymarchPotionUndo = { mgefs: mgefs, effects: [], snap: this.greymarchAvSnap ? { health: this.greymarchAvSnap.health, magicka: this.greymarchAvSnap.magicka, stamina: this.greymarchAvSnap.stamina } : null, until: now + emoteMod.POTION_UNDO_MS };
    }
    greymarchPotionServerDrink(fid: number): boolean {
        var pend = this.greymarchPotionPending, now = Date.now();
        if (!pend || !pend[fid]) return false;
        var list = pend[fid].filter(function (t: number) { return t > now; });
        var mine = list.length > 0;
        if (mine) list.shift();
        if (list.length) pend[fid] = list; else delete pend[fid];
        return mine;
    }
    // every frame: note health, magicka and stamina (what a first drink is put back to); while a first drink is being undone, end its effects and take back any rise
    greymarchPotionUndoTick(now: number): any {
        var player: any = null;
        try { player = this.sp.Game.getPlayer(); } catch (e) { return; }
        if (!player) return;
        var pu = this.greymarchPotionUndo;
        if (pu) {
            if (now >= pu.until) this.greymarchPotionUndo = null;
            for (var i = 0; i < pu.effects.length; i++) { try { pu.effects[i].dispel(); } catch (dErr) { /* it ended */ } }
            pu.effects = [];
            if (pu.snap) {
                var avs = ["health", "magicka", "stamina"];
                for (var k = 0; k < avs.length; k++) {
                    try { var cur = player.getActorValue(avs[k]), was = pu.snap[avs[k]]; if (typeof was === "number" && cur > was + 0.5) player.damageActorValue(avs[k], cur - was); } catch (vErr) { /* that value stays */ }
                }
            }
            if (this.greymarchPotionUndo) return; // the frame before stays the drink's frame until the undo is over
        }
        try { this.greymarchAvSnap = { health: player.getActorValue("health"), magicka: player.getActorValue("magicka"), stamina: player.getActorValue("stamina") }; } catch (sErr) { /* asked next frame */ }
    }
    // close the inventory (or favorites) the food was used from: SkyrimPlatform has no "close menu", so the menu key is pressed for the player (the key mapped to
    // "Tween Menu", Tab unless rebound, closes an item menu back to the game). Only while one of those menus is still open, so it never opens the Tween menu.
    greymarchConsumeCloseMenu(): any {
        var sp = this.sp, ui = sp.Ui, input = sp.Input;
        try {
            if (!input || typeof input.tapKey !== "function") return;
            if (!(ui.isMenuOpen("InventoryMenu") || ui.isMenuOpen("FavoritesMenu"))) return;
            var key = 0; try { key = Number(input.getMappedKey("Tween Menu", 0)) || 0; } catch (kErr) { key = 0; }
            if (!(key > 0 && key < 0xff)) key = 15; // Tab
            input.tapKey(key);
            this.greymarchCrumb("eat: closed the menu (key " + key + ")");
        } catch (err) { /* the player closes it */ }
    }
    // play it like an emote, quietly (no notices, the camera is left alone): a weapon drawn or a game that refuses means no animation, nothing else
    greymarchConsumePlay(id: string, now: number): any {
        var em = emoteMod.emoteById(id);
        if (!em) return;
        var ok = false;
        try {
            var player = this.sp.Game.getPlayer();
            if (player.isWeaponDrawn()) return;
            var idle = this.sp.Idle.from(this.sp.Game.getFormEx(em.idle));
            ok = !!idle && !!player.playIdle(idle);
        } catch (err) { ok = false; }
        var n = this.greymarchEmoteLogged = (this.greymarchEmoteLogged || 0) + 1;
        if (n <= 20) this.greymarchLog("eat: " + id + " " + (ok ? "played" : "refused by the game"));
        if (ok && em.kind === "loop") { this.greymarchEmoteNow = { id: em.id, kind: "loop", stop: emoteMod.IDLE_STOP, at: now, until: now + emoteMod.EAT_SECONDS * 1000, meal: true }; this.greymarchMealLock(true, id); }
    }
    // A MEAL CANNOT BE SKIPPED (the server fills the hunger the moment the food leaves the inventory): while eating or drinking (EAT_SECONDS) the player cannot walk,
    // jump, fight, sneak or activate; looking around, the camera and the menus stay. The controls come back when the meal is over or ends any other way (death, a beast
    // form: greymarchEmoteTick also frees them every frame if the meal is gone), never while staff hold the player frozen (greymarchEffects).
    greymarchMealLock(on: boolean, why: string): any {
        var sp = this.sp;
        if (on) {
            try { sp.Game.disablePlayerControls(true, true, false, false, true, false, true, false, 0); this.greymarchMealLocked = true; } catch (e) { this.greymarchMealLocked = false; return; }
            this.greymarchCrumb("eat: controls locked (" + why + ")");
            return;
        }
        if (!this.greymarchMealLocked) return;
        this.greymarchMealLocked = false;
        if (this.greymarchFxHave && this.greymarchFxHave.frozen) return; // staff froze the player: that lock stays
        try { sp.Game.enablePlayerControls(true, true, false, false, true, false, true, false, 0); } catch (e) { /* nothing else to try */ }
        this.greymarchCrumb("eat: controls back (" + why + ")");
    }
    greymarchEmotePlay(em: any): any {
        var sp = this.sp;
        if (this.greymarchWolfOn || this.greymarchShapeOn) { this.greymarchEmoteSay("A beast has no emotes"); return; }
        if (this.greymarchEmoteNow && this.greymarchEmoteNow.meal) { this.greymarchEmoteSay("Finish eating first"); return; }
        var ok = false, player: any = null;
        try {
            player = sp.Game.getPlayer();
            if (player.isWeaponDrawn()) { this.greymarchEmoteSay("Sheathe your weapon first"); return; }
            if (this.greymarchEmoteNow && this.greymarchEmoteNow.kind === "walk" && em.kind !== "once") this.greymarchEmoteEnd("another emote"); // a carry ends before a new pose starts (a serve or a throw keeps it)
            try { sp.Game.forceThirdPerson(); } catch (tpErr) { /* the emote still plays */ }
            var idle = sp.Idle.from(sp.Game.getFormEx(em.idle));
            this.greymarchCrumb("emote " + em.id + " idle " + (Number(em.idle) >>> 0).toString(16));
            ok = !!idle && !!player.playIdle(idle);
            if (!ok && em.event) { sp.Debug.sendAnimationEvent(player, em.event); ok = true; } // a sitting idle asks for a seat: its own event sits anywhere (emotes.ts, SITTING DOWN)
        } catch (err) { ok = false; }
        var n = this.greymarchEmoteLogged = (this.greymarchEmoteLogged || 0) + 1;
        if (n <= 20) this.greymarchLog("emote: " + em.id + " (idle " + em.idle.toString(16) + ", " + em.kind + ") " + (ok ? "played" : "refused by the game"));
        if (!ok) { this.greymarchEmoteSay("You cannot do that right now"); return; }
        this.greymarchEmoteNow = em.kind === "once" ? null : { id: em.id, kind: em.kind, stop: em.stop || emoteMod.IDLE_STOP, stopEvent: em.stopEvent, at: Date.now() };
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
    // GREYMARCH: A BEAST BODY (2026-10-23): a werewolf, werebear or one of their forms, or a body with no head parts (a beast look, its stand-in, a creature form).
    // It has no human face (no facial animation data), and the faces, the moving mouths and the human poses below are never put on it: they wrote into a
    // face and a graph a beast does not have, the same mistake as SkyMP's cast and animation-variable replay (remoteServer.ts greymarchIsBeastCopy).
    // THE HOWL SHOUT on this player's body while changed (see WOLF_HOWL_SHOUT); the voice they had is kept and put back
    greymarchWolfHowlOn(player: any): any {
        try {
            var howl = this.sp.Shout.from(this.sp.Game.getFormEx(WOLF_HOWL_SHOUT));
            if (!howl) return;
            var had = player.getEquippedShout();
            this.greymarchWolfVoiceBefore = had && had.getFormID() !== WOLF_HOWL_SHOUT ? had.getFormID() : (this.greymarchWolfVoiceBefore || 0);
            this.greymarchWolfHowlAdded = player.addShout(howl) || this.greymarchWolfHowlAdded; // true when they did not know it: taken away again after
            player.equipShout(howl);
            this.greymarchLog("wolf: the howl is in the voice slot" + (this.greymarchWolfVoiceBefore ? " (their voice " + this.greymarchWolfVoiceBefore.toString(16) + " is put back after)" : ""));
        } catch (e) { this.greymarchLog("wolf: the howl could not be put in the voice slot: " + e); }
    }
    greymarchWolfHowlOff(player: any): any {
        try {
            var howl = this.sp.Shout.from(this.sp.Game.getFormEx(WOLF_HOWL_SHOUT));
            if (howl) { player.unequipShout(howl); if (this.greymarchWolfHowlAdded) player.removeShout(howl); }
            var before = this.greymarchWolfVoiceBefore ? this.sp.Shout.from(this.sp.Game.getFormEx(this.greymarchWolfVoiceBefore)) : null;
            if (before) player.equipShout(before);
            this.greymarchWolfHowlAdded = false; this.greymarchWolfVoiceBefore = 0;
        } catch (e) { /* their voice slot stays as it is */ }
    }
    // another player roared: their werewolf NPC here howls too (HowlStart, HowlRelease 200 ms later), with the howl shout in its voice slot so the graph has a voice
    // to cast, and only once that NPC has settled after its race switch (__gmBeastHeld, formView.ts). SkyMP's own relay of the howl stays dropped (formView.ts).
    greymarchWolfHowlOther(localId: number, now: number): any {
        var held: any = (Function("return this")() as any).__gmBeastHeld || {};
        if (held[localId]) { this.greymarchLog("wolf: a roar from " + (localId >>> 0).toString(16) + ": the sound only (its body is still settling)"); return; }
        var ac = this.sp.Actor.from(this.sp.Game.getFormEx(localId));
        if (!ac || !this.greymarchIsBeastBody(ac)) return;
        var howl = this.sp.Shout.from(this.sp.Game.getFormEx(WOLF_HOWL_SHOUT));
        if (!howl) return;
        var cur = ac.getEquippedShout();
        if (!cur || cur.getFormID() !== WOLF_HOWL_SHOUT) { ac.addShout(howl); ac.equipShout(howl); }
        this.greymarchCrumb("beast: howl on " + (localId >>> 0).toString(16));
        this.sp.Debug.sendAnimationEvent(ac, "HowlStart");
        (this.greymarchWolfOtherRelease || (this.greymarchWolfOtherRelease = {}))[localId] = now + 200;
    }
    greymarchIsBeastBody(actor: any): boolean {
        try {
            var race = actor.getRace();
            if (race && this.greymarchWolfIsBeast(race.getFormID())) return true;
            if (race) {
                if (this.greymarchWerebearRaceId === undefined) { var wb = this.sp.Game.getFormFromFile(0x1e17b, "Dragonborn.esm"); this.greymarchWerebearRaceId = wb ? wb.getFormID() : 0; }
                if (this.greymarchWerebearRaceId && race.getFormID() === this.greymarchWerebearRaceId) return true;
            }
            var base = this.sp.ActorBase.from(actor.getBaseObject());
            if (base && base.getNumHeadParts() === 0) return true;
        } catch (e) { return false; }
        return false;
    }
    greymarchFaceApply(actor: any, face: any, fresh: boolean): any {
        if (this.greymarchIsBeastBody(actor)) return; // no face on a beast body (see greymarchIsBeastBody)
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
            if (this.greymarchIsBeastBody(ac)) continue; // no moving mouth on a beast body (greymarchIsBeastBody)
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
    // THE SERVER ASKS FOR AN EMOTE ({ customPacketType: "greymarchEmote", emote: <a wheel emote id>, ms }): played as if picked from the wheel (so everyone sees it) and
    // ended like the wheel's Stop after ms. Moving, a drawn weapon or anything else that ends it sooner just ends it: the server keeps its own time. Ignored when
    // the player is dead, in furniture or mounted, mid-meal, or the id is not an emote (faces too).
    greymarchServerEmoteTick(now: number): any {
        var want = this.greymarchServerEmote;
        if (want) {
            this.greymarchServerEmote = null;
            var em = emoteMod.emoteById(want.id);
            var why = "";
            if (!em || em.kind === "face") why = "not an emote";
            else if (now - want.at > 3000) why = "too late";
            else if (this.greymarchEmoteNow && this.greymarchEmoteNow.meal) why = "eating";
            else {
                try { var pl = this.sp.Game.getPlayer(); if (!pl || pl.isDead()) why = "dead"; else if (pl.getFurnitureReference()) why = "in furniture"; else if (pl.isOnMount()) why = "mounted"; } catch (e) { why = "the player could not be read"; }
            }
            if (why) { this.greymarchLog("emote: the server's " + want.id + " ignored (" + why + ")"); }
            else {
                this.greymarchEmotePlay(em);
                var cur = this.greymarchEmoteNow;
                this.greymarchServerEmoteEnd = cur && cur.id === em.id ? { id: em.id, at: cur.at, until: now + want.ms } : null; // a one-off ends by itself
            }
        }
        var end = this.greymarchServerEmoteEnd;
        if (!end || now < end.until) return;
        this.greymarchServerEmoteEnd = null;
        var now2 = this.greymarchEmoteNow;
        if (now2 && now2.id === end.id && now2.at === end.at) this.greymarchEmoteEnd("the server's time is up"); // still the same emote: stand up, as Stop does
    }
    greymarchEmoteEnd(why: string): any {
        var sp = this.sp, cur = this.greymarchEmoteNow;
        this.greymarchEmoteNow = null;
        if (!cur) return;
        if (cur.meal) this.greymarchMealLock(false, why);
        this.greymarchCrumb("emote end " + cur.id + " (" + why + ")");
        try {
            var player = sp.Game.getPlayer();
            var idle = sp.Idle.from(sp.Game.getFormEx(cur.stop));
            var ok = !!idle && !!player.playIdle(idle);
            if (!ok) sp.Debug.sendAnimationEvent(player, cur.stopEvent ? cur.stopEvent : cur.stop === emoteMod.OFFSET_STOP ? "OffsetStop" : cur.stop === emoteMod.DRUNK_STOP ? "DrunkStop" : "IdleStop"); // the stop event itself
        } catch (err) { /* the next movement ends it anyway */ }
        if ((this.greymarchEmoteLogged || 0) <= 20) this.greymarchLog("emote: " + cur.id + " ended (" + why + ")");
    }
    // THE CONSOLE (~). SkyrimPlatform's findConsoleCommand swaps a command's code for ours, and ours answering false means the game's own never runs:
    // so each command in CONSOLE_BLOCKED only says it is disabled, and the attempt goes to the server (gamemode consoleguard.js, the staff Log tab).
    // Papyrus natives (Debug.toggleCollisions, setActorValue: the staff noclip and speed) are other code and keep working. A command this game does not have is skipped.
    greymarchConsoleLock(): any {
        var sp = this.sp, done = 0, missing = [];
        if (typeof sp.findConsoleCommand !== "function") return; // an old SkyrimPlatform: only the menu is closed
        for (var i = 0; i < CONSOLE_BLOCKED.length; i++) {
            var name = CONSOLE_BLOCKED[i];
            if (CONSOLE_SKYMP.indexOf(name) >= 0) continue;
            try {
                var cmd = sp.findConsoleCommand(name);
                if (!cmd) { missing.push(name); continue; }
                cmd.execute = this.greymarchConsoleRefuse(name);
                done++;
            } catch (e) { missing.push(name); }
        }
        this.greymarchConsoleLocked = done;
        try { sp.writeLogs("greymarch", "console: " + done + " commands locked" + (missing.length ? " (not in this game: " + missing.join(", ") + ")" : "")); } catch (e) { /* only a log line (not sent: the server is not there yet) */ }
    }
    greymarchConsoleRefuse(name: string): any {
        return () => {
            try { this.sp.printConsole("Console commands are disabled on Greymarch."); } catch (e) { /* the console may be gone already */ }
            this.greymarchConsoleReport("command", name);
            return false; // the game's own command never runs
        };
    }
    // At most one report a few seconds per kind (and per command), so a held key or a batch file cannot flood the server.
    greymarchConsoleReport(op: string, name?: string): any {
        var now = Date.now(), key = op + ":" + (name || ""), seen = this.greymarchConsoleSent || (this.greymarchConsoleSent = {});
        if (now - (seen[key] || 0) < 5000) return;
        seen[key] = now;
        this.greymarchConsoleTries = (this.greymarchConsoleTries || 0) + 1;
        if (this.greymarchConsoleTries <= 20) this.greymarchLog("console: " + (op === "opened" ? "the console was opened, closed it" : "refused '" + name + "'"));
        try { this.controller.emitter.emit("sendMessage", { message: { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchConsole", op: op, name: name || "" }) }, reliability: "reliable" }); } catch (e) { /* the log line has it */ }
    }
    // Every frame: an open console is closed through GreymarchCamera.dll 1.3 (CloseMenu, as the forge window closes the Crafting Menu). on("menuOpen") sees it
    // too, but Skyrim functions cannot be called from it, so the update loop does it. Without CloseMenu the console key is pressed again (once a second at most).
    // Lead GM and up (the server's greymarchChatInfo says console: true) keep it open, to read what the game prints there. The commands that cheat stay locked.
    greymarchConsoleTick(now: number): any {
        if (this.greymarchConsoleAllowed) { this.greymarchConsoleOpen = false; return; }
        var sp = this.sp, open = "";
        for (var i = 0; i < CONSOLE_MENUS.length && !open; i++) { try { if (sp.Ui.isMenuOpen(CONSOLE_MENUS[i])) open = CONSOLE_MENUS[i]; } catch (e) { /* a menu this game does not know */ } }
        if (!open) { this.greymarchConsoleOpen = false; return; }
        var shut = false; try { shut = !!sp.callNative("GreymarchCam", "CloseMenu", undefined, open); } catch (e) { shut = false; }
        if (!shut && now >= (this.greymarchConsoleTapNext || 0)) { this.greymarchConsoleTapNext = now + 1000; try { sp.Input.tapKey(CONSOLE_KEY); } catch (e) { /* the commands are locked anyway */ } }
        if (!this.greymarchConsoleOpen) { this.greymarchConsoleOpen = true; this.greymarchConsoleReport("opened"); }
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
    greymarchPanelHasKeys(): any { return !!(this.greymarchMiniOn || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn || this.greymarchVampMenuOn || this.greymarchLedgerOn || this.greymarchScribeOn || this.greymarchCraftOn || this.greymarchForgeOn || this.greymarchEmoteOn); }
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
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchProfOn && !this.greymarchChanceryOn && !this.greymarchVampMenuOn && !this.greymarchLedgerOn && !this.greymarchScribeOn && !this.greymarchCraftOn && !this.greymarchForgeOn && !this.greymarchEmoteOn) return;
        var focused = true;
        try { focused = !!this.sp.browser.isFocused(); } catch (e) { focused = true; } // cannot tell: leave the window alone
        if (focused) return;
        this.greymarchLog("chat: Enter reached the game while " + [this.greymarchAdminOn ? "the staff panel" : "", this.greymarchMenuOn ? "the X menu" : "", this.greymarchProfOn ? "the K window" : "", this.greymarchChanceryOn ? "the chancery" : "", this.greymarchVampMenuOn ? "the vampire window" : "", this.greymarchLedgerOn ? "the guard ledger" : "", this.greymarchScribeOn ? "the scribe's desk" : "", this.greymarchEmoteOn ? "the emote wheel" : ""].filter(Boolean).join(", ") + " was marked open without the keyboard; closed it so the chat opens");
        if (this.greymarchAdminOn) { try { this.greymarchAdminHide(); } catch (e1) { this.greymarchAdminOn = false; } }
        if (this.greymarchMenuOn) { try { this.greymarchMenuHide(); } catch (e2) { this.greymarchMenuOn = false; } }
        if (this.greymarchProfOn) { try { this.greymarchProfHide(); } catch (e3) { this.greymarchProfOn = false; } }
        if (this.greymarchChanceryOn) { try { this.greymarchChanceryHide(); } catch (e4) { this.greymarchChanceryOn = false; } }
        if (this.greymarchVampMenuOn) { try { this.greymarchVampMenuHide(); } catch (e5) { this.greymarchVampMenuOn = false; } }
        if (this.greymarchLedgerOn) { try { this.greymarchLedgerHide(); } catch (e6) { this.greymarchLedgerOn = false; } }
        if (this.greymarchScribeOn) { try { this.greymarchScribeHide(); } catch (e7) { this.greymarchScribeOn = false; } }
        if (this.greymarchCraftOn) { try { this.greymarchCraftHide(); } catch (e7) { this.greymarchCraftOn = false; } }
        if (this.greymarchForgeOn) { try { this.greymarchForgeHide(); } catch (e8) { this.greymarchForgeOn = false; } }
        if (this.greymarchMiniOn) { try { this.greymarchMiniHide(); } catch (e8) { this.greymarchMiniOn = false; } }
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
        // SAFE NAMING (2026-10-28): every game froze right after the world loaded while naming 125 owned doors in one go, on a plain room door (fe01ad6f, JK's
        // Palace of the Kings) the game does not keep in memory. Now a door is only named when it really is a door with that id and its 3D is loaded (a door
        // further away is named when the player comes near), at most DOOR_NAMES_PER_PASS per pass, with a crash breadcrumb before each, so a door that ever hangs
        // the game again is the last line of greymarch-crumbs-logs.txt.
        var budget = DOOR_NAMES_PER_PASS;
        var want = this.greymarchDoorNames || {};
        var done = this.greymarchDoorNamesDone || (this.greymarchDoorNamesDone = {});
        var orig = this.greymarchDoorOrig || (this.greymarchDoorOrig = {}); // the game's own name of each door we have renamed
        var sp = this.sp;
        for (var id in want) {
            if (budget <= 0) { this.greymarchDoorNamesNext = now + 250; break; } // more to do: the next pass comes sooner
            var w = want[id];
            var label = typeof w === "string" ? w : String((w && w.label) || "");
            var owner = typeof w === "string" ? "" : String((w && w.owner) || "");
            var local = misc.remoteIdToLocalId(Number(id));
            if (!local) continue;
            var o: any = null;
            var looked = this.greymarchDoorLooked || (this.greymarchDoorLooked = {});
            if (!looked[id]) { looked[id] = 1; this.greymarchCrumb("door name: first look-up of " + Number(id).toString(16)); } // once per door, not every pass
            try { o = sp.ObjectReference.from(sp.Game.getFormEx(local)); } catch (e0) { o = null; }
            var isDoor = false;
            try { isDoor = !!o && (o.getFormID() >>> 0) === (local >>> 0) && !!o.getBaseObject() && o.getBaseObject().getType() === DOOR_FORM_TYPE && o.is3DLoaded(); } catch (eD) { isDoor = false; }
            if (o && !isDoor) continue; // not a loaded door with that id (yet): tried again on a later pass
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
                    budget--;
                    this.greymarchCrumb("door name: rename " + Number(id).toString(16));
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
