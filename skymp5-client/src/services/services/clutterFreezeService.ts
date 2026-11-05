// GREYMARCH: clutter stays put (2026-11-02, the owner: "I don't want players to run over a table and knock everything off").
//
// Each game moves loose objects with its own physics, so a player running or fighting through a table sent the plates, tankards and food flying in their game
// (and the server never knew). Every loose object is made keyframed (no physics: it does not move when bumped) as soon as its 3D loads (the 'objectLoaded' event,
// which fires again whenever a cell is reloaded, so the setting never wears off):
//   - what is part of the world (a reference from a plugin): at once;
//   - what was made while playing (an item a player dropped, ids from 0xff000000): after DROP_SETTLE_MS, so it falls to the ground first.
// Loose objects are items (misc, food, books, weapons, armor, potions, ingredients, keys, soul gems, scrolls, ammo, lights) and movable statics (baskets,
// buckets, barrels that are not containers). Items are still picked up with E (activation is the server's, as before); Z (grab) no longer drags clutter.
// OFF while the server says so: { customPacketType: "greymarchClutterFreeze", on: false } (the gamemode sends it while greymarch-data/clutter-freeze.off exists);
// on: true turns it back on. Turning it off only stops freezing new loads; what is frozen stays frozen until its cell loads again.
// THE SWEEP (2026-11-05, the owner: weapons, shields and the plates in the keep still got thrown about): the load event alone missed some, so every SWEEP_MS and
// on every cell change the player's own cell is walked (SWEEP_PER_UPDATE references a frame) and any loose object from the world that is not frozen yet is
// frozen. What a sweep had to catch is written to greymarch-logs.txt (at most LOG_LINES lines a session).
import { FormType, MotionType } from "skyrimPlatform";
import { logError } from "../../logging";
import { ConnectionMessage } from "../events/connectionMessage";
import { CustomPacketMessage } from "../messages/customPacketMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";

export const DROP_SETTLE_MS = 3000;
export const PER_UPDATE = 150; // references looked at per frame (a cell load reports hundreds)
export const MAX_WAITING = 6000;
export const SWEEP_MS = 2000;
export const SWEEP_PER_UPDATE = 200;
export const LOG_LINES = 40;
export const LOOSE_TYPES: ReadonlySet<number> = new Set<number>([
    FormType.Misc, FormType.Ingredient, FormType.Potion, FormType.Book, FormType.Weapon, FormType.Armor, FormType.Key, FormType.SoulGem,
    FormType.ScrollItem, FormType.Ammo, FormType.Light, FormType.MovableStatic,
]);

// true when a reference of this base type is loose clutter that should not move
export function isLoose(baseType: number): boolean {
    return LOOSE_TYPES.has(baseType);
}
// true when the reference was made while playing (a dropped item), not placed in a plugin
export function madeInGame(refId: number): boolean {
    return (refId >>> 0) >= 0xff000000;
}

