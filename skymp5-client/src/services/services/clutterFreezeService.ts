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
// THE SWEEP (2026-11-05, the owner: weapons, shields and the plates in the keep still got thrown about): the load event alone missed some, so at the times of SWEEP_AT_MS and
// on every cell change the player's own cell is walked (SWEEP_PER_UPDATE references a frame) and any loose object from the world that is not frozen yet is
// frozen. What a sweep had to catch is written to greymarch-logs.txt (at most LOG_LINES lines a session).
// LIGHTER (2026-11-06, the owner: players lost frames since the update): it walked 200 references a frame with several game calls each and started over every
// 2 s for as long as the player stayed, so a big cell (a town, a palace) cost part of almost every frame. Now a cell is swept SWEEP_AT_MS after the player
// enters it (at once, 3 s, 10 s and 30 s in) and then not again until the next cell, SWEEP_PER_UPDATE references a frame, and a reference found not to be
// loose clutter (or already frozen) is not asked about again in that visit.
// WEAPON RACKS: the sweep also puts each rack's starting weapon or shield onto the rack's pivot node, as the game's rack script would (rack() below).
import { FormType, MotionType } from "skyrimPlatform";
import { logError } from "../../logging";
import { ConnectionMessage } from "../events/connectionMessage";
import { CustomPacketMessage } from "../messages/customPacketMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";

