// @ts-nocheck
// Greymarch bridge: everything Greymarch adds to the SkyMP client lives here, so the rest of SkyMP stays as upstream wrote it.
// Ported from the old text patches (tools/patch-client.js in the launcher repo). Loosely typed on purpose for the first port.
// Hooks into SkyMP are small and marked "GREYMARCH" in authService.ts, formView.ts, activationService.ts, remoteServer.ts, loadGameService.ts, singlePlayerService.ts.
import { MsgType } from "../messages";
import * as misc from "../view/worldViewMisc";
import * as appearanceMod from "../sync/appearance";
import { RemoteServer } from "../services/services/remoteServer";
import { SinglePlayerService } from "../services/services/singlePlayerService";

// Runs inside SkyMP's browser page (once). Each shows a page from Platform/UI in an iframe and relays its messages.
const PAGE_SCRIPT = "(function(){if(window.__gmSend)return;var f=document.createElement('iframe');f.id='greymarch-frame';f.src='greymarch-select.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483647;background:#05080d;display:none';var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmSend=function(m){f.style.display=m.fn==='hide'?'none':'block';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const HUD_SCRIPT = "(function(){if(window.__gmHud)return;var f=document.createElement('iframe');f.id='greymarch-hud-frame';f.src='greymarch-hud.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483000;background:transparent;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmHudSend=function(m){if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};window.__gmHud=f;document.body.appendChild(f)})();";
const ADMIN_SCRIPT = "(function(){if(window.__gmAdminSend)return;var f=document.createElement('iframe');f.id='greymarch-admin-frame';f.src='greymarch-admin.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483200;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmAdminSend=function(m){if(m.fn==='show')f.style.pointerEvents='auto';else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const CHAT_SCRIPT = "(function(){if(window.__gmChatSend)return;var f=document.createElement('iframe');f.id='greymarch-chat-frame';f.src='greymarch-chat.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483100;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmChatSend=function(m){if(m.fn==='open'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='close'||m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f)})();";
const MENU_SCRIPT = "(function(){if(window.__gmMenuSend)return;var f=document.createElement('iframe');f.id='greymarch-menu-frame';f.src='greymarch-menu.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483210;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmMenuSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const PROF_SCRIPT = "(function(){if(window.__gmProfSend)return;var f=document.createElement('iframe');f.id='greymarch-prof-frame';f.src='greymarch-prof.html';f.style.cssText='position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483220;background:transparent;display:block;pointer-events:none';f.setAttribute('allowtransparency','true');var ready=false,queue=[];window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d)return;if(d.greymarchReady){ready=true;queue.forEach(function(q){f.contentWindow.postMessage({greymarchIn:q},'*')});queue=[]}else if(d.greymarchOut&&window.skyrimPlatform){window.skyrimPlatform.sendMessage('greymarch',JSON.stringify(d.greymarchOut))}});window.__gmProfSend=function(m){if(m.fn==='show'){f.style.pointerEvents='auto';try{f.focus()}catch(x){}}else if(m.fn==='hide')f.style.pointerEvents='none';if(ready)f.contentWindow.postMessage({greymarchIn:m},'*');else queue.push(m)};document.body.appendChild(f);document.addEventListener('keyup',function(e){if(e.key==='x'||e.key==='X'){try{f.contentWindow.postMessage({greymarchIn:{fn:'release'}},'*')}catch(x){}}});document.addEventListener('keydown',function(e){if(e.key==='Escape'){try{f.contentWindow.postMessage({greymarchIn:{fn:'escape'}},'*')}catch(x){}}})})();";
const CONNECT_FAIL_MS = 90000; // the connecting screen over the main menu: this long without the character select, it says what to do (greymarchConnectCover)
const WOLF_MORPH_MS = 4300; // the werewolf transformation: the race changes at the animation's "SetRace" cue, or after this long if the cue is not seen (the cue is about 4.0 s in, animationdatasinglefile.txt)
const SHAPE_REST_MS = 800, SHAPE_POWER_REST_MS = 1600; // a creature's attacks: the rest after a normal and after a power attack (the server allows the same pace)
const SHAPE_LAND_MS = 450; // a creature's swing is reported this long after it starts (about when it lands)
const SHAPE_SILENCE_MS = 20000; // a creature form: with no word from the server for this long the player changes back by themselves (the server repeats "on" every 5 seconds)
const WOLF_BACK_GRACE_MS = 2000; // Z changes back, but not in the first 2 seconds after the body changed
const WOLF_ROAR_MS = 4000;  // R: one roar every this long (the howl animation lasts about 2.8 s)
const CHANCERY_SCRIPT =PROF_SCRIPT.split("__gmProfSend").join("__gmChanceryRun").split("greymarch-prof").join("greymarch-chancery").split("2147483220").join("2147483221"); // the chancery window (/chancery): the same loader, another page

export class GreymarchBridge {
    [key: string]: any;

    constructor(public sp: any, public controller: any) {
        this.controller.on("browserMessage", (e: any) => this.greymarchBrowserMessage(e));
        this.controller.on("buttonEvent", (e: any) => this.greymarchKey(e)); // F7 opens the staff panel
        try { this.sp.on("hit", (e: any) => this.greymarchHit(e)); } catch (hitErr) { /* no hit events: the combat history stays empty */ }
        this.controller.on("update", () => this.greymarchTick()); // Skyrim functions only work in the update phase, never in tick
        this.controller.on("tick", () => this.greymarchConnectCover(Date.now())); // the connecting screen: "tick", because "update" does not run at the main menu (it only uses the browser)
        try { this.controller.on("spellCast", (e: any) => { try { if (e && e.spell && e.spell.getFormID() === 0x92c48 && e.caster && e.caster.getFormID() === 0x14) this.greymarchWolfSignal("spellCast"); } catch (x) { /* not ours */ } }); } catch (scErr) { /* the effect checks still see it */ } // the werewolf power (greymarchWolfTick)
        try { this.controller.on("effectStart", (e: any) => { try { if (e && e.effect && e.effect.getFormID() === 0x92c45 && e.target && e.target.getFormID() === 0x14) this.greymarchWolfSignal("effectStart"); } catch (x) { /* not ours */ } }); } catch (esErr) { /* the other signals still see it */ }
        try { this.controller.on("magicEffectApply", (e: any) => { try { if (e && e.effect && e.effect.getFormID() === 0x92c45 && e.target && e.target.getFormID() === 0x14) this.greymarchWolfSignal("magicEffectApply"); } catch (x) { /* not ours */ } }); } catch (maErr) { /* the other signals still see it */ }
        this.controller.emitter.on("greymarchStage", (text: string) => this.greymarchLog(text)); // other services report where the game is, for the server log
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
        if (type === "greymarchShape") { this.greymarchShapeMsg(msg); return; } // a creature form (staff): greymarchShapeTick changes the body
        if (type === "greymarchWolfForm") { if (this.greymarchWolfWant !== !!msg.on) this.greymarchLog("wolf: the server says " + (msg.on ? "changed" : "no (change back)")); this.greymarchWolfWant = !!msg.on; if (msg.on) { this.greymarchWolfWordAt = Date.now(); this.greymarchWolfAlpha = !!msg.alpha; this.greymarchWolfPup = !msg.alpha && !!msg.pup; } return; } // (logged only when it changes: the server repeats it every 5 seconds) // the werewolf form (greymarchWolfTick)
        if (type === "greymarchWolfAlphas") { this.greymarchWolfAlphaList = Array.isArray(msg.actors) ? msg.actors : []; this.greymarchWolfPupList = Array.isArray(msg.pups) ? msg.pups : []; return; } // the other players in the Alpha form: drawn white (greymarchWolfAlphaOthers)
        if (type === "greymarchWolfFeed") { this.greymarchWolfFeedAt = Date.now(); return; } // the wolf fed (a kill or a corpse): the feeding animation (greymarchWolfTick)
        if (type === "greymarchChanceryReply") { this.greymarchChanceryToPage("reply", msg); return; } // the chancery window (/chancery)
        if (type === "greymarchChanceryOpen") { this.greymarchChanceryShow(); return; }
        if (type === "greymarchProfReply") { this.greymarchLog("prof: the server's answer arrived (rid " + msg.rid + ", ok " + msg.ok + ")"); this.greymarchProfToPage("reply", msg); return; } // the professions window (K)
        if (type === "greymarchCombatMod") { var cm = Number(msg.mult); this.greymarchCombatWant = cm >= 0.1 && cm <= 3 ? cm : 1; return; } // the damage multiplier for what is in hand (professions: a weapon above your rank hits weaker, a Brawler's fists hit harder)
        if (type === "greymarchMenuEvent") { if ((msg.type === "trade_invite" || msg.type === "trade") && !this.greymarchMenuOn) this.greymarchMenuShow({ mode: "invite", looking: 0 }); this.greymarchMenuToPage("event", msg); return; }
        if (type === "greymarchFx") { this.greymarchFxWant = { noclip: !!msg.noclip, speed: Number(msg.speed) || 100, frozen: !!msg.frozen, god: !!msg.god }; if (msg.me) this.greymarchMeActor = msg.me; return; }
        if (type === "greymarchGhosts") { this.greymarchGhostList = Array.isArray(msg.ghosts) ? msg.ghosts : []; if (msg.me) this.greymarchMeActor = msg.me; this.greymarchOthers = Array.isArray(msg.others) ? msg.others : []; if (msg.stats !== undefined) this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; var inv = Array.isArray(msg.invisible) ? msg.invisible : []; this.greymarchInvisList = inv; var invMap = {}; for (var q = 0; q < inv.length; q++) if (inv[q] !== msg.me) invMap[inv[q]] = true; try { Function("return this")().__gmInvisible = invMap; } catch (gErr) { /* names stay visible */ } return; }
        this.sp.printConsole("[greymarch] got " + type + (msg.characters ? " with " + msg.characters.length + " character(s)" : ""));
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
            this.greymarchHudToPage("hello", true); // start the voice display's page early, so it is already running when the player enters the world
        } else if (type === "greymarchError") {
            this.greymarchToPage("error", msg.message);
        } else if (type === "greymarchEntered") {
            // Keep the screen up as a veil while the body settles (default gear, equipment, the race menu opening), so nobody sees
            // the armor flash. The veil NEVER waits for anything that could stall: an existing character lifts it after 2.5s, a new
            // one as soon as the race menu is open (or after 12s). greymarchTick does it.
            this.greymarchToPage("busy", { on: true, text: "Entering the world", veil: true });
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
        this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!(this.greymarchProfOn || this.greymarchChanceryOn)); // stays visible (but never focused) while the voice display is on; the staff panel keeps it up and focused
        if (this.greymarchAdminOn) this.sp.browser.setFocused(true);
        this.greymarchChatShow();
        this.greymarchReportLoadOrder();
        this.greymarchLog("veil lifted (" + why + ") after " + (job ? Date.now() - job.at : "?") + " ms");
        this.sp.printConsole("[greymarch] veil lifted (" + why + ")");
    }
    // Runs every frame in the UPDATE phase (registered in the constructor): that is the only place Skyrim functions such as Game.getFormEx may be called. Cheap when there is nothing to do. Any error lifts the veil instead of trapping the player.
    greymarchTick(): any {
        this.greymarchDoorNamesApply(Date.now());
        this.greymarchDoorPrompt(Date.now());
        this.greymarchChatPending();
        this.greymarchChatWatch(Date.now());
        this.greymarchWorldViewGuard(Date.now()); // other players are drawn only while SkyMP's world view is on: see greymarchWorldViewGuard
        if (this.greymarchChatOn && Date.now() >= (this.greymarchChatNext || 0)) { this.greymarchChatNext = Date.now() + 2000; this.greymarchChatToPage("show", true); }
        if (this.greymarchMenuEscAt && Date.now() - this.greymarchMenuEscAt > 700) { this.greymarchMenuEscAt = 0; this.greymarchMenuHide(); } // Esc, and the menu page did not close itself
        this.greymarchToastTick(Date.now());
        this.greymarchEffects(); // staff effects: noclip, speed, frozen, ghosts (cheap: does real work every 400 ms)
        this.greymarchShapeTick(); // a creature form staff put the player in (a goat, a giant ...): the server decides, the body is changed here
        this.greymarchWolfTick(); // the werewolf form: the game's Beast Form power is the trigger, the server decides, the change is done here
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
                if (!player || age > 30000) {
                    if (age > 30000) this.greymarchLog("gave up on the starting clothes (" + eq.ids.length + " left)");
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
                    if (raceMenuOpen && !eq.menuOpened) { eq.menuOpened = true; player.unequipAll(); eq.ids = eq.all.slice(); this.greymarchLog("race menu opened: took everything off again"); }
                    if (!raceMenuOpen && eq.menuOpened && !eq.menuClosed) { eq.menuClosed = true; eq.pending.push(now + 600, now + 3000); this.greymarchLog("race menu closed: clean-ups scheduled"); }
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
    // The voice display reports "I am on / off, and these characters are talking". Only real character IDs are accepted.
    greymarchVoiceMessage(data: any): any {
        var ids = [];
        if (Array.isArray(data.speaking)) {
            for (var i = 0; i < data.speaking.length && ids.length < 12; i++) {
                if (typeof data.speaking[i] === "string" && /^#[2-9A-HJ-KM-NP-Z]{4}$/.test(data.speaking[i])) ids.push(data.speaking[i]);
            }
        }
        var hud = data.hud === true;
        var changed = hud !== !!this.greymarchHudOn;
        this.greymarchVoice = { hud: hud, speaking: ids };
        // the floating names mark whoever is talking (formView.ts draws the mark as part of the name, so it moves with it and cannot lag)
        try { var talking = {}; if (hud) for (var ti = 0; ti < ids.length; ti++) talking[ids[ti]] = 1; (Function("return this")() as any).__gmSpeaking = talking; } catch (e) { /* the names stay unmarked */ }
        this.greymarchHudOn = hud;
        // the page is shown (never focused) while the display is on, hidden when it is off; the select screen and the veil decide for themselves while they are up
        if (changed && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(hud || !!this.greymarchChatOn || !!(this.greymarchProfOn || this.greymarchChanceryOn)); if (!this.greymarchChatTyping) this.sp.browser.setFocused(false); } catch (err) { /* nothing to do */ } }
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
        if (data && data.type === "menu") { this.greymarchMenuSend(data); return; } // the X menu asks the server for something (the SERVER decides)
        if (data && data.type === "menu-close") { this.greymarchMenuHide(); return; }
        if (data && data.type === "prof") { this.greymarchProfSend(data); return; } // the professions window asks the server (the SERVER decides)
        if (data && data.type === "prof-close") { this.greymarchProfHide(); return; }
        if (data && data.type === "chancery") { this.greymarchChanceryAsk(data); return; } // the chancery window asks the server (the SERVER decides)
        if (data && data.type === "chancery-close") { this.greymarchChanceryHide(); return; }
        if (!data || (data.type !== "play" && data.type !== "create" && data.type !== "delete")) return;
        this.sp.printConsole("[greymarch] sending choice: " + data.type);
        var message = {
            t: MsgType.CustomPacket,
            contentJsonDump: JSON.stringify({ customPacketType: "greymarchChoice", type: data.type, id: data.id, name: data.name }),
        };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
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
    greymarchAdminShow(): any {
        if (this.greymarchScreenUp) return; // not while the select screen or the loading veil is up
        this.greymarchAdminOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchAdminToPage("show", true);
    }
    greymarchAdminHide(): any {
        this.greymarchAdminOn = false;
        this.greymarchAdminToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!(this.greymarchProfOn || this.greymarchChanceryOn)); }
    }
    greymarchAdminSend(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchAdmin", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // F7 opens the panel (the page itself closes it with F7 or Escape). Escape also closes it from here, because the game un-focuses the browser on Escape.
    greymarchKey(e: any): any {
        if (e.code === 19) { var rDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) rDown = false; if (rDown && !this.greymarchKey19 && this.greymarchWolfOn && !this.greymarchChatTyping) this.greymarchWolfRoarAt = Date.now(); this.greymarchKey19 = rDown; return; } // R: the werewolf roars (greymarchWolfTick; only while changed)
        if (e.code === 44) { var zDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) zDown = false; if (zDown && !this.greymarchKey44 && this.greymarchWolfOn && !this.greymarchChatTyping) this.greymarchWolfBackAt = Date.now(); this.greymarchKey44 = zDown; return; } // Z while changed: ask the server to change back (greymarchWolfTick)
        if (e.code === 256 || e.code === 257) { var mDown = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true); if (e.isUp === true) mDown = false; if (mDown && !this["greymarchKey" + e.code]) this.greymarchShapeButton(e.code === 257); this["greymarchKey" + e.code] = mDown; return; } // mouse buttons: a creature's attacks (greymarchShapeTick)
        if (e.code !== 65 && e.code !== 1 && e.code !== 45 && e.code !== 28 && e.code !== 37) return;
        var down = typeof e.isDown === "function" ? e.isDown() : (e.isDown === true || e.isPressed === true);
        if (e.isUp === true) down = false;
        if (e.code === 1 && down && this.greymarchChatTyping) { this.greymarchChatClose(); return; } // Esc cancels whenever the input is open (the messages stay on screen), whatever the key-up history says
        if (e.code === 28) { if (down && e.isRepeating !== true) { this.greymarchChatWanted = Date.now(); if (!this.greymarchEnterSeen) { this.greymarchEnterSeen = true; this.greymarchLog("chat: the first Enter press reached the game"); } } return; } // Enter: the chat is opened from the update phase (greymarchChatPending), where the game's menus can be asked about; a held key does not repeat it and a missed key-up can never swallow the next press
        var was = this["greymarchKey" + e.code];
        this["greymarchKey" + e.code] = down;
        if (e.code === 45 && !down && was) { this.greymarchMenuRelease(); return; } // X let go
        if (!down || was) return;
        if (e.code === 45 && !this.greymarchMenuOn && !this.greymarchAdminOn && !this.greymarchChatTyping) this.greymarchMenuHold(); // X held while looking at a player
        else if (e.code === 1 && this.greymarchMenuOn) this.greymarchMenuEscape();
        else if (e.code === 65 && !this.greymarchAdminOn && !this.greymarchMenuOn) this.greymarchAdminShow();
        else if (e.code === 37 && !this.greymarchChatTyping && !(this.greymarchProfOn || this.greymarchChanceryOn)) this.greymarchProfShow(); // K opens the professions window (the page itself closes it with K or Esc, like the staff panel with F7)
        else if (e.code === 1 && this.greymarchProfOn) this.greymarchProfHide();
        else if (e.code === 1 && this.greymarchChanceryOn) this.greymarchChanceryHide();
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
            // R: the roar (the vanilla howl animation of the beast body, with its own sound). Only while changed, not mid-transformation, not in a menu, once every WOLF_ROAR_MS.
            var roarAt = this.greymarchWolfRoarAt;
            if (roarAt) {
                this.greymarchWolfRoarAt = 0;
                var inMenu = false; try { inMenu = !!sp.Utility.isInMenuMode(); } catch (mErr) { inMenu = false; }
                if (this.greymarchWolfOn && !this.greymarchWolfMorph && this.greymarchWolfIsBeast(raceId) && !inMenu && now - roarAt < 1000 && now >= (this.greymarchWolfRoarNext || 0)) {
                    this.greymarchWolfRoarNext = now + WOLF_ROAR_MS;
                    sp.Debug.sendAnimationEvent(player, "HowlStart");
                    this.greymarchWolfRoarRelease = now + 200; // released at once: a short howl, as a quick tap of the shout key does it
                    this.greymarchLog("wolf: roar");
                }
            }
            if (this.greymarchWolfRoarRelease && now >= this.greymarchWolfRoarRelease) { this.greymarchWolfRoarRelease = 0; if (this.greymarchWolfOn) sp.Debug.sendAnimationEvent(player, "HowlRelease"); }
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
        var sp = this.sp;
        this.greymarchWolfOn = true;
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
            step = "unequip"; player.unequipAll();
            step = "race"; var wr = this.greymarchWolfRace(); if (!wr) throw new Error("the werewolf race was not found");
            player.setRace(wr);
            step = "check"; var r = player.getRace();
            this.greymarchLog("wolf: changed into the " + (this.greymarchWolfAlpha ? "Alpha " : this.greymarchWolfPup ? "pup " : "") + "beast (race now " + (r ? r.getFormID().toString(16) : "none") + ", will change back to " + (this.greymarchWolfHumanRace || 0).toString(16) + ")");
        } catch (bErr) {
            this.greymarchLog("wolf: the change failed at step '" + step + "': " + bErr);
        }
    }
    // The way back, as the vanilla ActuallyShiftBackIfNecessary does it.
    greymarchWolfUnbecome(player: any): any {
        var sp = this.sp;
        this.greymarchWolfOn = false;
        this.greymarchWolfRoarRelease = 0;
        if (this.greymarchWolfMorph) { // still in the transformation animation: nothing was changed yet, only the animation is stopped
            this.greymarchWolfMorph = null;
            try { sp.Debug.sendAnimationEvent(player, "IdleForceDefaultState"); } catch (sErr) { /* it ends by itself */ }
            this.greymarchLog("wolf: the transformation was stopped before the body changed");
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
            var r = player.getRace();
            this.greymarchLog("wolf: changed back (race now " + (r ? r.getFormID().toString(16) : "none") + ")");
        } catch (uErr) {
            this.greymarchLog("wolf: changing back failed at step '" + step + "': " + uErr);
        }
    }
    // THE ALPHA FORM (the server says alpha: true): a white/grey werewolf, 1.3 times the size, the race GM_AlphaWerewolfBeastRace in GreymarchCore.esp (0x804; a copy of
    // WerewolfBeastRace with its own skin, the vanilla body with the white textures, and 1.3 times its height). GreymarchCore.esp is not on the server's plugin list, so the
    // server cannot name the race by number: it says alpha and this code finds the race in the file. If it is missing, the normal werewolf race is used.
    // THE PUP (the server says pup: true): a smaller brown werewolf, 0.75 times the size, GM_PupWerewolfBeastRace (0x80A in GreymarchCore.esp), found the same way.
    greymarchWolfKindRaceId(kind: string): number {
        var cache = this.greymarchWolfKindIds || (this.greymarchWolfKindIds = {});
        if (cache[kind] === undefined) {
            var id = 0, local = kind === "pup" ? 0x80a : 0x804, name = kind === "pup" ? "pup" : "Alpha";
            try { var f = this.sp.Game.getFormFromFile(local, "GreymarchCore.esp"); id = f ? f.getFormID() : 0; } catch (e) { id = 0; }
            cache[kind] = id;
            this.greymarchLog(id ? "wolf: the " + name + " race is " + id.toString(16) : "wolf: the " + name + " race is not in GreymarchCore.esp; the " + name + " form uses the normal werewolf");
        }
        return cache[kind];
    }
    greymarchWolfAlphaRaceId(): number { return this.greymarchWolfKindRaceId("alpha"); }
    greymarchWolfPupRaceId(): number { return this.greymarchWolfKindRaceId("pup"); }
    greymarchWolfIsBeast(raceId: number): boolean { return raceId === 0xcdd84 || (!!raceId && (raceId === this.greymarchWolfAlphaRaceId() || raceId === this.greymarchWolfPupRaceId())); }
    greymarchWolfRaceId(): number { return (this.greymarchWolfAlpha && this.greymarchWolfAlphaRaceId()) || (this.greymarchWolfPup && this.greymarchWolfPupRaceId()) || 0xcdd84; }
    greymarchWolfRace(): any { return this.sp.Race.from(this.sp.Game.getFormEx(this.greymarchWolfRaceId())); }
    // Other players who are Alphas or pups: SkyMP draws them with the race of their appearance, which the server can only set to the normal werewolf.
    // Every second, a listed player drawn as the normal werewolf (or as the other variant) is given their variant's race on this screen; one that is not listed any more
    // goes back to the normal werewolf.
    greymarchWolfAlphaOthers(now: number): any {
        if (now < (this.greymarchWolfAlphaNext || 0)) return;
        this.greymarchWolfAlphaNext = now + 1000;
        var alphas = this.greymarchWolfAlphaList || [], pups = this.greymarchWolfPupList || [];
        var drawn = this.greymarchWolfAlphaDrawn || (this.greymarchWolfAlphaDrawn = {});
        if (!alphas.length && !pups.length && !Object.keys(drawn).length) return;
        var sp = this.sp;
        var alphaId = alphas.length ? this.greymarchWolfAlphaRaceId() : 0, pupId = pups.length ? this.greymarchWolfPupRaceId() : 0;
        var want: any = {};
        var self = this;
        var mark = function (list: any[], raceId: number, name: string) {
            if (!raceId) return;
            for (var i = 0; i < list.length; i++) {
                if (list[i] === self.greymarchMeActor) continue; // my own body is changed by greymarchWolfTick
                var localId = misc.remoteIdToLocalId(list[i]);
                if (!localId) continue;
                want[localId] = raceId;
                try {
                    var actor = sp.Actor.from(sp.Game.getFormEx(localId));
                    var r = actor ? actor.getRace() : null;
                    var cur = r ? r.getFormID() : 0;
                    if (cur === raceId) drawn[localId] = raceId;
                    else if (cur && self.greymarchWolfIsBeast(cur)) { actor.setRace(sp.Race.from(sp.Game.getFormEx(raceId))); drawn[localId] = raceId; self.greymarchLog("wolf: " + localId.toString(16) + " drawn as the " + name); }
                } catch (aErr) { /* not loaded here: the next second */ }
            }
        };
        mark(alphas, alphaId, "Alpha");
        mark(pups, pupId, "pup");
        for (var k in drawn) {
            if (want[k]) continue;
            var was = drawn[k];
            delete drawn[k];
            try { var a2 = sp.Actor.from(sp.Game.getFormEx(Number(k))); var r2 = a2 ? a2.getRace() : null; if (r2 && r2.getFormID() === was) a2.setRace(sp.Race.from(sp.Game.getFormEx(0xcdd84))); } catch (bErr) { /* gone */ }
        }
    }
    greymarchWolfReport(beast: boolean): any {
        this.greymarchLog("wolf: telling the server the player " + (beast ? "became the beast (the power was used)" : "is human again"));
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchWolf", op: "game", beast: beast }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
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
            this.greymarchShapeWant = { race: race, back: Number(msg.back) >>> 0, name: String(msg.name || ""), normal: names(at.normal), power: names(at.power) };
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
                if (this.greymarchShapeOn !== want.race) this.greymarchShapeBecome(player, want, raceId);
                else if (raceId !== want.race && now - (this.greymarchShapeFixAt || 0) > 3000) { // something put another race back (a respawn, the game itself)
                    this.greymarchShapeFixAt = now;
                    var r = sp.Race.from(sp.Game.getFormEx(want.race));
                    if (r) { player.setRace(r); this.greymarchLog("shape: the race was not the creature's any more: set again"); }
                }
                this.greymarchShapeAttackTick(player, want, now);
            } else if (this.greymarchShapeOn) this.greymarchShapeUnbecome(player, raceId);
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
                sp.Debug.sendAnimationEvent(player, ev);
                this.greymarchShapeLastSwing = { at: now, power: power };
                this.greymarchShapeReport = { at: now + SHAPE_LAND_MS, power: power };
                if (!this.greymarchShapeSwingLogged) { this.greymarchShapeSwingLogged = true; this.greymarchLog("shape: first attack (" + ev + ")"); }
            }
        }
        var rep = this.greymarchShapeReport;
        if (rep && now >= rep.at) {
            this.greymarchShapeReport = null;
            var target = 0;
            try { var ref = sp.Game.getCurrentCrosshairRef(); var id = ref ? ref.getFormID() : 0; if (id >= 0xff000000) target = misc.localIdToRemoteId(id); } catch (cErr) { target = 0; } // the one under the crosshair, if any (the server checks reach and facing)
            var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchShapeAttack", power: rep.power, target: target }) };
            this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
        }
    }
    // The body. Before the race changes: the character's own head (hair, face, brows) is taken off the character record, or it is drawn stretched over the creature's skeleton
    // (black spikes where the head should be), and the record is made male (several creature races give the female slot another creature's animations). Both are put back on
    // the way back. Then ONE SetRace: remoteServer.ts no longer writes a creature race into the character (a SetRace to the race the game already "has" does nothing, and two in
    // one frame keep the first body with the second race: a headless person, or a creature's skeleton with a person's animations).
    greymarchShapeBecome(player: any, want: any, raceId: number): any {
        var sp = this.sp;
        var step = "start";
        try {
            step = "race"; var r = sp.Race.from(sp.Game.getFormEx(want.race)); if (!r) throw new Error("the race " + want.race.toString(16) + " is not in this game");
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
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchHudOn && !this.greymarchChatOn && !(this.greymarchProfOn || this.greymarchChanceryOn) && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(false); } catch (e2) { /* fine */ } }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn)) return; // not over the select screen, the staff panel, the professions window, or itself
        this.greymarchMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchMenuToPage("show", { mode: (arg && arg.mode) || "hold", looking: (arg && arg.looking) || 0, object: !!(arg && arg.object) }); // looking = the remote actor id of the player the menu is about
    }
    // HOLD X: look at a player and hold X, and the menu for THAT player appears; let go of X over an option to pick it (the page does the picking: it gets "release").
    // Not looking at a player: nothing opens (a short hint says why). The page is shown and focused while it is up, so the mouse is a cursor.
    greymarchMenuHold(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn)) return;
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
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchChatOn || !!(this.greymarchProfOn || this.greymarchChanceryOn)); }
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
    greymarchProfShow(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || (this.greymarchProfOn || this.greymarchChanceryOn) || this.greymarchChatTyping) return; // not over the select screen, the other panels, or while typing
        this.greymarchProfOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchProfToPage("show", true);
    }
    greymarchProfHide(): any {
        if (!(this.greymarchProfOn || this.greymarchChanceryOn)) return;
        this.greymarchProfOn = false;
        this.greymarchProfToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!(this.greymarchProfOn || this.greymarchChanceryOn)); }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn || this.greymarchProfOn || this.greymarchChanceryOn) return; // not over the select screen or the other panels
        this.greymarchChanceryOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchChanceryToPage("show", true);
    }
    greymarchChanceryHide(): any {
        if (!this.greymarchChanceryOn) return;
        this.greymarchChanceryOn = false;
        this.greymarchChanceryToPage("hide", true);
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn || !!this.greymarchProfOn); }
    }
    greymarchChanceryAsk(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchChancery", rid: data.rid, op: data.op, args: data.args }) };
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
    greymarchChatSync(pageTyping: boolean): any {
        if (this.greymarchChatTyping && !pageTyping) {
            if (Date.now() - (this.greymarchChatOpenedAt || 0) < 1000) return;
            this.greymarchLog("chat: the game thought it was typing and the page was not; released the keyboard");
            this.greymarchChatFocus(false);
        } else if (!this.greymarchChatTyping && pageTyping) {
            this.greymarchChatFocus(true); // the page is showing its input: it gets the keyboard
        } else if (!pageTyping && !this.greymarchScreenUp && !this.greymarchAdminOn && !this.greymarchMenuOn) {
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
            if (now < (this.greymarchChatReleaseUntil || 0) && !this.greymarchScreenUp && !this.greymarchAdminOn && !this.greymarchMenuOn) { try { this.sp.browser.setFocused(false); } catch (e0) { /* nothing to release */ } }
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
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchProfOn && !this.greymarchChanceryOn) return;
        var focused = true;
        try { focused = !!this.sp.browser.isFocused(); } catch (e) { focused = true; } // cannot tell: leave the window alone
        if (focused) return;
        this.greymarchLog("chat: Enter reached the game while " + [this.greymarchAdminOn ? "the staff panel" : "", this.greymarchMenuOn ? "the X menu" : "", this.greymarchProfOn ? "the K window" : "", this.greymarchChanceryOn ? "the chancery" : ""].filter(Boolean).join(", ") + " was marked open without the keyboard; closed it so the chat opens");
        if (this.greymarchAdminOn) { try { this.greymarchAdminHide(); } catch (e1) { this.greymarchAdminOn = false; } }
        if (this.greymarchMenuOn) { try { this.greymarchMenuHide(); } catch (e2) { this.greymarchMenuOn = false; } }
        if (this.greymarchProfOn) { try { this.greymarchProfHide(); } catch (e3) { this.greymarchProfOn = false; } }
        if (this.greymarchChanceryOn) { try { this.greymarchChanceryHide(); } catch (e4) { this.greymarchChanceryOn = false; } }
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
        if (!this.greymarchScreenUp && !this.greymarchAdminOn && !this.greymarchMenuOn) this.sp.browser.setFocused(false);
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
