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

export class GreymarchBridge {
    [key: string]: any;

    constructor(public sp: any, public controller: any) {
        this.controller.on("browserMessage", (e: any) => this.greymarchBrowserMessage(e));
        this.controller.on("buttonEvent", (e: any) => this.greymarchKey(e)); // F7 opens the staff panel
        try { this.sp.on("hit", (e: any) => this.greymarchHit(e)); } catch (hitErr) { /* no hit events: the combat history stays empty */ }
        this.controller.on("update", () => this.greymarchTick()); // Skyrim functions only work in the update phase, never in tick
        this.controller.emitter.on("greymarchStage", (text: string) => this.greymarchLog(text)); // other services report where the game is, for the server log
        this.controller.emitter.on("greymarchHead", (e: any) => { const m = this.greymarchHeads || (this.greymarchHeads = {}); m[e.name] = { x: e.x, y: e.y, at: Date.now() }; this.greymarchRes = { w: e.rw, h: e.rh }; }); // where each named player's head is on screen (for the microphone icon)
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
        if (type === "greymarchMenuEvent") { if ((msg.type === "trade_invite" || msg.type === "trade") && !this.greymarchMenuOn) this.greymarchMenuShow({ mode: "invite", looking: 0 }); this.greymarchMenuToPage("event", msg); return; }
        if (type === "greymarchFx") { this.greymarchFxWant = { noclip: !!msg.noclip, speed: Number(msg.speed) || 100, frozen: !!msg.frozen, god: !!msg.god }; if (msg.me) this.greymarchMeActor = msg.me; return; }
        if (type === "greymarchGhosts") { this.greymarchGhostList = Array.isArray(msg.ghosts) ? msg.ghosts : []; if (msg.me) this.greymarchMeActor = msg.me; this.greymarchOthers = Array.isArray(msg.others) ? msg.others : []; if (msg.stats !== undefined) this.greymarchStatsWant = msg.stats && typeof msg.stats === "object" ? msg.stats : null; var inv = Array.isArray(msg.invisible) ? msg.invisible : []; this.greymarchInvisList = inv; var invMap = {}; for (var q = 0; q < inv.length; q++) if (inv[q] !== msg.me) invMap[inv[q]] = true; try { Function("return this")().__gmInvisible = invMap; } catch (gErr) { /* names stay visible */ } return; }
        this.sp.printConsole("[greymarch] got " + type + (msg.characters ? " with " + msg.characters.length + " character(s)" : ""));
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
        this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchMenuOn || !!this.greymarchChatOn); // stays visible (but never focused) while the voice display is on; the staff panel keeps it up and focused
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
        // The voice display: while someone is talking, tell it where their head is on screen (10 times a second) so the microphone follows them.
        var vo = this.greymarchVoice;
        if (vo && vo.hud) {
            var hNow = Date.now();
            if (!this.greymarchHeadNext || hNow >= this.greymarchHeadNext) {
                this.greymarchHeadNext = hNow + 100;
                var hs = this.greymarchHeads || {}, list = [];
                for (var hi = 0; hi < vo.speaking.length; hi++) { var hd = hs[vo.speaking[hi]]; if (hd && hNow - hd.at < 400) list.push({ id: vo.speaking[hi], x: hd.x, y: hd.y }); }
                if (list.length || this.greymarchHeadsShown) {
                    this.greymarchHeadsShown = list.length > 0;
                    var res = this.greymarchRes || { w: 0, h: 0 };
                    this.greymarchHudToPage("heads", { list: list, w: res.w, h: res.h });
                }
            }
        }
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
        this.greymarchHudOn = hud;
        // the page is shown (never focused) while the display is on, hidden when it is off; the select screen and the veil decide for themselves while they are up
        if (changed && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(hud || !!this.greymarchChatOn); if (!this.greymarchChatTyping) this.sp.browser.setFocused(false); } catch (err) { /* nothing to do */ } }
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
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchMenuOn || !!this.greymarchChatOn); }
    }
    greymarchAdminSend(data: any): any {
        var message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchAdmin", rid: data.rid, op: data.op, args: data.args }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" });
    }
    // F7 opens the panel (the page itself closes it with F7 or Escape). Escape also closes it from here, because the game un-focuses the browser on Escape.
    greymarchKey(e: any): any {
        if (e.code !== 65 && e.code !== 1 && e.code !== 45 && e.code !== 28) return;
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
        else if (e.code === 1 && this.greymarchAdminOn) this.greymarchAdminHide();
    }
    // Staff effects, applied in the update phase. Each is switched on or off only when it CHANGES, so the game is never fought with.
    greymarchEffects(): any {
        var now = Date.now();
        if (now < (this.greymarchFxNext || 0)) return;
        this.greymarchFxNext = now + 400;
        var want = this.greymarchFxWant;
        var ghosts = this.greymarchGhostList;
        if (!want && !(ghosts && ghosts.length) && !this.greymarchGhostApplied && !(this.greymarchInvisList && this.greymarchInvisList.length) && !this.greymarchInvApplied && !(this.greymarchOthers && this.greymarchOthers.length) && !this.greymarchStatsWant && (this.greymarchSelfCleared || !this.greymarchMeActor)) return;
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
            this.greymarchGhostApply(now, ghosts || []); this.greymarchNamesApply(now); this.greymarchInvisApply(now); this.greymarchSeenLog(now); this.greymarchStatsApply(player);
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
        if (!this.greymarchAdminOn && !this.greymarchMenuOn && !this.greymarchHudOn && !this.greymarchChatOn && !this.greymarchScreenUp) { try { this.sp.browser.setVisible(false); } catch (e2) { /* fine */ } }
    }
    // KILL: staff kill a character from THEIR OWN game, which is the one thing every SkyMP build lets a game do to its own character.
    greymarchKillMe(): any {
        try { var p = this.sp.Game.getPlayer(); try { p.setGhost(false); } catch (g1) { /* no such flag */ } p.kill(null); this.greymarchLog("staff: my character was killed by staff"); } catch (e3) { this.greymarchLog("staff: kill failed (" + e3 + ")"); }
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
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn) return; // not over the select screen, the staff panel, or itself
        this.greymarchMenuOn = true;
        this.sp.browser.setVisible(true);
        this.sp.browser.setFocused(true);
        this.greymarchMenuToPage("show", { mode: (arg && arg.mode) || "hold", looking: (arg && arg.looking) || 0, object: !!(arg && arg.object) }); // looking = the remote actor id of the player the menu is about
    }
    // HOLD X: look at a player and hold X, and the menu for THAT player appears; let go of X over an option to pick it (the page does the picking: it gets "release").
    // Not looking at a player: nothing opens (a short hint says why). The page is shown and focused while it is up, so the mouse is a cursor.
    greymarchMenuHold(): any {
        if (this.greymarchScreenUp || this.greymarchAdminOn || this.greymarchMenuOn) return;
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
        if (!this.greymarchScreenUp) { this.sp.browser.setFocused(false); this.sp.browser.setVisible(!!this.greymarchHudOn || !!this.greymarchAdminOn || !!this.greymarchChatOn); }
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
        this.greymarchChatOpen();
        if (!this.greymarchChatTyping) this.greymarchChatWhy("Enter did not open the input (chat on: " + !!this.greymarchChatOn + ", select screen: " + !!this.greymarchScreenUp + ", staff panel: " + !!this.greymarchAdminOn + ", X menu: " + !!this.greymarchMenuOn + ")");
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
