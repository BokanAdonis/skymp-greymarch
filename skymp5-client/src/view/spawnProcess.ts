import { ObjectReference, Game, Actor, MotionType } from "skyrimPlatform";
import { Appearance, applyTints } from "../sync/appearance";
import { NiPoint3 } from "../sync/movement";
import { ObjectReferenceEx } from "../extensions/objectReferenceEx";

// GREYMARCH: SPAWNS ABANDONED MIDWAY (2026-10-21). A spawn runs in steps (placed disabled, moved, enabled, resurrected), and its FormView can remove the actor before it
// is done, when the look changes again at once (a werewolf change brings several look changes in a row). Its delete then ran on the half-made actor and the spawn
// enabled it afterwards anyway: an NPC nobody owned, a damageable copy of the player that never went away (the "clone" other players saw when someone changed). The
// FormView now marks such a spawn here instead of deleting it; the spawn sees the mark before it enables or resurrects, and disables and deletes the actor itself
// (then calls onGone, which drops the world cleaner's protection). The callback is not called for it.
export const gmAbandonedSpawns = new Map<number, () => void>();
const gmAbandon = (refrId: number): boolean => {
  const onGone = gmAbandonedSpawns.get(refrId);
  if (!onGone) return false;
  gmAbandonedSpawns.delete(refrId);
  const done = () => { try { onGone(); } catch (e) { /* the protection is a nicety here */ } };
  const refr = ObjectReference.from(Game.getFormEx(refrId));
  if (!refr) { done(); return true; }
  refr.disable(false).then(() => {
    const gone = ObjectReference.from(Game.getFormEx(refrId));
    if (gone) gone.delete();
    done();
  });
  return true;
};

export class SpawnProcess {
  constructor(
    appearance: Appearance | null,
    pos: NiPoint3,
    refrId: number,
    private callback: () => void,
  ) {
    const refr = ObjectReference.from(Game.getFormEx(refrId));
    if (!refr || refr.getFormID() !== refrId) {
      return;
    }

    refr.setPosition(...pos).then(() => this.enable(appearance, refrId));
  }

  private enable(appearance: Appearance | null, refrId: number) {
    const refr = ObjectReference.from(Game.getFormEx(refrId));
    if (!refr || refr.getFormID() !== refrId) {
      return;
    }
    if (gmAbandon(refrId)) return; // GREYMARCH: removed by its FormView meanwhile: never enabled

    const ac = Actor.from(refr);
    // GREYMARCH: not for a look with no head parts (a werewolf or a creature form): it has no tints, and applyTints ends by giving the actor's base the PLAYER's form ID,
    // so the game built the werewolf's animation graph for a "player" that is not the PlayerCharacter and crashed (bad vtable in BShkbAnimationGraph, WerewolfBeastProject,
    // every other player's game when a werewolf was drawn, 2026-10-17). A person's look is unchanged.
    const beastLook = !!appearance && !(Array.isArray(appearance.headpartIds) && appearance.headpartIds.length > 0);
    if (ac && appearance && !beastLook) {
      applyTints(ac, appearance);
    }
    // GREYMARCH: A BEAST IS ENABLED WITH ITS AI OFF (2026-10-22); formView.ts turns it on when the beast has settled (GM_BEAST_SETTLE_MS). The engine's own movement
    // update (Actor::UpdateMovement -> MovementControllerNPC -> animation-driven tweener) runs on every NPC with AI from its first frame and asked the werewolf graph,
    // still loading, for its clips: a watching game crashed in ClipAddingFunctor on a null clip the second a player was drawn as the beast (2026-10-22 12:27, #HXBA as
    // the Elder Alpha; 2026-10-21 18:29 #F78D). Holding SkyMP's own movement back (formView.ts) did not stop that update.
    if (ac && beastLook) { try { ac.enableAI(false); } catch (e) { /* drawn as before */ } }
    refr.enable(false).then(() => this.resurrect(refrId, beastLook));
  }

  private resurrect(refrId: number, beastLook = false) {
    const refr = ObjectReference.from(Game.getFormEx(refrId));
    if (!refr || refr.getFormID() !== refrId) {
      return;
    }
    if (gmAbandon(refrId)) return; // GREYMARCH: removed by its FormView while it was being enabled

    const ac = Actor.from(refr);
    // GREYMARCH: no Resurrect for a beast look (a werewolf, a werebear, a creature form). The actor was just placed, so it is alive; Resurrect resets its 3D, and the
    // werewolf's animation graph (WerewolfBeastProject, the first load of it in most games) was still being built on a job thread when the reset freed it: every
    // watching game crashed in a werewolf turn clip (hkbClipGenerator "WW TurnRight60", SkyrimSE.exe+0A8C590) the moment a player was drawn as the werewolf
    // (2026-10-18 the black bear, 2026-10-19 #YERB in the College). A person's look is resurrected as before.
    if (ac && beastLook) {
      this.callback();
      return;
    }
    if (ac) {
      return ac.resurrect().then(() => {
        this.callback();
      });
    }

    ObjectReferenceEx.dealWithRef(refr, refr.getBaseObject()!);

    return refr.setMotionType(MotionType.Keyframed, true).then(this.callback);
  }
}
