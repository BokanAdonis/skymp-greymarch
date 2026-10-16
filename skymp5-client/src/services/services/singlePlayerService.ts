import { ClientListener, CombinedController, Sp } from "./clientListener";
import { GameLoadEvent } from "../events/gameLoadEvent";
import { NetworkingService } from "./networkingService";
import { MsgType } from "../../messages";

// GREYMARCH: a load SkyMP did not start while the player is connected (New Game / Continue at the main menu loads their own single-player save,
// with its own place and its own items) is UNDONE instead of dropping the player to single-player: the server is asked to load them again from
// its own record (place, look and exactly the items it holds; select.js "greymarchReload"). Asked at most once every RELOAD_GAP_MS (a second
// press meanwhile waits for that load). Offline, SkyMP's old single-player switch still happens.
const RELOAD_GAP_MS = 10000;

export class SinglePlayerService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.emitter.on("gameLoad", (e) => this.onGameLoad(e));
    }

    get isSinglePlayer() {
        return this._isSinglePlayer;
    }

    private onGameLoad(event: GameLoadEvent) {
        if (!event.isCausedBySkyrimPlatform && !this._isSinglePlayer) {
            if (this.greymarchAskReload()) return;
            try { (this.controller.emitter as any).emit("greymarchStage", "stage: SWITCHING TO SINGLE-PLAYER (a game load SkyMP did not start)"); } catch (e) { /* GREYMARCH: diagnostics only */ }
            this.sp.Debug.messageBox(
                'Save has been loaded in multiplayer, switching to the single-player mode',
            );
            this.controller.lookupListener(NetworkingService).close();
            this._isSinglePlayer = true;
            this.sp.Game.setInChargen(false, false, false);
        }
    }

    // GREYMARCH: true when the server was asked to load the player again (see the note at the top)
    private greymarchAskReload(): boolean {
        let connected = false;
        try { connected = this.controller.lookupListener(NetworkingService).isConnected(); } catch (e) { connected = false; }
        if (!connected) {
            // started by the launcher and not connected YET: the login is on its way, and when it connects the server's world is loaded over this
            // one (loadGameService greymarchForeignWorld). No single-player switch, no "switching to the single-player mode" box.
            let autoplay = false;
            try { autoplay = !!((this.sp as any).settings["skymp5-client"] || {})["greymarch-autoplay"]; } catch (e) { autoplay = false; }
            if (autoplay) { try { (this.controller.emitter as any).emit("greymarchStage", "stage: a game load before connecting (New Game / Continue?): the server's world will be loaded when connected"); } catch (e) { /* diagnostics only */ } }
            return autoplay;
        }
        const now = Date.now();
        if (now - this._greymarchReloadAt < RELOAD_GAP_MS) return true; // asked a moment ago (pressed twice): the server's load is on its way
        this._greymarchReloadAt = now;
        try { (this.controller.emitter as any).emit("greymarchStage", "stage: a game load SkyMP did not start (New Game / Continue?): asking the server to load me again"); } catch (e) { /* diagnostics only */ }
        const message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchReload" }) };
        this.controller.emitter.emit("sendMessage", { message: message, reliability: "reliable" } as any);
        try { this.sp.Debug.notification("That loads your own single-player game. Greymarch is putting you back."); } catch (e) { /* a nicety */ }
        return true;
    }

    private _isSinglePlayer = false;
    private _greymarchReloadAt = 0;
}
