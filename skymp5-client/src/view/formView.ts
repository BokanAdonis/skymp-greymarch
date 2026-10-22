import { Actor, ActorBase, Cell, createText, Debug, destroyText, Form, FormType, Game, Keyword, NetImmerse, ObjectReference, once, printConsole, setTextColor, setTextPos, setTextSize, setTextString, storage, TESModPlatform, Utility, WorldSpace, worldPointToScreenPoint, writeLogs } from "skyrimPlatform";
import { setDefaultAnimsDisabled, applyAnimation } from "../sync/animation";
import { Appearance, applyAppearance } from "../sync/appearance";
import { isBadMenuShown, applyEquipment } from "../sync/equipment";
import { RespawnNeededError } from "../lib/errors";
import { FormModel } from "./model";
import { applyMovement } from "../sync/movementApply";
import { Movement } from "../sync/movement";
import { SpawnProcess, gmAbandonedSpawns } from "./spawnProcess";
import { ObjectReferenceEx } from "../extensions/objectReferenceEx";
import { PlayerCharacterDataHolder } from "./playerCharacterDataHolder";
import { getMovement } from "../sync/movementGet";
import { lastTryHost, tryHost } from "./hostAttempts";
import { ModelApplyUtils } from "./modelApplyUtils";
import { localIdToRemoteId } from "./worldViewMisc";
import { SpApiInteractor } from "../services/spApiInteractor";
import { WorldCleanerService } from "../services/services/worldCleanerService";
import { GamemodeUpdateService } from "../services/services/gamemodeUpdateService";

// GREYMARCH: how long a freshly built beast (a werewolf or werebear look) is left alone: no movement, no animation, no gear (see update()); and how long a
// new werewolf form (__gmWolfRace) must stay the same before the NPC is built again with it
const GM_BEAST_SETTLE_MS = 6000;
const GM_WOLF_RACE_SETTLE_MS = 4000;

// GREYMARCH: CRASH BREADCRUMBS (2026-10-20). One line in Data\Platform\Logs\greymarch-crumbs-logs.txt just BEFORE each step that touches another player's or a creature's
// NPC in a way that has crashed games (spawning, removing, a model refresh, gear, an idle or a beast's animation). Every line is flushed (SkyrimPlatform's writeLogs ends
// it with std::endl), so after a crash the last lines say what this game was doing. The launcher keeps the previous session's file and puts both in the support file.
const gmCrumbStart = Date.now();
export const gmCrumb = (text: string): void => { try { writeLogs("greymarch-crumbs", ((Date.now() - gmCrumbStart) / 1000).toFixed(1) + "s " + text); } catch (e) { /* a breadcrumb is a nicety */ } };
const gmHex = (n: any): string => (Number(n) >>> 0).toString(16);

export interface ScreenResolution {
  width: number;
  height: number;
}

let _screenResolution: ScreenResolution | undefined;
export const getScreenResolution = (): ScreenResolution => {
  if (!_screenResolution) {
    _screenResolution = {
      width: Utility.getINIInt("iSize W:Display"),
      height: Utility.getINIInt("iSize H:Display"),
    }
  }
  return _screenResolution;
}

export class FormView {
  constructor(private remoteRefrId?: number) { }

