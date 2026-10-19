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
    refr.enable(false).then(() => this.resurrect(refrId, beastLook));
  }

  private resurrect(refrId: number, beastLook = false) {
    const refr = ObjectReference.from(Game.getFormEx(refrId));
    if (!refr || refr.getFormID() !== refrId) {
      return;
    }

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
