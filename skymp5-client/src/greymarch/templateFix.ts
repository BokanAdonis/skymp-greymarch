// GREYMARCH: OBJECTS THE START SAVE PINS (2026-10-24). SkyrimPlatform starts every game from a save built into it (assets/template.ess, an old unmodded save). Its
// promoted and moved objects carry a stored position that wins over every plugin, so a mod that moved one of them was undone in every game: the Jorrvaskr
// living-quarters door (077FA2) stood at the vanilla spot inside JK's new walls and the doorway was empty. templatePinned.ts lists those objects (3,921) with the
// spot the save gives them. A few hundred are looked at per call; one that is loaded, not an actor, and still exactly at that spot is moved to where its plugins
// put it (MoveToMyEditorLocation). Where the plugins agree with the save it stays where it is. The proper fix (a clean start save) is in SkyrimPlatform itself.
import { TEMPLATE_PINNED } from "./templatePinned";

export const PER_CALL = 300; // entries looked at per call
export const MAX_MOVES = 8; // objects moved per call at most
export const NEAR = 3; // units: "still at the save's spot" (the list is rounded to whole units)

export interface PinnedObject { x: number, y: number, z: number, loaded: boolean, actor: boolean }
export interface TemplateFixApi {
  look(id: number): PinnedObject | null; // null: no such object in this load order
  move(id: number): void; // MoveToMyEditorLocation
}

export class TemplateFix {
  private next = 0;
  private skip = new Set<number>(); // actors and objects this load order does not have
  public moved = 0;
  constructor(private list: number[] = TEMPLATE_PINNED) { }

  // One slice of the list; returns the ids moved
  tick(api: TemplateFixApi): number[] {
    const n = this.list.length / 4;
    const out: number[] = [];
    for (let k = 0; k < PER_CALL && n > 0; k++) {
      const i = this.next;
      this.next = (this.next + 1) % n;
      const id = this.list[4 * i] >>> 0;
      if (this.skip.has(id)) continue;
      let o: PinnedObject | null = null;
      try { o = api.look(id); } catch (e) { o = null; }
      if (!o || o.actor) { this.skip.add(id); continue; }
      if (!o.loaded) continue;
      const dx = o.x - this.list[4 * i + 1], dy = o.y - this.list[4 * i + 2], dz = o.z - this.list[4 * i + 3];
      if (Math.abs(dx) > NEAR || Math.abs(dy) > NEAR || Math.abs(dz) > NEAR) continue;
      try { api.move(id); out.push(id); this.moved++; } catch (e) { this.skip.add(id); }
      if (out.length >= MAX_MOVES) break;
    }
    return out;
  }
}