  update(model: FormModel): void {
    // Other players mutate into PC clones when moving to another location
    if (model.movement) {
      if (!this.lastWorldOrCell)
        this.lastWorldOrCell = model.movement.worldOrCell;
      if (this.lastWorldOrCell !== model.movement.worldOrCell) {
        printConsole(
          `[1] worldOrCell changed, destroying FormView ${this.lastWorldOrCell.toString(
            16
          )} => ${model.movement.worldOrCell.toString(16)}`
        );
        this.lastWorldOrCell = model.movement.worldOrCell;
        this.destroy();
        this.refrId = 0;
        this.appearanceBasedBaseId = 0;
        return;
      }
    }



    // Don't spawn dead actors if not already
    if (model.isDead) {
      if (this.refrId === 0) {
        return;
      }
    }

    // Players with different worldOrCell should be invisible
    if (model.movement) {
      const worldOrCell = ObjectReferenceEx.getWorldOrCell(Game.getPlayer() as Actor);
      if (
        worldOrCell !== 0 &&
        model.movement.worldOrCell !== worldOrCell
      ) {
        this.destroy();
        this.refrId = 0;
        return;
      }
    }

    // Apply appearance before base form selection to prevent double-spawn
    if (model.appearance || (!model.appearance && this.appearanceState.appearance)) {
      if (
        !this.appearanceState.appearance ||
        model.numAppearanceChanges !== this.appearanceState.lastNumChanges
      ) {

        // Both non-null
        if (model.appearance && this.appearanceState.appearance) {
          const modelAppearanceCopy: Appearance = JSON.parse(JSON.stringify(model.appearance));
          const stateAppearanceCopy: Appearance = JSON.parse(JSON.stringify(this.appearanceState.appearance));
          modelAppearanceCopy.name = "";
          stateAppearanceCopy.name = "";
          const equalWithoutNames = JSON.stringify(modelAppearanceCopy) === JSON.stringify(stateAppearanceCopy);

          if (equalWithoutNames) {
            // Change name inplace
            const refr = ObjectReference.from(Game.getFormEx(this.refrId));
            refr?.getBaseObject()?.setName(model.appearance.name);
            refr?.setDisplayName(model.appearance.name, true);
            //printConsole("Appearance updated, changing name inplace");
          } else {
            // Force re-apply appearance on the next getAppearanceBasedBase call
            this.appearanceBasedBaseId = 0;
            //printConsole("Appearance updated");
          }
        } else {
          // Force re-apply appearance on the next getAppearanceBasedBase call
          this.appearanceBasedBaseId = 0;
          //printConsole("Appearance updated");
        }

        this.appearanceState.appearance = model.appearance || null;
        this.appearanceState.lastNumChanges = model.numAppearanceChanges as number;
      }
    }

    // GREYMARCH: a werewolf variant (the Alpha, the pup) is drawn by BUILDING this player's NPC with the variant's race (the bridge's greymarchWolfAlphaOthers fills
    // __gmWolfRace: server actor id -> race), the same way a changed look respawns it. A SetRace on the live actor rebuilt its skeleton's physics while SkyMP moved it
    // and crashed the game (keyframed rigid bodies, 2026-10-17).
    let gmWolfRace = 0;
    try {
      const gmMap: any = (Function("return this")() as any).__gmWolfRace;
      const ap: any = this.appearanceState.appearance;
      if (gmMap && ap && !(Array.isArray(ap.headpartIds) && ap.headpartIds.length > 0)) gmWolfRace = Number(gmMap[this.getRemoteRefrId()]) || 0;
    } catch (gmErr) { gmWolfRace = 0; }
    // GREYMARCH: A FORM SWITCH WAITS UNTIL IT SETTLES (2026-10-22). Every new race meant throwing this NPC away and building it again, and staff clicking through the
    // forms (Frost Wolf, Rabid Wolf, ...) did that on every watching game several times in a row; a beast built that soon after the last crashed a watching game in
    // its clip handling (2026-10-21 18:29, #F78D, ClipAddingFunctor under MovementControllerNPC). A new race is taken at once only when the body is being built
    // anyway (its look just changed, e.g. human to werewolf: one build with the right race); otherwise only when it has stayed the same for GM_WOLF_RACE_SETTLE_MS
    // and the last build has settled (GM_BEAST_SETTLE_MS).
    if (gmWolfRace !== this.gmWolfRace) {
      if (gmWolfRace !== this.gmWolfRacePending) { this.gmWolfRacePending = gmWolfRace; this.gmWolfRacePendingAt = Date.now(); }
      const gmBuildingAnyway = this.appearanceBasedBaseId === 0;
      const gmSettled = Date.now() - this.gmWolfRacePendingAt >= GM_WOLF_RACE_SETTLE_MS && !(this.gmSpawnedBeast && Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS);
      if (gmBuildingAnyway || gmSettled) {
        gmCrumb("race " + gmHex(this.getRemoteRefrId() || 0) + " -> " + gmHex(gmWolfRace) + (gmBuildingAnyway ? " (with the new look)" : " (settled)"));
        this.gmWolfRace = gmWolfRace;
        this.appearanceBasedBaseId = 0; // built again, so the body is respawned with the variant's race
      }
    } else this.gmWolfRacePending = gmWolfRace;

    const refId =
      model.refrId && model.refrId < 0xff000000 ? model.refrId : undefined;
    if (refId) {
      if (this.refrId !== refId) {
        this.destroy();
        this.refrId = model.refrId as number;
        this.ready = true;
        const refr = ObjectReference.from(Game.getFormEx(this.refrId));
        if (refr) {
          const base = refr.getBaseObject();
          if (base) {
            ObjectReferenceEx.dealWithRef(refr, base);
          }
        }
      }
    } else {
      let templateChain = model.templateChain;

      // There is no place for random/leveling in 1-sized chain
      // Just spawn an NPC, do not generate a temporary TESNPC form
      if (templateChain?.length === 1) {
        templateChain = undefined;
      }

      // TODO: getLeveledBase crashes too often ATM
      let base = null; //Game.getFormEx(this.getLeveledBase(templateChain));
      if (base === null) {
        base = Game.getFormEx(model.baseId || NaN);
      }
      if (base === null) {
        base = Game.getFormEx(this.getAppearanceBasedBase());
      }
      if (base === null) {
        return;
      }

      let refr = ObjectReference.from(Game.getFormEx(this.refrId));

      let respawnRequired = false;
      if (!refr) {
        respawnRequired = true;
      } else if (!refr.getBaseObject()) {
        respawnRequired = true;
      } else if ((refr.getBaseObject() as Form).getFormID() !== base.getFormID()) {
        respawnRequired = true;
      }

      if (respawnRequired) {
        this.destroy();

        const player = Game.getPlayer() as Actor;

        // GREYMARCH: a server-made creature (an NPC with no player look) is created AT ITS SPOT, not at the player. placeAtMe gives the new actor the
        // place it was created as its home (its editor location), and its own wander/sandbox AI keeps it near home: created at the player and only
        // then moved away, an animal walked (or was moved by the engine) back onto the player who first saw it (horkers in the College of Winterhold,
        // 2026-10-19). So a hidden marker is put on the spot first (TESModPlatform.moveRefrToPosition is not latent) and the creature is made there.
        const isServerCreature = (baseForm: Form) => baseForm.getType() === FormType.NPC && !model.appearance;
        const spawnAtSpot = (baseForm: Form, pos: [number, number, number], rot: [number, number, number]): ObjectReference | null => {
          try {
            const worldOrCell = model.movement ? model.movement.worldOrCell : 0;
            const markerBase = Game.getFormEx(0x3b); // XMarker
            const marker = markerBase ? (player.placeAtMe(markerBase, 1, false, true) as ObjectReference) : null;
            if (!marker) return null;
            if (!worldOrCell) { marker.delete(); return null; }
            TESModPlatform.moveRefrToPosition(marker, Cell.from(Game.getFormEx(worldOrCell)), WorldSpace.from(Game.getFormEx(worldOrCell)), pos[0], pos[1], pos[2], rot[0], rot[1], rot[2]);
            const ref = marker.placeAtMe(baseForm, 1, true, true) as ObjectReference;
            marker.delete();
            return ref || null;
          } catch (e) {
            printConsole("spawnAtSpot failed, creating at the player instead: " + e);
            return null;
          }
        };

        const spawnMethodOriginal = {
          spawn(baseForm: Form, spawnPosition: [number, number, number], spawnRotation: [number, number, number]): ObjectReference {
            if (isServerCreature(baseForm)) {
              const atSpot = spawnAtSpot(baseForm, spawnPosition, spawnRotation);
              if (atSpot) return atSpot;
            }
            return player.placeAtMe(
              baseForm,
              1,
              true,
              true
            ) as ObjectReference;
          },

          triggerSpawnProcess(spawningRefr: ObjectReference, spawnPosition: [number, number, number], appearance: Appearance | null, callback: () => void) {
            new SpawnProcess(
              appearance,
              spawnPosition,
              spawningRefr.getFormID(),
              callback
            );
          }
        };

        const spawnMethodStub = {
          spawn(baseForm: Form, spawnPosition: [number, number, number], spawnRotation: [number, number, number]): ObjectReference {
            const f = storage["formViewFunc1"] as Function;
            const ref: ObjectReference = f(baseForm, spawnPosition, spawnRotation);
            return ref;
          },

          triggerSpawnProcess(spawningRefr: ObjectReference, spawnPosition: [number, number, number], appearance: Appearance | null, callback: () => void) {
            const f = storage["formViewFunc2"] as Function;
            f(spawningRefr, spawnPosition, appearance, callback);
          }
        };

        const spawnUsingStubMethod = base.getType() === FormType.NPC
          && !this.appearanceState.appearance
          && storage["formViewFunc1Set"] === true
          && storage["formViewFunc2Set"] === true;
        const spawnMethod = spawnUsingStubMethod ? spawnMethodStub : spawnMethodOriginal;

        if (model.movement) {
          refr = spawnMethod.spawn(base, model.movement.pos, model.movement.rot);
        } else {
          printConsole("model.movement was " + model.movement);
        }

        this.state = {};
        delete this.wasHostedByOther;
        if (base.getType() !== FormType.NPC) {
          refr?.setAngle(
            model.movement?.rot[0] || 0,
            model.movement?.rot[1] || 0,
            model.movement?.rot[2] || 0
          );
        } else {
          const race = Actor.from(refr)?.getRace()?.getFormID();
          const draugrRace = 0xd53;
          const falmerRace = 0x131f4;
          const chaurusRace = 0x131eb;
          const frostbiteSpiderRaceGiant = 0x4e507;
          const frostbiteSpiderRaceLarge = 0x53477;
          const dwarvenCenturionRace = 0x131f1;
          const dwarvenSphereRace = 0x131f2;
          const dwarvenSpiderRace = 0x131f3;
          const sprigganRace = 0x2013b77;
          const sprigganRace2 = 0xf3903;
          const sprigganRace3 = 0x13204;
          const sprigganRace4 = 0x401b644;
          const sprigganRace5 = 0x9aa44;
          const wolfRace = 0x1320a;

          // potential masterambushscript
          // GREYMARCH: not for a player drawn as a creature (a creature form has an appearance; SkyMP's own NPCs do not): Aggression 2 made their NPC here start fights
          if (!model.appearance && (race === draugrRace
            || race === falmerRace
            || race === chaurusRace
            || race === frostbiteSpiderRaceGiant
            || race === frostbiteSpiderRaceLarge
            || race === dwarvenCenturionRace
            || race === dwarvenSphereRace
            || race === dwarvenSpiderRace
            || race === sprigganRace
            || race === sprigganRace2
            || race === sprigganRace3
            || race === sprigganRace4
            || race === sprigganRace5
            || race === wolfRace)) {
            Actor.from(refr)?.setActorValue("Aggression", 2);
          }
        }

        if (refr !== null) {
          SpApiInteractor.getControllerInstance().lookupListener(WorldCleanerService).modWcProtection(refr.getFormID(), 1);
        }

        // TODO: reset all states?
        this.eqState = this.getDefaultEquipState();
        this.animState = this.getDefaultAnimState();

        this.ready = false;

        let spawnPos;
        if (model.movement) {
          spawnPos = model.movement.pos;
          // printConsole("Spawn NPC at movement.pos");
        } else {
          spawnPos = ObjectReferenceEx.getPos(Game.getPlayer() as Actor);
          printConsole("Spawn NPC at player pos");
        }

        if (refr) {
          const gmBeastSpawn = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0); // GREYMARCH: see destroy()
          gmCrumb("spawn " + gmHex(this.getRemoteRefrId()) + " as " + gmHex(refr.getFormID()) + " base " + gmHex(base.getFormID()) + " race " + gmHex(this.gmWolfRace || (model.appearance ? model.appearance.raceId : 0)) + (gmBeastSpawn ? " beast" : ""));
          const gmSpawnId = refr.getFormID();
          this.gmSpawningId = gmSpawnId; // GREYMARCH: the spawn in progress (destroy() hands it back to the spawn instead of deleting it)
          gmAbandonedSpawns.delete(gmSpawnId); // a mark left by an older spawn that never got that far must not throw this new one away (actor ids are reused)
          spawnMethod.triggerSpawnProcess(refr, spawnPos, model.appearance || null, () => {
            if (this.gmSpawningId !== gmSpawnId) return; // GREYMARCH: an older spawn finishing late: not this view's actor any more
            this.gmSpawningId = 0;
            this.ready = true;
            this.spawnMoment = Date.now();
            this.gmSpawnedBeast = gmBeastSpawn;
            this.gmBeastAiOff = gmBeastSpawn; // spawnProcess.ts enabled it with its AI off; turned on below once it has settled
            gmCrumb("spawned " + gmHex(this.refrId));
          });
        } else {
          printConsole("Unable to triggerSpawnProcess for null refr");
        }

        if (model.appearance && model.appearance.name) {
          refr?.setDisplayName("" + model.appearance.name, true);
        }
        Actor.from(refr)?.setActorValue("attackDamageMult", 0);
      }
      this.refrId = (refr as ObjectReference).getFormID();
    }