export class ClutterFreezeService extends ClientListener {
    private on = true;
    private waiting: { id: number; at: number }[] = [];
    private frozen = new Set<number>(); // frozen since the player entered this cell (a 3D reload undoes it: the load event freezes those again)
    private cellId = 0;
    private sweep: { cellId: number; n: number; i: number; caught: number; loose: number } | null = null;
    private lastSweep = 0;
    private logsLeft = LOG_LINES;

    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.on("objectLoaded", (e) => this.onObjectLoaded(e));
        this.controller.on("update", () => this.onUpdate());
        this.controller.emitter.on("customPacketMessage", (e) => this.onCustomPacketMessage(e));
    }

    // only notes the reference: the game is asked about it on the next update, where Papyrus calls are always allowed
    private onObjectLoaded(e: { object: any; isLoaded: boolean }) {
        if (!this.on || !e || !e.isLoaded || !e.object) return;
        let id = 0;
        try { id = e.object.getFormID(); } catch (err) { return; }
        if (!id || this.waiting.length >= MAX_WAITING) return;
        this.waiting.push({ id, at: madeInGame(id) ? Date.now() + DROP_SETTLE_MS : 0 });
    }

    private onUpdate() {
        this.onLoadedUpdate();
        if (this.on) this.onSweepUpdate();
    }

    // the player's cell, walked a little every frame: any loose object from the world that is not frozen yet is frozen now
    private onSweepUpdate() {
        const now = Date.now();
        if (!this.sweep) {
            if (now - this.lastSweep < SWEEP_MS) {
                // a new cell starts a sweep at once
                const id = this.playerCellId();
                if (!id || id === this.cellId) return;
            }
            this.lastSweep = now;
            const cell = this.playerCell();
            if (!cell) return;
            let id = 0, n = 0;
            try { id = cell.getFormID(); n = cell.getNumRefs(0); } catch (err) { return; }
            if (id !== this.cellId) { this.cellId = id; this.frozen.clear(); }
            this.sweep = { cellId: id, n, i: 0, caught: 0, loose: 0 };
        }
        const s = this.sweep;
        let cell: any = null;
        try { cell = this.sp.Cell.from(this.sp.Game.getFormEx(s.cellId)); } catch (err) { cell = null; }
        if (!cell) { this.sweep = null; return; }
        const end = Math.min(s.n, s.i + SWEEP_PER_UPDATE);
        for (; s.i < end; s.i++) {
            try {
                const ref = cell.getNthRef(s.i, 0);
                if (!ref) continue;
                const id = ref.getFormID();
                if (madeInGame(id)) continue; // a dropped item: the load event freezes it once it has fallen
                const base = ref.getBaseObject();
                if (!base || !isLoose(base.getType())) continue;
                s.loose++;
                if (this.frozen.has(id) || !ref.is3DLoaded()) continue;
                this.freeze(ref, id);
                s.caught++;
            } catch (err) {
                /* gone */
            }
        }
        if (s.i < s.n) return;
        this.sweep = null;
        if (s.caught > 0 && this.logsLeft > 0) {
            this.logsLeft--;
            try { this.sp.writeLogs("greymarch", "clutter: cell " + (s.cellId >>> 0).toString(16) + ": " + s.loose + " loose objects, " + s.caught + " frozen by the sweep (the load event missed them)"); } catch (err) { /* no log */ }
        }
    }

    private playerCell(): any {
        try { const pl = this.sp.Game.getPlayer(); return pl ? pl.getParentCell() : null; } catch (err) { return null; }
    }
    private playerCellId(): number {
        try { const c = this.playerCell(); return c ? c.getFormID() : 0; } catch (err) { return 0; }
    }

    private onLoadedUpdate() {
        if (!this.waiting.length) return;
        const now = Date.now();
        const later: { id: number; at: number }[] = [];
        let done = 0;
        for (const w of this.waiting) {
            if (w.at > now || done >= PER_UPDATE) { later.push(w); continue; }
            done++;
            if (!this.on) continue;
            try {
                const ref = this.sp.ObjectReference.from(this.sp.Game.getFormEx(w.id));
                const base = ref ? ref.getBaseObject() : null;
                if (ref && base && isLoose(base.getType()) && ref.is3DLoaded()) this.freeze(ref, w.id);
            } catch (err) {
                /* picked up or gone */
            }
        }
        this.waiting = later;
    }

    private freeze(ref: any, id: number) {
        this.frozen.add(id >>> 0);
        try {
            const p = ref.setMotionType(MotionType.Keyframed, false);
            if (p && typeof p.catch === "function") p.catch(() => { /* its 3D went away */ });
        } catch (err) {
            /* its 3D went away */
        }
    }

    private onCustomPacketMessage(e: ConnectionMessage<CustomPacketMessage>) {
        let content: Record<string, unknown> = {};
        try {
            content = JSON.parse(e.message.contentJsonDump);
        } catch (err) {
            return;
        }
        if (content["customPacketType"] !== "greymarchClutterFreeze") return;
        this.on = content["on"] !== false;
        if (!this.on) this.waiting = [];
        try { this.sp.printConsole("clutter freeze " + (this.on ? "on" : "off")); } catch (err) { logError(this, "printConsole failed"); }
    }
}
