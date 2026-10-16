import { ClientListener, CombinedController, Sp } from "./clientListener";
import { ChangeFormNpc } from "skyrimPlatform";

export class LoadGameService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.on("loadGame", () => this.onLoadGame());
    }

    public loadGame(pos: number[], rot: number[], worldOrCell: number, changeFormNpc?: ChangeFormNpc, loadOrder?: string[], time?: { seconds: number, minutes: number, hours: number }) {
        try { (this.controller.emitter as any).emit("greymarchStage", "stage: SkyMP asks the game to load the world (cell " + (worldOrCell != null ? Number(worldOrCell).toString(16) : "?") + ")"); } catch (e) { /* GREYMARCH: diagnostics only */ }
        try {
            // @ts-ignore
            this.sp.loadGame(pos, rot, worldOrCell, changeFormNpc, loadOrder, time);
        } catch (e) {
            // Hotfix non-vanilla headparts bug
            // @ts-ignore
            this.sp.loadGame(pos, rot, worldOrCell, undefined, loadOrder, time);
        }
        this._isCausedBySkyrimPlatform = true;
        this._greymarchLoadAt = Date.now(); // GREYMARCH: see onLoadGame
        this._greymarchAnswered = false; // GREYMARCH: this request has not been answered by a load yet
        (this.controller.emitter as any).emit("greymarchStage", "stage: the game accepted the load request (it has not reported the load yet)");
    }

    private onLoadGame() {
        try { (this.controller.emitter as any).emit("greymarchStage", "stage: the game reports a load (started by SkyMP: " + !!this._isCausedBySkyrimPlatform + ", recently: " + (!!this._greymarchLoadAt && Date.now() - this._greymarchLoadAt < 8000) + ", already answered: " + this._greymarchAnswered + ")"); } catch (e) { /* GREYMARCH: diagnostics only */ }
        try {
            const gameLoadEvent = {
                // GREYMARCH: a slow PC's load event can arrive after the flag was cleared, so a load within 8 seconds of SkyMP starting one still counts as SkyMP's own
                // But only ONE load per request: a second one within those 8 seconds is the player's own (New Game / Continue at the main menu loads
                // their single-player save, with its own place and items: seen 2026-10-16), not SkyMP's.
                isCausedBySkyrimPlatform: this._isCausedBySkyrimPlatform || (!!this._greymarchLoadAt && Date.now() - this._greymarchLoadAt < 8000 && !this._greymarchAnswered)
            };
            if (gameLoadEvent.isCausedBySkyrimPlatform) this._greymarchAnswered = true; // GREYMARCH
            this.controller.emitter.emit("gameLoad", gameLoadEvent);
        } catch (e) {
            this.controller.once("tick", () => {
                this._isCausedBySkyrimPlatform = false;
            });
            throw e;
        }
        this.controller.once("tick", () => {
            this._isCausedBySkyrimPlatform = false;
        });
    }

    private _isCausedBySkyrimPlatform = false;
    private _greymarchLoadAt = 0; // GREYMARCH
    private _greymarchAnswered = true; // GREYMARCH: the latest request already had its load (true before any request)
}