    if (!this.ready) {
      return;
    }

    const refr = ObjectReference.from(Game.getFormEx(this.refrId));
    if (refr) {
      const actor = Actor.from(refr);
      if (actor && !this.localImmortal) {
        actor.startDeferredKill();
        actor.setActorValue("health", 1000000);
        actor.setActorValue("magicka", 1000000);
        this.localImmortal = true;
      }
      this.applyAll(refr, model);

      const gamemodeUpdateService = SpApiInteractor.getControllerInstance().lookupListener(GamemodeUpdateService);
      gamemodeUpdateService.updateNeighbor(refr, model, this.state);
    }
  }

  destroy(): void {
    this.isOnScreen = false;
    this.spawnMoment = 0;
    const refrId = this.refrId;
    // GREYMARCH: an NPC spawned with a beast look (a werewolf, a werebear, a creature form) is disabled first and deleted once that is done, and is not given
    // setWeaponDrawnMode afterwards. Deleted while still enabled, with its ragdoll and keyframed bodies in the physics world, the watching games crashed in that physics
    // (hkpKeyframedRigidMotion, SkyrimSE.exe+0A883CE) the moment the player changed back (2026-10-19 #GNQS). A person's NPC is removed as before.
    const gmBeast = this.gmSpawnedBeast;
    this.gmSpawnedBeast = false;
    this.gmBeastAiOff = false;
    // GREYMARCH: still being spawned: the spawn itself disables and deletes it (see gmAbandonedSpawns in spawnProcess.ts); deleting it here left a copy it then enabled
    const gmMidSpawn = refrId >= 0xff000000 && this.gmSpawningId === refrId;
    this.gmSpawningId = 0;
    if (gmMidSpawn) {
      gmCrumb("remove " + gmHex(refrId) + " (mid-spawn: the spawn removes it)");
      gmAbandonedSpawns.set(refrId, () => SpApiInteractor.getControllerInstance().lookupListener(WorldCleanerService).modWcProtection(refrId, -1));
      this.localImmortal = false;
      this.removeNickname();
      return;
    }
    if (refrId >= 0xff000000) gmCrumb("remove " + gmHex(refrId) + (gmBeast ? " beast (disable first)" : ""));
    once("update", () => {
      if (refrId >= 0xff000000 && gmBeast) {
        // The world cleaner's protection is dropped only AFTER the delete (2026-10-20). Dropped at once, the NPC was unprotected and not yet disabled for the frames
        // the disable takes, and the world cleaner (one random nearby actor a frame) could pick it and disable and delete it too: a second delete of the same actor,
        // the crash of a watching game the moment a beast player changed back.
        const unprotect = () => SpApiInteractor.getControllerInstance().lookupListener(WorldCleanerService).modWcProtection(refrId, -1);
        const refr = ObjectReference.from(Game.getFormEx(refrId));
        if (!refr) { unprotect(); return; }
        refr.disable(false).then(() => {
          const gone = ObjectReference.from(Game.getFormEx(refrId));
          if (gone) gone.delete();
          gmCrumb("removed " + gmHex(refrId) + " beast");
          unprotect();
        });
        return;
      }
      if (refrId >= 0xff000000) {
        const refr = ObjectReference.from(Game.getFormEx(refrId));
        if (refr) {
          refr.delete();
        }
        SpApiInteractor.getControllerInstance().lookupListener(WorldCleanerService).modWcProtection(refrId, -1);
        const ac = Actor.from(refr);
        if (ac) {
          TESModPlatform.setWeaponDrawnMode(ac, -1);
        }
      }
    })

    this.localImmortal = false;
    this.removeNickname();
  }

  private lastHarvestedApply = 0;
  private lastOpenApply = 0;
  private isSetNodeTextureSetApplied = false;
  private isSetNodeScaleApplied = false;

  private applyAll(refr: ObjectReference, model: FormModel) {
    let forcedWeapDrawn: boolean | null = null;

    if (PlayerCharacterDataHolder.getCrosshairRefId() === this.refrId) {
      this.lastHarvestedApply = 0;
      this.lastOpenApply = 0;
    }
    const now = Date.now();
    if (now - this.lastHarvestedApply > 666) {
      this.lastHarvestedApply = now;
      ModelApplyUtils.applyModelIsHarvested(refr, !!model.isHarvested);
    }
    if (now - this.lastOpenApply > 133) {
      this.lastOpenApply = now;
      ModelApplyUtils.applyModelIsOpen(refr, !!model.isOpen);
    }
    if (!this.isSetNodeScaleApplied) {
      this.isSetNodeScaleApplied = true;
      ModelApplyUtils.applyModelNodeScale(refr, model.setNodeScale);
    }
    if (!this.isSetNodeTextureSetApplied) {
      this.isSetNodeTextureSetApplied = true;
      ModelApplyUtils.applyModelNodeTextureSet(refr, model.setNodeTextureSet);
    }

    if (
      model.inventory &&
      PlayerCharacterDataHolder.getCrosshairRefId() == this.refrId &&
      !isBadMenuShown()
    ) {
      // Do not let actors breaking their equipment via inventory apply
      // However, actually, actors do not have inventory in their models
      // Except your clone.
      if (!Actor.from(refr)) {
        ModelApplyUtils.applyModelInventory(refr, model.inventory);
        model.inventory = undefined;
      }
    }

    if (model.animation) {
      if (model.animation.animEventName === "SkympFakeUnequip") {
        forcedWeapDrawn = false;
      } else if (model.animation.animEventName === "SkympFakeEquip") {
        forcedWeapDrawn = true;
      }
    }

    // TODO: make host service
    const hosted = storage['hosted'];
    let alreadyHosted = false;
    if (Array.isArray(hosted)) {
      const remoteId = localIdToRemoteId(this.refrId);

      if (hosted.includes(remoteId) || hosted.includes(remoteId + 0x100000000)) {
        alreadyHosted = true;
      }
    }
    setDefaultAnimsDisabled(this.refrId, alreadyHosted ? false : true);

    if (alreadyHosted) {
      Actor.from(refr)?.clearKeepOffsetFromActor();
    }

    // GREYMARCH: A SERVER-DRIVEN ANIMAL (gamemode wildlifebrain.js; the server sets the custom property greymarchPuppet). The server decides where it goes and
    // when it attacks, so this game never hosts it and never lets it fight on its own: it plays the server's frames (gmPuppetMove) the way SkyMP plays another
    // player's movement (applyMovement: translateTo for the place, keepOffsetFromActor for the walk or run).
    const gmPuppet = (model as any).greymarchPuppet === true;
    if (gmPuppet) {
      if (this.gmPuppetMove(refr, model) === "respawn") return;
    } else if (model.movement) {
      let ac = Actor.from(refr);
      if (
        this.movState.lastApply &&
        Date.now() - this.movState.lastApply > 1500
      ) {
        if (Date.now() - this.movState.lastRehost > 1000) {
          this.movState.lastRehost = Date.now();
          const remoteId = this.remoteRefrId;
          if (ac && ac.is3DLoaded()) {
            this.tryHostIfNeed(ac, remoteId as number);
            printConsole("tryHostIfNeed - reason: not seeing movement for long time");
          }
        }
      }

      // GREYMARCH: A FRESH BEAST STANDS STILL FOR ITS FIRST GM_BEAST_SETTLE_MS (2026-10-21: 3 seconds; 6 since 2026-10-22, a crash at the same step 18:29). SkyMP moves an NPC (keepOffsetFromActor, translateTo) from the frame it is
      // spawned; for a beast that started the movement controller's animation-driven motion while the werewolf graph was still initialising, and the watching game
      // crashed in its clip handling (MovementControllerNPC -> MovementTweenerAgentAnimationDriven -> ClipAddingFunctor, SkyrimSE.exe+0ADE8BD / +0C28F84; #GNQS as a
      // polar bear, 2026-10-21 05:46). It stays where it was placed; SkyMP's movement applies after that (the next change, or its 2-second repeat).
      const gmHoldStill = this.gmSpawnedBeast && Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS;
      if (gmHoldStill && !this.gmHeldSaid) { this.gmHeldSaid = true; gmCrumb("hold still " + gmHex(refr.getFormID()) + " beast (fresh)"); }
      if (!gmHoldStill) this.gmHeldSaid = false;
      if (!gmHoldStill && this.gmBeastAiOff) { // the beast has settled: its AI (and with it the engine's movement update) on, so SkyMP can move it again
        this.gmBeastAiOff = false;
        try { const gmAc = Actor.from(refr); if (gmAc) gmAc.enableAI(true); gmCrumb("ai on " + gmHex(refr.getFormID()) + " beast (settled)"); } catch (e) { /* it stays where it is */ }
      }
      if (
        !gmHoldStill && (
        +(model.numMovementChanges as number) !==
        this.movState.lastNumChanges ||
        Date.now() - this.movState.lastApply > 2000)
      ) {
        this.movState.lastApply = Date.now();
        if (model.isHostedByOther || !this.movState.everApplied) {
          // GREYMARCH: NO WEAPON DRAW FOR A BEAST (2026-10-20). A changed werewolf or werebear player counts as "weapon drawn", so SkyMP gave its NPC here
          // setWeaponDrawnMode(1): the game ran ActionDraw, played the idle WerewolfDraw into the beast's animation graph and the watching game crashed in its clip
          // handling (SkyrimSE.exe+0A8C590, the crash of every beast observer case; this one's stack showed ActionDraw, WeapEquip, WerewolfDraw and SetWeaponDrawnMode).
          // A beast has no weapon: its NPC keeps the drawn state it has, so no draw or sheathe is ever ordered.
          const gmBeastMove = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0);
          if (gmBeastMove) { try { const gmAc = Actor.from(refr); if (gmAc) forcedWeapDrawn = gmAc.isWeaponDrawn(); } catch (e) { /* left as SkyMP has it */ } }
          const backup = model.movement.isWeapDrawn;
          if (forcedWeapDrawn === true || forcedWeapDrawn === false) {
            model.movement.isWeapDrawn = forcedWeapDrawn;
          }
          try {
            applyMovement(refr, model.movement, !!model.isMyClone);
          } catch (e) {
            if (e instanceof RespawnNeededError) {
              this.lastWorldOrCell = model.movement.worldOrCell;
              this.destroy();
              this.refrId = 0;
              this.appearanceBasedBaseId = 0;
              return;
            } else {
              throw e;
            }
          }
          model.movement.isWeapDrawn = backup;

          this.movState.lastNumChanges = +(model.numMovementChanges as number);
          this.movState.everApplied = true;
        } else {
          const remoteId = this.remoteRefrId;
          if (ac && remoteId && ac.is3DLoaded()) {
            ac.clearKeepOffsetFromActor();

            // TODO: make host service
            const hosted = storage['hosted'];
            let alreadyHosted = false;
            if (Array.isArray(hosted)) {
              const remoteId = localIdToRemoteId(ac.getFormID());
              if (hosted.includes(remoteId) || hosted.includes(remoteId + 0x100000000)) {
                alreadyHosted = true;
              }
            }

            if (!alreadyHosted) {
              if (this.tryHostIfNeed(ac, remoteId)) {

                // previously, we did this cleanup on each update
                // but I guess it's too expensive and can possibly hurt FPS
                TESModPlatform.setWeaponDrawnMode(ac, -1);
              }
            }
          }
        }
      }
    }

    // GREYMARCH: a beast look (no head parts) is given no animation for its first 3 seconds: the event SkyMP replays when an NPC is spawned (the player's last one, from
    // the human body's transformation) and any that arrive meanwhile are taken as seen, not played. Played into the werewolf animation graph while it was still being
    // built, they left it a clip generator with a broken vtable and the watching game crashed in its clip handling (SkyrimSE.exe+0C28F84, the same address every time,
    // 2026-10-19 #GNQS). Its attacks, roars and the rest after that play as before.
    const gmBeastLook = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0);

    if (refr.is3DLoaded()) {
      if (model.animation) {
        // and never a howl on a beast: played into a remote beast's graph without the howl shout behind it, "WW Howl.hkx" crashed the watching game (2026-10-19 #SZGE)
        if (gmBeastLook && (this.animState.useAnimOverrides || Date.now() - this.spawnMoment < GM_BEAST_SETTLE_MS || String(model.animation.animEventName || "").toLowerCase().startsWith("howl") || /^skympfake/i.test(String(model.animation.animEventName || "")))) this.animState.lastNumChanges = model.animation.numChanges; // and never SkyMP's equip / unequip (it draws the weapon: see "NO WEAPON DRAW" above)
        else {
          if (this.animState.lastNumChanges !== model.animation.numChanges && (gmBeastLook || /^idle/i.test(String(model.animation.animEventName || "")))) gmCrumb("anim " + gmHex(refr.getFormID()) + " " + String(model.animation.animEventName).slice(0, 40) + (gmBeastLook ? " beast" : ""));
          applyAnimation(refr, model.animation, this.animState);
        }
      }
      // Use them only once, for spawning actors with correct animations
      this.animState.useAnimOverrides = false;
    }


    // GREYMARCH: a beast look (a werewolf, a werebear, a creature form: no head parts) gets no full model refresh (queueNiNodeUpdate) when it comes on screen and its
    // gear is applied only 3 seconds after it was spawned. Right after a player is drawn as the beast the NPC is respawned, its head is off screen for a frame, and the
    // "redraw tints" below rebuilt its whole model the next frame, while its werewolf animation graph (WerewolfBeastProject) was still being built: every watching game
    // crashed (werewolf turn clips at SkyrimSE.exe+0A8C590, the graph's clip handling at +0C28F84; 2026-10-18 and 2026-10-19). A beast has no face tints to redraw.
    // (gmBeastLook is set above, before the animations.)

    if (model.appearance) {
      const actor = Actor.from(refr);
      if (actor && !PlayerCharacterDataHolder.isInJumpState()) {
        if (PlayerCharacterDataHolder.getWorldOrCell()) {
          if (
            this.lastPcWorldOrCell &&
            PlayerCharacterDataHolder.getWorldOrCell() !== this.lastPcWorldOrCell
          ) {
            // Redraw tints if PC world/cell changed
            this.isOnScreen = false;
          }
          this.lastPcWorldOrCell = PlayerCharacterDataHolder.getWorldOrCell();
        }

        const headPos = [
          NetImmerse.getNodeWorldPositionX(actor, "NPC Head [Head]", false),
          NetImmerse.getNodeWorldPositionY(actor, "NPC Head [Head]", false),
          NetImmerse.getNodeWorldPositionZ(actor, "NPC Head [Head]", false),
        ];
        const [screenPoint] = worldPointToScreenPoint(headPos);
        const isOnScreen =
          screenPoint[0] > 0 &&
          screenPoint[1] > 0 &&
          screenPoint[2] > 0 &&
          screenPoint[0] < 1 &&
          screenPoint[1] < 1 &&
          screenPoint[2] < 1;
        if (isOnScreen != this.isOnScreen) {
          this.isOnScreen = isOnScreen;
          if (isOnScreen && !gmBeastLook) {
            gmCrumb("model refresh " + gmHex(actor.getFormID()) + " (came on screen)");
            actor.queueNiNodeUpdate();
            (Game.getPlayer() as Actor).queueNiNodeUpdate();
          }
        }
      }
    }

    if (model.equipment) {
      if (this.eqState.lastNumChanges !== model.equipment.numChanges) {
        const ac = Actor.from(refr);
        // If we do not block inventory here, we will be able to reproduce the bug:
        // 1. Place ~90 bots and force them to reequip iron swords to the left hand (rate should be ~50ms)
        // 2. Open your inventory and reequip different items fast
        // 3. After 1-2 minutes close your inventory and see that HUD disappeared
        if (
          ac &&
          !isBadMenuShown() &&
          Date.now() - this.eqState.lastEqMoment > 500 &&
          Date.now() - this.spawnMoment > -1 &&
          this.spawnMoment > 0 &&
          (!gmBeastLook || Date.now() - this.spawnMoment > GM_BEAST_SETTLE_MS)
        ) {
          //if (this.spawnMoment > 0 && Date.now() - this.spawnMoment > 5000) {
          gmCrumb("gear " + gmHex(ac.getFormID()) + (gmBeastLook ? " beast" : ""));
          if (applyEquipment(ac, model.equipment)) {
            this.eqState.lastNumChanges = model.equipment.numChanges;
          }
          this.eqState.lastEqMoment = Date.now();
          //}
          //const res: boolean = applyEquipment(ac, model.equipment);
          //if (res) this.eqState.lastNumChanges = model.equipment.numChanges;
        }
      }
    }

    // GREYMARCH: where this player's head is, about 10 times a second, so the launcher can play their voice from there (direction, muffle, floors; see bridge.ts greymarchEarsTick)
    if (this.refrId && model.appearance?.name && Date.now() >= this.gmEarNext) {
      this.gmEarNext = Date.now() + 100;
      try {
        if (refr.is3DLoaded() && Game.getPlayer()!.getDistance(refr) <= 4500) {
          const gmHead = "NPC Head [Head]";
          (SpApiInteractor.getControllerInstance().emitter as any).emit("greymarchEar", { name: model.appearance.name, id: this.refrId, x: NetImmerse.getNodeWorldPositionX(refr, gmHead, false), y: NetImmerse.getNodeWorldPositionY(refr, gmHead, false), z: NetImmerse.getNodeWorldPositionZ(refr, gmHead, false) });
        }
      } catch (gmErr) { /* their voice just stays centred */ }
    }

    if (FormView.isDisplayingNicknames && this.refrId && model.appearance?.name) {
      const headPart = "NPC Head [Head]";
      const maxNicknameDrawDistance = 1000;
      const playerActor = Game.getPlayer()!;
      const isVisibleByPlayer = !model.movement?.isSneaking
        && playerActor.getDistance(refr) <= maxNicknameDrawDistance
        && playerActor.hasLOS(refr)
        && !this.isSweetHidePerson(refr);
      if (isVisibleByPlayer) {
        const headScreenPos = worldPointToScreenPoint([
          NetImmerse.getNodeWorldPositionX(refr, headPart, false),
          NetImmerse.getNodeWorldPositionY(refr, headPart, false),
          NetImmerse.getNodeWorldPositionZ(refr, headPart, false) + 32
        ])[0];
        const resolution = getScreenResolution();
        const textXPos = Math.round(headScreenPos[0] * resolution.width);
        const textYPos = Math.round((1 - headScreenPos[1]) * resolution.height);
        // GREYMARCH: tell the voice display where this head is on screen (the microphone icon is drawn there while they talk)
        try { if (headScreenPos[2] > 0) (SpApiInteractor.getControllerInstance().emitter as any).emit("greymarchHead", { name: model.appearance.name, x: textXPos, y: textYPos, rw: resolution.width, rh: resolution.height }); } catch (e) { /* the voice display is a nicety */ }

        // GREYMARCH: a character who introduced themselves to this player shows their NAME (large) with their ID UNDER it (smaller); everyone else shows the ID alone
        let gmName: string = "";
        try { const gmG: any = Function("return this")(); const gmN = gmG.__gmKnown && gmG.__gmKnown[this.getRemoteRefrId()]; if (gmN) gmName = String(gmN); } catch (gmErr) { /* the ID stays */ }
        const gmBase: string = gmName || model.appearance.name;
        // GREYMARCH: while this character is talking, a mark and a green tint are part of the name text itself: drawn in the same frame as the name, so nothing lags behind the head
        let gmTalking: boolean = false;
        try { const gmT: any = Function("return this")(); gmTalking = !!(gmT.__gmSpeaking && gmT.__gmSpeaking[model.appearance.name]); } catch (gmErr) { /* not marked */ }
        const gmMain: string = gmTalking ? gmBase + "  )))" : gmBase;
        const gmNameColor: number[] = gmTalking ? [0.55, 0.95, 0.55, 0.95] : [1, 1, 1, 0.8];
        const gmMainSize: number = gmName ? 0.503 : 0.4375; // 0.4375 is the size of a lone ID; a name is 15% bigger than that
        const gmIdSize: number = 0.372; // 15% smaller than a lone ID
        const gmIdY: number = textYPos + Math.round(resolution.height * 0.024);
        if (this.textNameId && this.textNameShown !== gmMain) { setTextString(this.textNameId, gmMain); setTextSize(this.textNameId, gmMainSize); setTextColor(this.textNameId, gmNameColor); this.textNameShown = gmMain; }
        if (gmName && !this.textIdId && this.textNameId) { this.textIdId = createText(textXPos, gmIdY, model.appearance.name, [1, 1, 1, 0.8]); setTextSize(this.textIdId, gmIdSize); }
        if (!gmName && this.textIdId) { destroyText(this.textIdId); this.textIdId = undefined; }

        if (!this.textNameId && headScreenPos[2] > 0) {
          this.textNameShown = gmMain;
          this.textNameId = createText(textXPos, textYPos, gmMain, gmNameColor); // GREYMARCH: the floating name is the character ID; the game's own display name is "Stranger" or the name you were introduced to
          setTextSize(this.textNameId, gmMainSize);
          SpApiInteractor.getControllerInstance().emitter.emit("nicknameCreate", {
            remoteRefrId: this.getRemoteRefrId(),
            textId: this.textNameId
          });
        } else {
          const deleteNickname = headScreenPos[2] < 0;
          if (deleteNickname) {
            this.removeNickname();
          }
          if (this.textNameId) {
            setTextPos(this.textNameId, textXPos, textYPos);
            if (this.textIdId) setTextPos(this.textIdId, textXPos, gmIdY);
          }
        }      } else {
        this.removeNickname();
      }
    } else {
      this.removeNickname();
    }
  }

  private isSweetHidePerson(refr: ObjectReference): boolean {
    // GREYMARCH: anyone the server listed as invisible has no floating name
    try { const gmGlobal: any = Function("return this")(); if (gmGlobal.__gmInvisible && gmGlobal.__gmInvisible[this.getRemoteRefrId()]) return true; } catch (gmErr) { /* names stay as they are */ }
    const actor = Actor.from(refr)
    if (!actor) {
      return false;
    }
    const keyword = Keyword.getKeyword('SweetHidePerson');
    return actor.wornHasKeyword(keyword);
  }

  private removeNickname() {
    if (this.textNameId) {
      SpApiInteractor.getControllerInstance().emitter.emit("nicknameDestroy", {
        remoteRefrId: this.getRemoteRefrId(),
        textId: this.textNameId
      });
      destroyText(this.textNameId);
      this.textNameId = undefined;
    }
    if (this.textIdId) { destroyText(this.textIdId); this.textIdId = undefined; }
  }

  private getAppearanceBasedBase(): number {
    const base = ActorBase.from(Game.getFormEx(this.appearanceBasedBaseId));
    if (!base && this.appearanceState.appearance) {
      const gmLook = this.gmWolfRace ? { ...this.appearanceState.appearance, raceId: this.gmWolfRace } : this.appearanceState.appearance; // GREYMARCH: a werewolf variant's race
      this.appearanceBasedBaseId = applyAppearance(gmLook).getFormID();
    }
    return this.appearanceBasedBaseId;
  }

  private getLeveledBase(templateChain: number[] | undefined): number {
    if (templateChain === undefined) {
      return 0;
    }

    const str = templateChain.join(',');

    if (this.leveledBaseId === 0) {
      // @ts-ignore
      const leveledBase = TESModPlatform.evaluateLeveledNpc(str);
      if (!leveledBase) {
        printConsole("Failed to evaluate leveled npc", str);
      }
      this.leveledBaseId = leveledBase?.getFormID() || 0;
    }

    return this.leveledBaseId;
  }

  private getDefaultEquipState() {
    return { lastNumChanges: 0, lastEqMoment: 0 };
  };

  private getDefaultAppearanceState() {
    return { lastNumChanges: 0, appearance: null as (null | Appearance) };
  };

  private getDefaultAnimState() {
    return { lastNumChanges: 0, useAnimOverrides: true };
  };

  // a server-driven animal: its newest frame from the server, or where the server placed it until the first one comes. "respawn" when it must be made again.
  private gmPuppetMove(refr: ObjectReference, model: FormModel): string {
    const ac = Actor.from(refr);
    if (!ac || !model.movement) return "";
    if (!this.gmPuppetReady) {
      this.gmPuppetReady = true;
      try { ac.setActorValue("Aggression", 0); ac.setActorValue("AttackDamageMult", 0); } catch (e) { /* the server still decides every hit */ } // never a fight of its own, never local damage
    }
    try { if (ac.isInCombat()) ac.stopCombat(); } catch (e) { /* next frame */ }
    const frames = (storage["greymarchBeastFrames"] || {}) as Record<string, { pos: number[]; heading: number; speed: number; anim: string; at: number }>;
    const f = frames[String(this.remoteRefrId)];
    const now = Date.now();
    let m: Movement | null = null;
    if (!f) {
      if (this.movState.everApplied) return "";
      m = model.movement;
    } else {
      if (f.at === this.gmPuppetAt && now - this.movState.lastApply < 1000) return "";
      this.gmPuppetAt = f.at;
      m = { ...model.movement, pos: [f.pos[0], f.pos[1], f.pos[2]], rot: [0, 0, f.heading], runMode: f.anim === "run" ? "Running" : f.anim === "walk" ? "Walking" : "Standing", direction: 0, speed: f.speed, isInJumpState: false, isSneaking: false, isBlocking: false, isWeapDrawn: false };
    }
    this.movState.lastApply = now;
    try {
      applyMovement(refr, m as Movement, false);
      this.movState.everApplied = true;
    } catch (e) {
      if (e instanceof RespawnNeededError) {
        this.lastWorldOrCell = (m as Movement).worldOrCell;
        this.destroy();
        this.refrId = 0;
        this.appearanceBasedBaseId = 0;
        return "respawn";
      }
      throw e;
    }
    if (f && f.anim === "attack" && f.at !== this.gmPuppetAttackAt) {
      this.gmPuppetAttackAt = f.at;
      try { Debug.sendAnimationEvent(ac, "attackStart"); } catch (e) { /* the server already counted the bite */ }
    }
    return "";
  }
  private gmPuppetReady = false;
  private gmPuppetAt = 0;
  private gmPuppetAttackAt = 0;

  private tryHostIfNeed(ac: Actor, remoteId: number) {
    const last = lastTryHost[remoteId];
    if (!last || Date.now() - last >= 1000) {
      lastTryHost[remoteId] = Date.now();

      if (
        getMovement(ac).worldOrCell ===
        getMovement(Game.getPlayer() as Actor).worldOrCell
      ) {
        tryHost(remoteId);
        return true;
      }
    }
    return false;
  };

  getLocalRefrId(): number {
    return this.refrId;
  }

  getRemoteRefrId(): number {
    return this.remoteRefrId as number;
  }

  private refrId = 0;
  private ready = false;
  private animState = this.getDefaultAnimState();
  private movState = {
    lastNumChanges: 0,
    lastApply: 0,
    lastRehost: 0,
    everApplied: false,
  };
  private appearanceState = this.getDefaultAppearanceState();
  private eqState = this.getDefaultEquipState();
  private appearanceBasedBaseId = 0;
  private gmWolfRace = 0; // GREYMARCH: the werewolf variant's race this player's NPC was built with (0: none)
  private leveledBaseId = 0;
  private isOnScreen = false;
  private lastPcWorldOrCell = 0;
  private lastWorldOrCell = 0;
  private spawnMoment = 0;
  private gmSpawnedBeast = false;
  private gmHeldSaid = false;
  private gmBeastAiOff = false; // GREYMARCH: a fresh beast whose AI is still off (spawnProcess.ts); see the settle rule in update()
  private gmWolfRacePending = 0; // GREYMARCH: a new race from __gmWolfRace not built yet, and since when (see the settle rule)
  private gmWolfRacePendingAt = 0;
  private gmSpawningId = 0; // GREYMARCH: the actor this view is spawning right now (0: none); see destroy() // GREYMARCH: the "hold still" breadcrumb was written for this spawn // GREYMARCH: this NPC was spawned with a beast look (destroy() disables it before the delete)
  private wasHostedByOther: boolean | undefined = undefined;
  private state = {};
  private localImmortal = false;
  private textNameId: number | undefined = undefined;
  private textNameShown: string | undefined = undefined;
  private textIdId: number | undefined = undefined; // GREYMARCH: the ID line under an introduced character's name
  private gmEarNext = 0; // GREYMARCH: when this player's head position is next reported for the voice (see update)


  public static isDisplayingNicknames: boolean = true;
}
