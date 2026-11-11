// GREYMARCH: the player's spells at login (2026-11-11, the owner: "Magic and Beast Blood are sometimes lost at launch").
//
// SkyMP gave the game its spell list once, in the "this is your body" message, and one second later wiped every spell and learned that list again.
// Two things went wrong with character select on (bodyHold.ts):
//   - the server teaches spells the moment a character enters (the Beast Form power, vampire powers, ...) with Actor.AddSpell, which reaches the game
//     as a snippet; while the body is still held the game does not know which actor is its own yet, so those snippets fail;
//   - the list in the body message was made BEFORE that teaching, so the wipe one second later removed whatever did get through.
// The server then believes the spell is known and never sends it again, so it stays missing until the next login (or forever, for Beast Form).
//
// Now the game keeps the spell list the server means: the body message's list, plus every AddSpell/RemoveSpell the server sends for that actor
// (kept for a while, including ones that came before the game knew the actor was its own), in the order they came. The game's own list is made
// to match it a few times after the body arrives (RESTORE_AT_S), so a late load or a late teaching cannot leave a hole.

export const RESTORE_AT_S = [1, 4, 10, 25];
export const EDIT_KEEP_MS = 120000;

export interface SpellEdit { self: number; id: number; add: boolean; at: number; }

export class SpellBook {
    want: Set<number> | null = null;
    me = 0;
    edits: SpellEdit[] = [];

    // The server's AddSpell / RemoveSpell for an actor (self: the server's id of it; id: the spell's form id)
    edit(self: number, id: number, add: boolean, now: number): void {
        self = self >>> 0; id = id >>> 0;
        if (!self || !id) return;
        this.edits = this.edits.filter((e) => now - e.at <= EDIT_KEEP_MS);
        this.edits.push({ self, id, add, at: now });
        if (this.want && self === this.me) this.apply(id, add);
    }

    // Our own body arrived (me: its server id, list: its learned spells from the body message)
    spawned(me: number, list: number[], now: number): void {
        this.me = me >>> 0;
        this.want = new Set((list || []).map((x) => x >>> 0));
        this.edits = this.edits.filter((e) => now - e.at <= EDIT_KEEP_MS);
        for (const e of this.edits) if (e.self === this.me) this.apply(e.id, e.add);
    }

    private apply(id: number, add: boolean): void {
        if (!this.want) return;
        if (add) this.want.add(id); else this.want.delete(id);
    }

    // What to change so the game's list (have) matches: null before the body came
    plan(have: number[]): { add: number[], remove: number[] } | null {
        if (!this.want) return null;
        const h = new Set((have || []).map((x) => x >>> 0));
        const add: number[] = []; const remove: number[] = [];
        this.want.forEach((id) => { if (!h.has(id)) add.push(id); });
        h.forEach((id) => { if (!this.want!.has(id)) remove.push(id); });
        return { add, remove };
    }
}