export const DROP_SETTLE_MS = 3000;
export const PER_UPDATE = 150; // references looked at per frame (a cell load reports hundreds)
export const MAX_WAITING = 6000;
export const SWEEP_AT_MS: readonly number[] = [0, 3000, 10000, 30000];
export const SWEEP_PER_UPDATE = 30;
export const LOG_LINES = 40;
// OFF (2026-11-05, the owner: the game kept crashing in Bruma Castle): the game crashed seconds after the sweep moved its 27 rack items onto their racks
// (moveToNode). Kept for a later look; the racks are left as they are.
export const RACKS_ON = false;
export const WRACK_TRIGGER = 0x06d95e; // Skyrim.esm WRackTrigger: a rack's activator -> its trigger (the part with the pivot nodes)
export const WEAPTYPE_WARHAMMER = 0x06d930; // Skyrim.esm WeapTypeWarhammer: a two-handed blunt weapon is a warhammer, else a battleaxe
// Weapon.GetWeaponType -> the rack's pivot node (1 sword, 2 dagger, 3 war axe, 4 mace, 5 greatsword, 7 bow, 8 staff, 9 crossbow; 6 is the battleaxe or warhammer)
export const WEAPON_PIVOTS: Record<number, string> = { 1: "SwordPivot01", 2: "DaggerPivot01", 3: "WarAxePivot01", 4: "MacePivot01", 5: "GreatSwordPivot01", 7: "BowPivot01", 8: "StaffPivot01", 9: "BowPivot01" };
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
    private sweep: { cellId: number; n: number; i: number; caught: number; loose: number; racked: number; food: number; foodOff: number; food3d: number; ids: number[] } | null = null;
    private seenLoose = new Map<number, number[]>(); // cell -> the loose objects from the world it had on the first visit (to log what a later visit lacks)
    private sweepsInCell = 0; // completed sweeps since the player entered this cell: the 1st and the last (30 s in) are written to the log
    private enteredAt = 0; // when the player entered this cell (SWEEP_AT_MS counts from here)
    private visitLoose = new Set<number>(); // the loose objects from the world seen in this cell this visit (a settled one is not looked at again)
    private settled = new Set<number>(); // indices in this cell's reference list that need no more looks this visit (not loose, made in game, frozen)
    private racked = new Set<number>(); // rack activators handled since the player entered this cell
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

    // the player's cell, walked a little every frame at the times of SWEEP_AT_MS: any loose object from the world that is not frozen yet is frozen now
    private onSweepUpdate() {
        const now = Date.now();
        if (!this.sweep) {
            const here = this.playerCellId();
            if (!here) return;
            if (here === this.cellId) {
                if (this.sweepsInCell >= SWEEP_AT_MS.length) return; // this visit's sweeps are done: the load event keeps up from here
                if (now - this.enteredAt < SWEEP_AT_MS[this.sweepsInCell]) return;
            }
            const cell = this.playerCell();
            if (!cell) return;
            let id = 0, n = 0;
            try { id = cell.getFormID(); n = cell.getNumRefs(0); } catch (err) { return; }
            if (id !== this.cellId) { this.cellId = id; this.frozen.clear(); this.racked.clear(); this.settled.clear(); this.visitLoose.clear(); this.sweepsInCell = 0; this.enteredAt = now; }
            this.sweep = { cellId: id, n, i: 0, caught: 0, loose: 0, racked: 0, food: 0, foodOff: 0, food3d: 0, ids: [] };
        }
        const s = this.sweep;
        let cell: any = null;
        try { cell = this.sp.Cell.from(this.sp.Game.getFormEx(s.cellId)); } catch (err) { cell = null; }
        if (!cell) { this.sweep = null; return; }
        const end = Math.min(s.n, s.i + SWEEP_PER_UPDATE);
        for (; s.i < end; s.i++) {
            if (this.settled.has(s.i)) continue;
            try {
                const ref = cell.getNthRef(s.i, 0);
                if (!ref) continue;
                const id = ref.getFormID();
                if (madeInGame(id)) { this.settled.add(s.i); continue; } // a dropped item: the load event freezes it once it has fallen
                const base = ref.getBaseObject();
                if (!base) continue;
                if (base.getType() === FormType.Activator) { if (RACKS_ON) { if (this.rack(ref, id)) s.racked++; } else this.settled.add(s.i); continue; }
                if (!isLoose(base.getType())) { this.settled.add(s.i); continue; }
                s.loose++;
                s.ids.push(id);
                this.visitLoose.add(id);
                if (base.getType() === FormType.Potion) { s.food++; if (ref.isDisabled()) s.foodOff++; if (ref.is3DLoaded()) s.food3d++; }
                if (this.frozen.has(id)) { this.settled.add(s.i); continue; }
                if (!ref.is3DLoaded()) continue;
                this.freeze(ref, id);
                this.settled.add(s.i);
                s.caught++;
            } catch (err) {
                /* gone */
            }
        }
        if (s.i < s.n) return;
        this.sweep = null;
        this.sweepsInCell++;
        if ((s.caught > 0 || s.racked > 0 || this.sweepsInCell === 1 || this.sweepsInCell === SWEEP_AT_MS.length) && this.logsLeft > 0) {
            this.logsLeft--;
            if (this.sweepsInCell === SWEEP_AT_MS.length) this.compareVisits(s.cellId, [...this.visitLoose]);
            if (this.sweepsInCell === SWEEP_AT_MS.length && (s.cellId >>> 0) === 0x1677c) this.probe();
            try { this.sp.writeLogs("greymarch", "clutter: cell " + (s.cellId >>> 0).toString(16) + " (sweep " + this.sweepsInCell + ", " + s.n + " references): " + s.loose + " loose objects, " + s.caught + " frozen by the sweep (the load event missed them), " + s.racked + " put on their racks; food and potions " + s.food + " (" + s.foodOff + " disabled, " + s.food3d + " drawn)"); } catch (err) { /* no log */ }
        }
    }

    // A WEAPON RACK (2026-11-05, the owner: Bruma's weapons and shields hung beside their racks): the rack's activator links to its trigger (keyword WRackTrigger)
    // and, with no keyword, to the item it starts with. The game's script (WeaponRackActivateSCRIPT) moves that item onto the trigger's pivot node for its kind
    // when the cell loads; scripts never run here, so the item stayed where the editor dropped it. Done here instead, once a cell visit, then frozen in place.
    private rack(activator: any, id: number): boolean {
        if (this.racked.has(id)) return false;
        const kw = this.keyword(WRACK_TRIGGER);
        if (!kw) return false;
        const trigger = activator.getLinkedRef(kw);
        if (!trigger) { this.racked.add(id); return false; } // some other activator
        const item = activator.getLinkedRef(null);
        if (!item) { this.racked.add(id); return false; } // an empty rack
        if (!item.is3DLoaded() || !trigger.is3DLoaded()) return false; // the next sweep
        this.racked.add(id);
        const node = this.pivotOf(item.getBaseObject());
        if (!node) return false;
        const moved = item.moveToNode(trigger, node);
        const done = () => this.freeze(item, item.getFormID());
        if (moved && typeof moved.then === "function") moved.then(done, () => { /* its 3D went away */ }); else done();
        return true;
    }

    // the pivot node of a rack for an item: ShieldPivot01 for a shield, else by the weapon's kind
    private pivotOf(base: any): string {
        if (!base) return "";
        const t = base.getType();
        if (t === FormType.Armor) return "ShieldPivot01";
        if (t !== FormType.Weapon) return "";
        const w = this.sp.Weapon.from(base);
        const kind = w ? w.getWeaponType() : 0;
        if (kind === 6) { const hammer = this.keyword(WEAPTYPE_WARHAMMER); return hammer && base.hasKeyword(hammer) ? "WarhammerPivot01" : "BattleAxePivot01"; }
        return WEAPON_PIVOTS[kind] || "";
    }

    private keyword(formId: number): any {
        try { return this.sp.Keyword.from(this.sp.Game.getFormEx(formId)); } catch (err) { return null; }
    }

    // DIAGNOSTIC (2026-11-05, the Palace of the Kings' table food gone on a second visit): the first visit's loose objects are kept; a later visit logs how
    // many are missing and, for a few, what the game says about them (there at all, deleted, disabled, in which cell, where)
    private compareVisits(cellId: number, ids: number[]) {
        const before = this.seenLoose.get(cellId);
        if (!before) { if (this.seenLoose.size < 50) this.seenLoose.set(cellId, ids.slice()); return; }
        const now = new Set(ids);
        const missing = before.filter((id) => !now.has(id));
        const say = (t: string) => { try { this.sp.writeLogs("greymarch", t); } catch (err) { /* no log */ } };
        say("clutter: cell " + (cellId >>> 0).toString(16) + " again: " + missing.length + " of the first visit's " + before.length + " loose objects missing");
        for (const id of missing.slice(0, 8)) {
            let t = "  missing " + (id >>> 0).toString(16) + ": ";
            try {
                const form = this.sp.Game.getFormEx(id);
                const ref = form ? this.sp.ObjectReference.from(form) : null;
                if (!ref) t += form ? "a form, not a reference" : "no such form";
                else {
                    const c = ref.getParentCell();
                    const b = ref.getBaseObject();
                    t += (b ? b.getName() + " (type " + b.getType() + ")" : "no base") + ", deleted " + ref.isDeleted() + ", disabled " + ref.isDisabled() + ", 3D " + ref.is3DLoaded()
                        + ", cell " + (c ? (c.getFormID() >>> 0).toString(16) : "none") + ", at " + [ref.getPositionX(), ref.getPositionY(), ref.getPositionZ()].map((v: number) => Math.round(v)).join(",");
                }
            } catch (err) { t += "error " + err; }
            say(t);
        }
    }

    // DIAGNOSTIC: a few of the Palace of the Kings' table foods, looked up by their plugin ids
    private probe() {
        const say = (t: string) => { try { this.sp.writeLogs("greymarch", t); } catch (err) { /* no log */ } };
        for (const [id, file] of [[0xeb4, "JK's Palace of the Kings.esp"], [0xec1, "JK's Palace of the Kings.esp"], [0xed6, "JK's Palace of the Kings.esp"], [0xc1140, "Skyrim.esm"], [0xc114c, "Skyrim.esm"]] as [number, string][]) {
            let t = "  probe " + file + " " + id.toString(16) + ": ";
            try {
                const form = this.sp.Game.getFormFromFile(id, file);
                const ref = form ? this.sp.ObjectReference.from(form) : null;
                if (!ref) t += form ? "a form, not a reference" : "no such form";
                else {
                    const c = ref.getParentCell();
                    const b = ref.getBaseObject();
                    t += "id " + (ref.getFormID() >>> 0).toString(16) + ", " + (b ? b.getName() : "no base") + ", deleted " + ref.isDeleted() + ", disabled " + ref.isDisabled() + ", 3D " + ref.is3DLoaded()
                        + ", cell " + (c ? (c.getFormID() >>> 0).toString(16) : "none") + ", at " + [ref.getPositionX(), ref.getPositionY(), ref.getPositionZ()].map((v: number) => Math.round(v)).join(",");
                }
            } catch (err) { t += "error " + err; }
            say(t);
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
