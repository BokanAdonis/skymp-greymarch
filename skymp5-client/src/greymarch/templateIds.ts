// GREYMARCH: RUNTIME IDS THE START SAVE ALSO USES (2026-10-31). SkyrimPlatform starts the world from a built-in save (assets/template.ess) that carries 141
// objects its old game made while it ran (ids FF00081A-FF000DB9). The load re-creates them under those ids, so an object THIS game made before the load
// that got one of them (runtime ids are handed out in order from FF000800) had the old object's data applied to it: a player crashed in the load
// (SkyrimSE+0734A96, a null pointer) when the save's actor FF000D7D (flags 8A000023) landed on "Vidrald", an actor the game had already made with that id.
// Just before the load, every reference with one of those ids is switched off and deleted; our views make theirs again after the load, with new ids
// (the save's next free id is FF0014FE, past that range). What was found, and anything that is not a reference and cannot be removed, is reported.
import { TEMPLATE_CREATED } from "./templatePinned";

export interface TemplateIdsGame {
  find(id: number): { isRef: boolean, isActor: boolean, name: string, type: number } | null; // null: no form with this id here
  remove(id: number): void; // disable and delete the reference
}

export function clearTemplateIds(game: TemplateIdsGame, ids: number[] = TEMPLATE_CREATED): { removed: string[], kept: string[] } {
  const removed: string[] = [], kept: string[] = [];
  for (const id of ids) {
    let f: ReturnType<TemplateIdsGame["find"]> = null;
    try { f = game.find(id); } catch (e) { f = null; }
    if (!f) continue;
    const label = (id >>> 0).toString(16) + " " + (f.isActor ? "actor" : f.isRef ? "object" : "form type " + f.type) + (f.name ? " '" + f.name + "'" : "");
    if (!f.isRef) { kept.push(label); continue; }
    try { game.remove(id); removed.push(label); } catch (e) { kept.push(label + " (could not remove: " + e + ")"); }
  }
  return { removed, kept };
}
