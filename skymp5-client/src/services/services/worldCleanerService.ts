import { ClientListener, CombinedController, Sp } from "./clientListener";
import { NiPoint3 } from "../../sync/movement";
import { ObjectReferenceEx } from "../../extensions/objectReferenceEx";
import { Actor } from "skyrimPlatform";
import { logTrace } from "../../logging";

export class WorldCleanerService extends ClientListener {
  constructor(private sp: Sp, private controller: CombinedController) {
    super();
    this.controller.on("update", () => this.onUpdate());
    this.controller.emitter.on("gameLoad", () => this.onGameLoad());
  }

  modWcProtection(actorId: number, mod: number): void {
    const currentProtection = this.protection.get(actorId);
    this.protection.set(actorId, currentProtection ? currentProtection + mod : mod);
  }

  getWcProtection(actorId: number): number {
    return this.protection.get(actorId) || 0;
  }

  private onGameLoad() {
    let player = this.sp.Game.getPlayer();
    if (!player) {
      return;
    }

    this.initialPos = ObjectReferenceEx.getPos(player);
    this.initialCellOrWorld = ObjectReferenceEx.getWorldOrCell(player);
  }

  private onUpdate() {
    this.processOneActor();
  }

  private processOneActor() {
    const pc = this.sp.Game.getPlayer();
    if (pc === null) {
      return;
    }

    const actor = this.sp.Game.findRandomActor(
      pc.getPositionX(),
      pc.getPositionY(),
      pc.getPositionZ(),
      8192
    );
    if (actor === null) {
      return;
    }

    const actorId = actor.getFormID();

    const currentProtection = this.protection.get(actorId) || 0;
    if (currentProtection > 0) {
      return;
    }

    if (actorId === 0x14 || actor.isDisabled() || actor.isDeleted()) {
      return;
    }

    if (this.isActorInDialogue(actor)) {
      // Deleting actor in dialogue crashes Skyrim
      // https://github.com/skyrim-multiplayer/issue-tracker/issues/13
      actor.setPosition(0, 0, 0);
      actor.disableNoWait(true); // Seems to not crash
      return;
    }

    // Keep vanila pre-placed bodies, but delete player bodies
    if (actor.isDead() && actorId < 0xff000000) {
      actor.blockActivation(true);
      return;
    }

    const pos = ObjectReferenceEx.getPos(actor);
    const cellOrWorld = ObjectReferenceEx.getWorldOrCell(actor);

    const chickenRace = 0xa919d;

    // We discovered anomaly chickens that fail to Disable if we load game near to them
    // Refs: 106C22, 106C23
    if (actorId < 0xff000000 && actor.getRace()?.getFormID() === chickenRace) {
      if (this.initialPos && ObjectReferenceEx.getDistanceNoZ(pos, this.initialPos) < 4096) {
        if (cellOrWorld === this.initialCellOrWorld) {
          if (this.isActorInDialogue(actor)) {
            return;
          }
          logTrace(this, `Deleting chicken anomaly`, actorId.toString(16));
          actor.killSilent(null);
          actor.blockActivation(true);
          actor.disableNoWait(false);
          actor.setAlpha(0, false);
          return;
        }
      }
    }

    // GREYMARCH: STOPPED BEFORE IT GOES, AND A PLACED ONE NEVER DELETED (2026-11-07, a player's crash 25 s after loading in: a Bandit Hedge Wizard of BSHeartland,
    // deleted and in no cell, read by the movement code, MovementControllerNPC / IMovementMessageInterface; one character crashed on every load where it logged out).
    // The cleaner disabled a hostile NPC already on its way to the player and deleted it a frame later, its movement still being worked on. Now its AI, combat
    // and moves are stopped first; an NPC the game placed (a plugin's, under ff000000) is only disabled, never deleted (disabled is gone enough, and the delete
    // is what crashed); one made in play is deleted a second after it is disabled.
    try { actor.enableAI(false); } catch (e) { /* it has none */ }
    try { actor.stopCombat(); } catch (e) { /* not fighting */ }
    try { actor.stopTranslation(); actor.clearKeepOffsetFromActor(); } catch (e) { /* not moving */ }
    actor.disable(false).then(() => {
      if (actorId < 0xff000000) return; // a placed NPC: disabled, not deleted
      return this.sp.Utility.wait(1).then(() => {
        const ac = this.sp.Actor.from(this.sp.Game.getFormEx(actorId));
        if (!ac || this.isActorInDialogue(ac) || !ac.isDisabled()) {
          return;
        }
        ac.delete();
      });
    });
  }

  private isActorInDialogue(ac: Actor) {
    return ac.isInDialogueWithPlayer() || ac.getDialogueTarget() !== null;
  }

  private protection = new Map<number, number>();
  private initialPos?: NiPoint3;
  private initialCellOrWorld?: number;
}
