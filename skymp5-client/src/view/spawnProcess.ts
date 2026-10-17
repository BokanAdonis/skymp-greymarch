import { ObjectReference, Game, Actor, MotionType } from "skyrimPlatform";
import { Appearance, applyTints } from "../sync/appearance";
import { NiPoint3 } from "../sync/movement";
import { ObjectReferenceEx } from "../extensions/objectReferenceEx";

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

    const ac = Actor.from(refr);
    // GREYMARCH: not for a look with no head parts (a werewolf or a creature form): it has no tints, and applyTints ends by giving the actor's base the PLAYER's form ID,
    // so the game built the werewolf's animation graph for a "player" that is not the PlayerCharacter and crashed (bad vtable in BShkbAnimationGraph, WerewolfBeastProject,
    // every other player's game when a werewolf was drawn, 2026-10-17). A person's look is unchanged.
    const beastLook = !!appearance && !(Array.isArray(appearance.headpartIds) && appearance.headpartIds.length > 0);
    if (ac && appearance && !beastLook) {
      applyTints(ac, appearance);
    }
    refr.enable(false).then(() => this.resurrect(refrId));
  }

  private resurrect(refrId: number) {
    const refr = ObjectReference.from(Game.getFormEx(refrId));
    if (!refr || refr.getFormID() !== refrId) {
      return;
    }

    const ac = Actor.from(refr);
    if (ac) {
      return ac.resurrect().then(() => {
        this.callback();
      });
    }

    ObjectReferenceEx.dealWithRef(refr, refr.getBaseObject()!);

    return refr.setMotionType(MotionType.Keyframed, true).then(this.callback);
  }
}
