// @ts-expect-error (TODO: Remove in 2.10.0)
import { Actor, Form, FormType, Menu, Spell, interruptCast, castSpellImmediate, printConsole, applyAnimationVariablesToActor, ActorAnimationVariables } from 'skyrimPlatform';
import {
  Armor,
  Cell,
  Game,
  ObjectReference,
  TESModPlatform,
  Ui,
  Utility,
  WorldSpace,
  on, // TODO: use this.controller.on instead
  once, // TODO: use this.controller.once instead
  storage, // TODO: use this.sp.storage instead
} from 'skyrimPlatform';

import * as messages from '../../messages';

/* eslint-disable @typescript-eslint/no-empty-function */
import { ObjectReferenceEx } from '../../extensions/objectReferenceEx';
import { IdManager } from '../../lib/idManager';
import { nameof } from '../../lib/nameof';
import { setActorValuePercentage } from '../../sync/actorvalues';
import { applyAppearanceToPlayer } from '../../sync/appearance';
import { applyEquipment, isBadMenuShown } from '../../sync/equipment';
import { Inventory, applyInventory } from '../../sync/inventory';
import { Movement } from '../../sync/movement';
import { learnSpells, removeAllSpells } from '../../sync/spell';
import { ModelApplyUtils } from '../../view/modelApplyUtils';
import { FormModel, WorldModel } from '../../view/model';
import { LoadGameService } from './loadGameService';
import { UpdateMovementMessage } from '../messages/updateMovementMessage';
import { ChangeValuesMessage } from '../messages/changeValuesMessage';
import { UpdateAnimationMessage } from '../messages/updateAnimationMessage';
import { UpdateEquipmentMessage } from '../messages/updateEquipmentMessage';
import { RagdollService } from './ragdollService';
import { UpdateAppearanceMessage } from '../messages/updateAppearanceMessage';
import { TeleportMessage } from '../messages/teleportMessage';
import { DeathStateContainerMessage } from '../messages/deathStateContainerMessage';
import { RespawnNeededError } from '../../lib/errors';
import { OpenContainerMessage } from '../messages/openContainerMessage';
import { ActivateMessage } from '../messages/activateMessage';
import { ClientListener, CombinedController, Sp } from './clientListener';
import { HostStartMessage } from '../messages/hostStartMessage';
import { HostStopMessage } from '../messages/hostStopMessage';
import { ConnectionMessage } from '../events/connectionMessage';
import { SetInventoryMessage } from '../messages/setInventoryMessage';
import { CreateActorMessage, CreateActorMessageAdditionalProps } from '../messages/createActorMessage';
import { DestroyActorMessage } from '../messages/destroyActorMessage';
import { SetRaceMenuOpenMessage } from '../messages/setRaceMenuOpenMessage';
import { UpdatePropertyMessage } from '../messages/updatePropertyMessage';
import { TeleportMessage2 } from '../messages/teleportMessage2';

// TODO: refactor worldViewMisc into service
import {
  getObjectReference,
  getViewFromStorage,
  remoteIdToLocalId,
} from '../../view/worldViewMisc';
import { TimeService } from './timeService';
import { MagicSyncService } from './magicSyncService';
import { logTrace, logError } from '../../logging';

import { SpellCastMessage } from '../messages/spellCastMessage';
import { UpdateAnimVariablesMessage } from '../messages/updateAnimVariablesMessage';
import { isWereRace } from '../../view/beastSwitch';
import { MsgType } from '../../messages';

export const getPcInventory = (): Inventory | undefined => {
  const res = storage['pcInv'];
  if (typeof res === 'object' && (res as any)['entries']) {
    return res as Inventory;
  }
  return undefined;
};

const setPcInventory = (inv: Inventory): void => {
  storage['pcInv'] = inv;
};

let pcInvLastApply = 0;
on('update', () => {
  if (isBadMenuShown()) {
    return;
  }
  if (Date.now() - pcInvLastApply > 5000) {
    pcInvLastApply = Date.now();
    const pcInv = getPcInventory();
    if (pcInv) {
      applyInventory(Game.getPlayer()!, pcInv, false, true);
    }
  }
});

const unequipIronHelmet = () => {
  const ironHelment = Armor.from(Game.getFormEx(0x00012e4d));
  const pl = Game.getPlayer();
  if (pl) {
    pl.unequipItem(ironHelment, false, true);
  }
};

export class RemoteServer extends ClientListener {
  constructor(private sp: Sp, private controller: CombinedController) {
    super();

    this.controller.emitter.on("hostStartMessage", (e) => this.onHostStartMessage(e));
    this.controller.emitter.on("hostStopMessage", (e) => this.onHostStopMessage(e));
    this.controller.emitter.on("setInventoryMessage", (e) => this.onSetInventoryMessage(e));
    this.controller.emitter.on("openContainerMessage", (e) => this.onOpenContainerMessage(e));
    this.controller.emitter.on("updateMovementMessage", (e) => this.onUpdateMovementMessage(e));
    this.controller.emitter.on("updateAnimationMessage", (e) => this.onUpdateAnimationMessage(e));
    this.controller.emitter.on("updateEquipmentMessage", (e) => this.onUpdateEquipmentMessage(e));
    this.controller.emitter.on("changeValuesMessage", (e) => this.onChangeValuesMessage(e));
    this.controller.emitter.on("updateAppearanceMessage", (e) => this.onUpdateAppearanceMessage(e));
    this.controller.emitter.on("teleportMessage", (e) => this.onTeleportMessage(e));
    this.controller.emitter.on("teleportMessage2", (e) => this.onTeleportMessage(e));
    this.controller.emitter.on("createActorMessage", (e) => this.onCreateActorMessage(e));
    this.controller.emitter.on("destroyActorMessage", (e) => this.onDestroyActorMessage(e));
    this.controller.emitter.on("setRaceMenuOpenMessage", (e) => this.onSetRaceMenuOpenMessage(e));
    this.controller.emitter.on("updatePropertyMessage", (e) => this.onUpdatePropertyMessage(e));
    this.controller.emitter.on("deathStateContainerMessage", (e) => this.onDeathStateContainerMessage(e));

    this.controller.emitter.on("connectionAccepted", () => this.handleConnectionAccepted());

    this.controller.emitter.on("spellCastMessage", (e) => this.onSpellCastMessage(e));
    on('update', () => this.greymarchEndSilentHeldSpells());
    this.controller.emitter.on("updateAnimVariablesMessage", (e) => this.onUpdateAnimVariablesMessage(e));

  }

  private onHostStartMessage(event: ConnectionMessage<HostStartMessage>) {
    const msg = event.message;
    const target = msg.target;
    if ((storage as any)["greymarchNoHost"] === true) return; // GREYMARCH: staff god mode hosts no NPC (see sendInputsService.ts sendHostAttempts)

    let hosted = storage['hosted'];
    if (typeof hosted !== typeof []) {
      // if you try to switch to Set please checkout .concat usage.
      // concat compiles but doesn't work as expected
      hosted = new Array<number>();
      storage['hosted'] = hosted;
    }

    if (!(hosted as Array<unknown>).includes(target)) {
      (hosted as Array<unknown>).push(target);
    }
  }

  private onHostStopMessage(event: ConnectionMessage<HostStopMessage>) {
    const msg = event.message;
    const target = msg.target;
    logTrace(this, 'hostStop ' + target.toString(16));

    const hosted = storage['hosted'] as Array<number>;
    if (typeof hosted === typeof []) {
      storage['hosted'] = hosted.filter((x) => x !== target);
    }
  }

  private onSetInventoryMessage(event: ConnectionMessage<SetInventoryMessage>): void {
    this.numSetInventory++;

    const msg = event.message;
    once('update', () => {
      setPcInventory(msg.inventory);

      let blocked = false;

      this.controller.emitter.emit('queryBlockSetInventoryEvent', {
        block: () => blocked = true
      });

      if (!blocked) {
        pcInvLastApply = 0;
      }
    });
  }

  private onOpenContainerMessage(event: ConnectionMessage<OpenContainerMessage>): void {
    once('update', async () => {
      await Utility.wait(0.1); // Give a chance to update inventory

      const remoteId = event.message.target;
      const localId = remoteIdToLocalId(remoteId);
      const refr = ObjectReference.from(Game.getFormEx(localId));

      if (refr === null) {
        logError(this, 'onOpenContainerMessage - refr not found', 'remoteId', remoteId.toString(16), 'localId', localId.toString(16));
        return;
      }

      refr.activate(Game.getPlayer(), true);

      const baseObject = refr.getBaseObject();
      const baseType = baseObject?.getType();

      let functionChecker: (() => boolean) | null = null;
      let factName = "";
      let delaySeconds = -1.0;
      if (baseType === FormType.Container) {
        functionChecker = () => Ui.isMenuOpen("ContainerMenu");
        factName = "'ContainerMenu open'";
        delaySeconds = 0.0;
      } else if (baseType === FormType.Furniture) {
        functionChecker = () => !!Game.getPlayer()?.getFurnitureReference();
        factName = "'getFurnitureReference not null'";
        delaySeconds = 1.0;
      }

      if (functionChecker === null) {
        logTrace(this, "onOpenContainerMesage - not a container or furniture", baseType);
        return;
      }

      // In SkyMP containers have 2-nd, closing activation under the hood.
      // This differs from Skyrim's behavior, where it's just one activation.

      (async () => {
        logTrace(this, "onOpenContainerMesage - waiting for", factName, "to be true");
        while (!functionChecker()) await Utility.wait(0.1);

        logTrace(this, "onOpenContainerMesage - waiting for", factName, "to be false");
        while (functionChecker()) await Utility.wait(0.1);

        logTrace(this, "onOpenContainerMesage - menu closed", factName);

        const message: ActivateMessage = {
          t: messages.MsgType.Activate,
          data: {
            caster: 0x14, target: event.message.target, isSecondActivation: true
          }
        };

        logTrace(this, "onOpenContainerMesage - waiting", delaySeconds, "seconds before sending ActivateMessage");

        Utility.waitMenuMode(delaySeconds).then(() => {
          this.controller.emitter.emit("sendMessage", {
            message: message,
            reliability: "reliable"
          });

          logTrace(this, "onOpenContainerMesage - sent ActivateMessage", message);
        });
      })();
    });
  }

  private onTeleportMessage(event: ConnectionMessage<TeleportMessage> | ConnectionMessage<TeleportMessage2>): void {
    // GREYMARCH diagnostics: where the server moves someone (door travel)
    try { const gmT: any = event.message; const gmPl = Game.getPlayer()!; const gmCur = gmPl.getWorldSpace() || gmPl.getParentCell(); (this.controller.emitter as any).emit("greymarchStage", "door/teleport: the server moves " + ("idx" in gmT ? "someone else (idx " + gmT.idx + ")" : "me") + " to world/cell " + Number(gmT.worldOrCell).toString(16) + " at " + Math.round(gmT.pos[0]) + "," + Math.round(gmT.pos[1]) + "," + Math.round(gmT.pos[2]) + " (I am in " + (gmCur ? gmCur.getFormID().toString(16) : "?") + " at " + Math.round(gmPl.getPositionX()) + "," + Math.round(gmPl.getPositionY()) + "," + Math.round(gmPl.getPositionZ()) + ")"); } catch (gmErr) { /* diagnostics only */ }
    const msg = event.message;
    once('update', () => {
      const id = ("idx" in msg && typeof msg.idx === "number") ? this.getIdManager().getId(msg.idx) : this.getMyActorIndex();
      const refr = id === this.getMyActorIndex() ? Game.getPlayer() : getObjectReference(id);
      logTrace(this,
        `Teleporting id`, id, `refrId`, refr?.getFormID().toString(16), `...`,
        msg.pos,
        'cell/world is',
        msg.worldOrCell.toString(16),
      );
      const ragdollService = this.controller.lookupListener(RagdollService);

      const refrId = refr?.getFormID();

      const removeRagdollCallback = () => {
        TESModPlatform.moveRefrToPosition(
          ObjectReference.from(Game.getFormEx(refrId || 0)),
          Cell.from(Game.getFormEx(msg.worldOrCell)),
          WorldSpace.from(Game.getFormEx(msg.worldOrCell)),
          msg.pos[0],
          msg.pos[1],
          msg.pos[2],
          msg.rot[0],
          msg.rot[1],
          msg.rot[2],
        );
      };
      const actor = Actor.from(refr);
      if (actor /*&& actor.getFormID() === 0x14*/) {
        ragdollService.safeRemoveRagdollFromWorld(actor, removeRagdollCallback);
      } else {
        removeRagdollCallback();
      }
    });
  }

  private onCreateActorMessage(event: ConnectionMessage<CreateActorMessage>): void {
    const msg = event.message;
    if (this.skipFormViewCreation(msg)) {
      const refrId = msg.refrId!;
      this.onceLoad(refrId, (refr: ObjectReference) => {
        if (refr) {
          ObjectReferenceEx.dealWithRef(refr, refr.getBaseObject() as Form);
          if (msg.props) {
            if (msg.props.inventory) {
              ModelApplyUtils.applyModelInventory(refr, msg.props.inventory);
            }
            ModelApplyUtils.applyModelIsOpen(refr, !!msg.props['isOpen']);
            ModelApplyUtils.applyModelIsHarvested(
              refr,
              !!msg.props['isHarvested'],
            );

            ModelApplyUtils.applyModelNodeScale(refr, msg.props.setNodeScale);

            ModelApplyUtils.applyModelNodeTextureSet(refr, msg.props.setNodeTextureSet);

            ModelApplyUtils.applyModelIsDisabled(refr, !!msg.props['disabled']);

            // TODO: move to a separate module
            const animation = msg.props.lastAnimation;
            if (typeof animation === "string") {
              const refrid = refr.getFormID();

              (async () => {
                for (let i = 0; i < 5; i++) {
                  // retry. pillars in bleakfalls are not reliable for some reason
                  let res2 = ObjectReference.from(Game.getFormEx(refrid))?.playAnimation(animation);
                  if (res2) {
                    break;
                  }
                  await Utility.wait(2);
                }
              })();
            }


            let displayName = msg.props.displayName;

            // keep in sync with spSnippetService.ts
            if (typeof displayName === "string") {

              const replaceValue = refr.getBaseObject()?.getName();

              if (replaceValue !== undefined) {
                displayName = displayName.replace(/%original_name%/g, replaceValue);
              } else {
                logError(this, "Couldn't get a replaceValue for SetDisplayName, refr.getFormID() was", refr.getFormID().toString(16));
              }

              refr.setDisplayName(displayName, true);
              logTrace(this, `calling setDisplayName`, displayName, `for`, refr.getFormID().toString(16));
            }
          }
        } else {
          logError(this, 'Failed to apply model to', refrId.toString(16));
        }
      });
      return;
    }

    logTrace(this, "Create actor");

    // GREYMARCH: a create for an object this game already shows replaces it. SkyMP gave it a SECOND slot: the old slot kept its form and its FormView,
    // which no message reached any more (every later one goes to the new slot, a later removal frees only the new one), so a frozen copy with its
    // own floating name stood where the player had been: the "clones" of 2026-10-23. The old slot is now cleared first, as a removal would.
    const known = this.getIdManager().getId(msg.idx);
    if (known >= 0) {
      this.worldModel.forms[known] = undefined;
      getViewFromStorage()?.syncFormArray(this.worldModel);
      this.getIdManager().freeIdFor(msg.idx);
      this.greymarchDoubleCreates++;
      if (this.greymarchDoubleCreates <= 5) {
        try { (this.controller.emitter as any).emit("greymarchStage", "clones: the server sent " + (msg.refrId || 0).toString(16) + " again while it was still shown; the old copy was removed (" + this.greymarchDoubleCreates + " this session)"); } catch (e) { /* diagnostics only */ }
      }
    }

    const i = this.getIdManager().allocateIdFor(msg.idx);
    if (this.worldModel.forms.length <= i) {
      this.worldModel.forms.length = i + 1;
    }

    let movement: Movement | undefined = undefined;
    // TODO: better check if it is an npc (not an object reference)
    if (msg.refrId !== undefined && msg.refrId >= 0xff000000) {
      movement = {
        pos: msg.transform.pos,
        rot: msg.transform.rot,
        worldOrCell: msg.transform.worldOrCell,
        runMode: 'Standing',
        direction: 0,
        isInJumpState: false,
        isSneaking: false,
        isBlocking: false,
        isWeapDrawn: false,
        isDead: false,
        healthPercentage: 1.0,
        speed: 0,
      };
    }

    const form: FormModel = {
      idx: msg.idx,
      movement,
      numMovementChanges: 0,
      numAppearanceChanges: 0,
      baseId: msg.baseId,
      refrId: msg.refrId,
      isMyClone: msg.isMe,
    };
    this.worldModel.forms[i] = form;

    if (msg.appearance) {
      form.appearance = msg.appearance;
    }

    if (msg.equipment) {
      form.equipment = msg.equipment;
    }

    if (msg.isDead) {
      form.isDead = msg.isDead;
    }

    if (msg.animation) {
      form.animation = msg.animation;
    }

    if (msg.props) {
      for (const propName in msg.props) {
        (form as Record<string, unknown>)[propName] = msg.props[propName as keyof CreateActorMessageAdditionalProps];
      }
    }

    msg.customPropsJsonDumps.forEach(element => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(element.propValueJsonDump);
      } catch (e) {
        if (e instanceof SyntaxError) {
          logError(this, "createActor", msg.refrId?.toString(16), "failed to parse custom prop", element.propName, element.propValueJsonDump, e.message);
        } else {
          throw e;
        }
      }
      (form as Record<string, unknown>)[element.propName] = parsed;
    });

    if (msg.isMe) {
      this.worldModel.playerCharacterFormIdx = i;
      this.worldModel.playerCharacterRefrId = msg.refrId || 0;
    }

    // TODO: move to a separate module

    if (msg.props && !msg.props.isHostedByOther) {
    }

    if (msg.props && msg.props.isRaceMenuOpen && msg.isMe) {
      this.onSetRaceMenuOpenMessage({ message: { t: MsgType.SetRaceMenuOpen, open: true } });
    }

    const numSetInventory = this.numSetInventory;

    const applyPcInv = () => {
      if (msg.equipment) {
        applyEquipment(Game.getPlayer()!, msg.equipment)
      }

      if (numSetInventory !== this.numSetInventory) {
        logTrace(this, 'Skipping inventory apply due to newer setInventory message');
        return;
      }

      if (msg.props && msg.props.inventory) {
        this.onSetInventoryMessage({
          message: {
            t: MsgType.SetInventory,
            inventory: msg.props.inventory
          }
        });
      }
    };

    if (msg.isMe && msg.props && msg.props.learnedSpells) {
      const learnedSpells = msg.props.learnedSpells;

      once('update', () => {
        Utility.wait(1).then(() => {
          const player = Game.getPlayer();

          if (player) {
            removeAllSpells(player);
            learnSpells(player, learnedSpells);
            logTrace(this,
              `player learnedSpells:`, JSON.stringify(learnedSpells),
            );
          }
        });
      });
    }

    if (msg.isMe) {
      if (msg.props?.isDead) {
        once("update", () => {
          this.controller.emitter.emit("applyDeathStateEvent", {
            actor: Game.getPlayer()!,
            isDead: true
          });
        });
      }
    }

    if (msg.isMe) {
      const spawnTask = { running: false };
      // GREYMARCH: in a world SkyMP did not load (the player pressed New Game / Continue before connecting), moving the player would keep that
      // single-player game (the Helgen intro: bound hands, first person, its items): the world is loaded from the server instead (the tick path below).
      const inForeignWorld = !!this.controller.lookupListener(LoadGameService).greymarchForeignWorld;
      once('update', () => {
        // Use MoveRefrToPosition to spawn if possible (not in main menu)
        // In case of connection lost this is essential
        if (!spawnTask.running && !inForeignWorld) {
          spawnTask.running = true;
          logTrace(this, 'Using moveRefrToPosition to spawn player');
          (async () => {
            while (true) {
              logTrace(this, 'Spawning...');
              TESModPlatform.moveRefrToPosition(
                Game.getPlayer(),
                Cell.from(Game.getFormEx(msg.transform.worldOrCell)),
                WorldSpace.from(Game.getFormEx(msg.transform.worldOrCell)),
                msg.transform.pos[0],
                msg.transform.pos[1],
                msg.transform.pos[2],
                msg.transform.rot[0],
                msg.transform.rot[1],
                msg.transform.rot[2],
              );
              await Utility.wait(1);
              const pl = Game.getPlayer();
              if (!pl) {
                break;
              }
              const pos = [
                pl.getPositionX(),
                pl.getPositionY(),
                pl.getPositionZ(),
              ];
              const sqr = (x: number) => x * x;
              const distance = Math.sqrt(
                sqr(pos[0] - msg.transform.pos[0]) +
                sqr(pos[1] - msg.transform.pos[1]),
              );
              if (distance < 256) {
                break;
              }
            }
          })();
          // Unfortunatelly it requires two calls to work
          Utility.wait(1).then(applyPcInv);
          Utility.wait(1.3).then(applyPcInv);
          // Note: appearance part was copy-pasted
          if (msg.appearance) {
            applyAppearanceToPlayer(msg.appearance);
          }
        }

        if (msg.props) {
          const baseActorValues = new Map<string, unknown>([
            ['healRate', msg.props.healRate],
            ['healRateMult', msg.props.healRateMult],
            ['health', msg.props.health],
            ['magickaRate', msg.props.magickaRate],
            ['magickaRateMult', msg.props.magickaRateMult],
            ['magicka', msg.props.magicka],
            ['staminaRate', msg.props.staminaRate],
            ['staminaRateMult', msg.props.staminaRateMult],
            ['stamina', msg.props.stamina],
            ['healthPercentage', msg.props.healthPercentage],
            ['staminaPercentage', msg.props.staminaPercentage],
            ['magickaPercentage', msg.props.magickaPercentage],
          ]);

          const player = Game.getPlayer();
          if (player) {
            baseActorValues.forEach((value, key) => {
              if (typeof value === 'number') {
                if (key.includes('Percentage')) {
                  const subKey = key.replace('Percentage', '');
                  const subValue = baseActorValues.get(subKey);
                  if (typeof subValue === 'number') {
                    setActorValuePercentage(player, subKey, value);
                  }
                } else {
                  player.setActorValue(key, value);
                }
              }
            });
          }
        }
      });
      once('tick', () => {
        once('tick', () => {
          if (!spawnTask.running) {
            spawnTask.running = true;

            let loadOrder = new Array<string>();
            for (let i = 0; i < this.sp.Game.getModCount(); ++i) {
              loadOrder.push(this.sp.Game.getModName(i));
            }

            logTrace(this, `loading game in world/cell`, msg.transform.worldOrCell.toString(16));
            const loadGameService = this.controller.lookupListener(LoadGameService);
            loadGameService.loadGame(
              msg.transform.pos,
              msg.transform.rot,
              msg.transform.worldOrCell,
              msg.appearance
                ? {
                  name: msg.appearance.name,
                  raceId: msg.appearance.raceId,

                  // TODO: In types, isFemale is under face, but in the reality SP expects it here. Fix required.
                  // @ts-expect-error
                  isFemale: msg.appearance.isFemale,

                  face: {
                    hairColor: msg.appearance.hairColor,
                    bodySkinColor: msg.appearance.skinColor,
                    headTextureSetId: msg.appearance.headTextureSetId,
                    headPartIds: msg.appearance.headpartIds,
                    presets: msg.appearance.presets
                  },
                }
                : undefined,
              loadOrder,
              { minutes: 0, seconds: 0, hours: this.controller.lookupListener(TimeService).getTime().newGameHourValue }
            );
            once('update', () => {
              applyPcInv();
              Utility.wait(0.3).then(applyPcInv);
              // Note: appearance part was copy-pasted
              if (msg.appearance) {
                applyAppearanceToPlayer(msg.appearance);
              }
            });
          }
        });
      });
    }
  }

  private onDestroyActorMessage(event: ConnectionMessage<DestroyActorMessage>): void {
    const msg = event.message;

    const i = this.getIdManager().getId(msg.idx);
    // GREYMARCH: a removal for something this game never got (getId says -1) is ignored. SkyMP compared that -1 with "my own body", which is ALSO -1
    // until the game knows its body, so a removal of any unknown object (common right after connecting) counted as "my own body is gone" and
    // SkyMP quit to the main menu: the "kicked to the main menu" of 2026-10-15/16.
    if (i < 0) return;
    this.worldModel.forms[i] = undefined;
    getViewFromStorage()?.syncFormArray(this.worldModel);

    // Shrink to fit
    while (1) {
      const length = this.worldModel.forms.length;
      if (!length) {
        break;
      }
      if (this.worldModel.forms[length - 1]) {
        break;
      }
      this.worldModel.forms.length = length - 1;
    }

    if (this.worldModel.playerCharacterFormIdx === i) {
      this.worldModel.playerCharacterFormIdx = -1;
      this.worldModel.playerCharacterRefrId = 0;

      // GREYMARCH: SkyMP sent the player back to the main menu here. Greymarch never wants that: the character select hides the player's own body
      // while they choose (select.js setEnabled false), and on the server that also removes it from its owner's view. On a fast PC that message arrives
      // after the game already knows the body is its own, so the world loaded and then the game quit to the main menu (2026-10-16). Switching and
      // deleting characters are the server's job (select.js); the next createActor for this player brings the body back. So: noted, not quit.
      try { (this.controller.emitter as any).emit("greymarchStage", "stage: the server removed my own body from view (character select hides it): staying in the game"); } catch (e) { /* diagnostics only */ }
    }

    this.getIdManager().freeIdFor(msg.idx);
  }

  private onUpdateMovementMessage(event: ConnectionMessage<UpdateMovementMessage>): void {
    const msg = event.message;

    const i = this.getIdManager().getId(msg.idx);

    const form = this.worldModel.forms[i];

    if (form === undefined) {
      logError(this, `onUpdateMovementMessage - Form with idx`, msg.idx, `not found`);
      return;
    }

    form.movement = msg.data;
    if (!form.numMovementChanges) {
      form.numMovementChanges = 0;
    }
    form.numMovementChanges++;
  }

  private onUpdateAnimationMessage(event: ConnectionMessage<UpdateAnimationMessage>): void {
    const msg = event.message;

    const i = this.getIdManager().getId(msg.idx);

    const form = this.worldModel.forms[i];

    if (form === undefined) {
      logError(this, `onUpdateAnimationMessage - Form with idx`, msg.idx, `not found`);
      return;
    }

    form.animation = msg.data;
  }

  private onUpdateAppearanceMessage(event: ConnectionMessage<UpdateAppearanceMessage>): void {
    const msg = event.message;

    const i = this.getIdManager().getId(msg.idx);

    const form = this.worldModel.forms[i];

    if (form === undefined) {
      logError(this, `onUpdateAppearanceMessage - Form with idx`, msg.idx, `not found`);
      return;
    }

    form.appearance = msg.data || undefined;
    if (!form.numAppearanceChanges) {
      form.numAppearanceChanges = 0;
    }
    form.numAppearanceChanges++;

    const newAppearance = msg.data;

    if (i === this.getMyActorIndex() && newAppearance) {
      // GREYMARCH: a creature form (or the werewolf's look) is drawn on the player's own body by the bridge with ONE real SetRace. Writing the creature race into the character
      // here first made that SetRace change nothing (the game already "had" the race): a person's body with a creature's race, or a creature's skeleton with a person's
      // animations. So a look with no head parts (only creature looks are like that) is not applied to the player, and while a form is on, their own look is kept for the
      // bridge, which puts it back after it has changed the body back (greymarchShapeUnbecome).
      const noHead = !(Array.isArray(newAppearance.headpartIds) && newAppearance.headpartIds.length > 0);
      if (noHead || storage["greymarchShapeOn"] === true || storage["greymarchWolfOn"] === true) { // GREYMARCH: the werewolf too (bridge greymarchWolfUnbecome puts it back)
        storage["greymarchPendingAppearance"] = noHead ? null : newAppearance;
        logTrace(this, "Appearance for the player kept for the creature form");
        return;
      }
      this.controller.once("update", () => {
        applyAppearanceToPlayer(newAppearance);
        logTrace(this, "Applied appearance to the player");
      });
    }
  }

  private onUpdateEquipmentMessage(event: ConnectionMessage<UpdateEquipmentMessage>): void {
    const msg = event.message;

    const i = this.getIdManager().getId(msg.idx);

    const form = this.worldModel.forms[i];

    if (form === undefined) {
      logError(this, `onUpdateEquipmentMessage - Form with idx`, msg.idx, `not found`);
      return;
    }

    form.equipment = msg.data;
  }

  private onUpdatePropertyMessage(event: ConnectionMessage<UpdatePropertyMessage>): void {
    const msg = event.message;
    const msgData = this.extractUpdatePropertyMessageData(msg);

    if (this.skipFormViewCreation(msg)) {
      const refrId = msg.refrId;
      once('update', () => {
        const refr = ObjectReference.from(Game.getFormEx(refrId));
        if (!refr) {
          logError(this, 'UpdateProperty: refr not found');
          return;
        }
        if (msg.propName === 'inventory') {
          ModelApplyUtils.applyModelInventory(refr, msgData as Inventory);
        } else if (msg.propName === 'isOpen') {
          ModelApplyUtils.applyModelIsOpen(refr, !!msgData);
        } else if (msg.propName === 'isHarvested') {
          ModelApplyUtils.applyModelIsHarvested(refr, !!msgData);
        } else if (msg.propName === 'disabled') {
          ModelApplyUtils.applyModelIsDisabled(refr, !!msgData);
        }
      });
      return;
    }
    const i = this.getIdManager().getId(msg.idx);
    const form = this.worldModel.forms[i];
    (form as Record<string, unknown>)[msg.propName] = msgData;
  }

  private onDeathStateContainerMessage(event: ConnectionMessage<DeathStateContainerMessage>): void {
    const msg = event.message;

    logTrace(this, `Received death state:`, JSON.stringify(msg.tIsDead));

    const id = this.getIdManager().getId(msg.tIsDead.idx);
    const form = this.worldModel.forms[id];

    if (form === undefined) {
      logError(this, `onDeathStateContainerMessage - Form with idx`, msg.tIsDead.idx, `not found`);
      return;
    }

    if (msg.tIsDead.propName !== nameof<FormModel>('isDead')) {
      logError(this, `onDeathStateContainerMessage - Invalid propName`, msg.tIsDead.propName);
      return;
    }

    const msgData = this.extractUpdatePropertyMessageData(msg.tIsDead);
    if (typeof msgData !== 'boolean') {
      logError(this, `onDeathStateContainerMessage - Invalid data`, msgData);
      return;
    }

    if (msg.tChangeValues) {
      this.onChangeValuesMessage({ message: msg.tChangeValues });
    }
    once('update', () => this.onUpdatePropertyMessage({ message: msg.tIsDead }));

    if (msg.tTeleport) {
      this.onTeleportMessage({ message: msg.tTeleport });
    }

    once('update', () => {
      const actor =
        id === this.getWorldModel().playerCharacterFormIdx
          ? Game.getPlayer()!
          : Actor.from(Game.getFormEx(remoteIdToLocalId(form.refrId ?? 0)));
      if (actor) {
        try {
          this.controller.emitter.emit("applyDeathStateEvent", {
            actor: actor,
            isDead: msgData
          });
        } catch (e) {
          if (e instanceof RespawnNeededError) {
            actor.disableNoWait(false);
            actor.delete();
          } else {
            throw e;
          }
        }
      }
    });
  }

  private handleConnectionAccepted(): void {
    this.worldModel.forms = [];
    this.worldModel.playerCharacterFormIdx = -1;
    this.worldModel.playerCharacterRefrId = 0;

    logTrace(this, "Handle connection accepted");
  }

  private onChangeValuesMessage(event: ConnectionMessage<ChangeValuesMessage>): void {
    const msg = event.message;

    once('update', () => {
      const id = this.getIdManager().getId(msg.idx);
      const refr = id === this.getMyActorIndex() ? Game.getPlayer() : getObjectReference(id);
      const ac = Actor.from(refr);
      if (!ac) {
        return;
      }

      const { health, stamina, magicka } = msg.data;
      if (typeof health === "number") {
        setActorValuePercentage(ac, 'health', health);
      }
      if (typeof stamina === "number") {
        setActorValuePercentage(ac, 'stamina', stamina);
      }
      if (typeof magicka === "number") {
        setActorValuePercentage(ac, 'magicka', magicka);
      }
    });
  }

  private onSetRaceMenuOpenMessage(event: ConnectionMessage<SetRaceMenuOpenMessage>): void {
    const msg = event.message;

    if (msg.open) {
      // wait 0.3s cause we can see visual bugs when teleporting
      // and showing this menu at the same time in onConnect
      once('update', () =>
        Utility.wait(0.3).then(() => {
          unequipIronHelmet();
          Game.showRaceMenu();
        }),
      );
    } else {
      // TODO: Implement closeMenu in SkyrimPlatform
    }
  }

  /** Packet handlers end **/

  getWorldModel(): WorldModel {
    return this.worldModel;
  }

  getMyActorIndex(): number {
    return this.worldModel.playerCharacterFormIdx;
  }

  getMyRemoteRefrId(): number {
    return this.worldModel.playerCharacterRefrId;
  }

  getIdManager() {
    return this.idManager_;
  }

  private get worldModel(): WorldModel {
    if (typeof storage["worldModel"] === "function") {
      storage["worldModel"] = { forms: [], playerCharacterFormIdx: -1, playerCharacterRefrId: 0 };
    }
    return storage["worldModel"] as WorldModel;
  }

  private get idManager_(): IdManager {
    if (typeof storage["idManager"] === "function") {
      // Note: full IdManager object preserved across hot-reloads, including methods.
      storage["idManager"] = new IdManager();
    }
    return storage["idManager"] as IdManager;
  }

  private onceLoad(
    refrId: number,
    callback: (refr: ObjectReference) => void,
    maxAttempts: number = 120,
  ) {
    once('update', () => {
      const refr = ObjectReference.from(Game.getFormEx(refrId));
      if (refr) {
        callback(refr);
      } else {
        maxAttempts--;
        if (maxAttempts > 0) {
          once('update', () => this.onceLoad(refrId, callback, maxAttempts));
        } else {
          logError(this, 'Failed to load object reference ' + refrId.toString(16));
        }
      }
    });
  };

  private skipFormViewCreation(
    msg: UpdatePropertyMessage | CreateActorMessage,
  ) {
    // Optimization added in #1186, however it doesn't work for doors for some reason
    return msg.refrId && msg.refrId < 0xff000000 && msg.baseRecordType !== 'DOOR';
  };

  private extractUpdatePropertyMessageData(updatePropertyMessage: UpdatePropertyMessage) {
    let msgData: unknown = updatePropertyMessage.data;

    if (updatePropertyMessage.dataDump !== undefined) {
      try {
        msgData = JSON.parse(updatePropertyMessage.dataDump);
      } catch (e) {
        if (e instanceof SyntaxError) {
          logError(this, 'extractUpdatePropertyMessageData - Failed to parse dataDump', updatePropertyMessage.dataDump);
          return;
        } else {
          throw e;
        }
      }
    }

    return msgData;
  }

  private onSpellCastMessage(event: ConnectionMessage<SpellCastMessage>): void {
    const msg = event.message;

    once('update', () => {
      const ac = Actor.from(Game.getFormEx(remoteIdToLocalId(msg.data.caster)));
      if (!ac) {
        return;
      }

      // GREYMARCH (2026-10-31, a crash in the player's own casting animation, DefaultMagicCastingBehavior / magicMoveStartTransition, in Duskglow Crevice):
      // a cast or its end is never replayed onto THIS game's player. Their own game already casts it; forcing the server's copy of their animation
      // variables into their live casting animation (interruptCast) broke it
      if (ac.getFormID() === 0x14) {
        this.greymarchMagicDiag(`magic: ${msg.data.caster.toString(16)} ${msg.data.interruptCast ? "end" : "cast"} ${msg.data.spell.toString(16)}: this game's own player, not replayed`);
        return;
      }

      const actorAnimationVariables: ActorAnimationVariables = {
        booleans: new Uint8Array(msg.data.actorAnimationVariables.booleans),
        floats: new Uint8Array(msg.data.actorAnimationVariables.floats),
        integers: new Uint8Array(msg.data.actorAnimationVariables.integers)
      };

      const castKey = `${msg.data.caster}:${msg.data.castingSource}`;

      // GREYMARCH (2026-10-30, a crash at the end of a held Frostbite): an NPC THIS game runs cast it here already, with its own AI; the server's copy of its
      // cast or its end, sent back, is never replayed onto it (an end forced its animation variables in and interrupted it mid-cast). Its own cast is enough
      try {
        const hosted = storage['hosted'];
        if (Array.isArray(hosted) && (hosted.includes(msg.data.caster) || hosted.includes(msg.data.caster + 0x100000000))) {
          this.greymarchMagicDiag(`magic: ${msg.data.caster.toString(16)} ${msg.data.interruptCast ? "end" : "cast"} ${msg.data.spell.toString(16)}: an NPC this game runs, not replayed`);
          return;
        }
      } catch (e) { /* replayed as before */ }

      // GREYMARCH: never on a werewolf, werebear or creature form (see greymarchIsBeastCopy)
      if (this.greymarchIsBeastCopy(msg.data.caster, ac)) {
        this.greymarchMagicDiag(`magic: ${msg.data.caster.toString(16)} ${msg.data.interruptCast ? "end" : "cast"} ${msg.data.spell.toString(16)} hand ${msg.data.castingSource}: not replayed (a beast or creature copy)`);
        return;
      }

      // GREYMARCH (2026-11-01, Falmer crashes in Duskglow Crevice: a Falmer Gloomlurker's animation graph broke while a spell effect was being put on it,
      // a minute after the watching player logged back in): nothing is replayed onto a copy whose model has not finished loading (its graph is not ready)
      let loaded3d = false;
      try { loaded3d = !!ac.is3DLoaded(); } catch (e) { loaded3d = false; }
      if (!loaded3d) {
        this.greymarchMagicDiag(`magic: ${msg.data.caster.toString(16)} ${msg.data.interruptCast ? "end" : "cast"} ${msg.data.spell.toString(16)}: its model is not loaded here yet, not replayed`);
        return;
      }

      if (msg.data.interruptCast) {
        this.greymarchHeldSpells.delete(castKey);
        // GREYMARCH (2026-11-01): an NPC another game runs ends its cast with the game's own plain InterruptCast; the other game's animation variables are
        // never forced into this copy's graph (they are for a player's copy, whose graph is the same human one)
        if (!this.greymarchIsPlayerCopy(msg.data.caster)) {
          try { ac.interruptCast(); } catch (e) { /* not loaded */ }
          this.greymarchMagicDiag(`magic: saw NPC ${msg.data.caster.toString(16)} end ${msg.data.spell.toString(16)} hand ${msg.data.castingSource} (plain interrupt)`);
          return;
        }
        interruptCast(ac.getFormID(), msg.data.castingSource, actorAnimationVariables);
        this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} end ${msg.data.spell.toString(16)} hand ${msg.data.castingSource}`);
        // GREYMARCH: the call above does nothing when the caster's animation variables cannot be applied, and a concentration spell
        // (Flames) then kept burning in this game for good. So the game's own InterruptCast follows a moment later, unless the same
        // caster has started a new cast from that hand since (it must never cut a fresh cast short).
        const endedAt = Date.now();
        const casterId = ac.getFormID();
        const later = () => {
          if ((this.greymarchLastCastAt.get(castKey) || 0) > endedAt) {
            return;
          }
          if (Date.now() - endedAt < 300) {
            once('update', later);
            return;
          }
          try { const again = Actor.from(Game.getFormEx(casterId)); if (again) again.interruptCast(); } catch (e) { /* not loaded */ }
        };
        once('update', later);
        return;
      }

      this.greymarchLastCastAt.set(castKey, Date.now());

      // GREYMARCH: the spell the caster named, when this game's copy of them does not hold it (their equipment arrived late or not at all)
      const held = ac.getEquippedSpell(msg.data.castingSource);
      const spell = held || Spell.from(Game.getFormEx(msg.data.spell));

      // GREYMARCH: a held (concentration) spell is shown once; the caster's game repeats the cast every second while it is held, and those
      // reminders only keep it going here. With no word for HELD_SILENCE_MS it is ended here (a lost end, a caster who left).
      const isHeld = !!spell && this.greymarchIsHeld(spell);
      const showing = this.greymarchHeldSpells.get(castKey);
      if (isHeld && showing && showing.spell === spell!.getFormID()) {
        showing.lastSeen = Date.now();
        return;
      }

      // GREYMARCH: this game's own cast, sent back (an NPC this game runs cast it here already): not cast a second time
      let castHere = false;
      try { castHere = !!spell && this.controller.lookupListener(MagicSyncService).castHere(ac.getFormID(), spell.getFormID(), 1500); } catch (e) { castHere = false; }
      if (castHere) {
        if (isHeld) this.greymarchHeldSpells.set(castKey, { spell: spell!.getFormID(), casterId: ac.getFormID(), lastSeen: Date.now() }); // its reminders only keep it going
        this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast ${msg.data.spell.toString(16)} hand ${msg.data.castingSource}: cast in this game already (an NPC it runs), not again`);
        return;
      }

      this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast ${msg.data.spell.toString(16)} hand ${msg.data.castingSource} (their copy holds ${held ? held.getFormID().toString(16) : "nothing"}, casting ${spell ? spell.getFormID().toString(16) : "nothing"})`);
      if (spell) {
        castSpellImmediate(ac.getFormID(), msg.data.castingSource, spell.getFormID(), remoteIdToLocalId(msg.data.target),
          msg.data.aimAngle, msg.data.aimHeading, actorAnimationVariables);
        if (isHeld) {
          this.greymarchHeldSpells.set(castKey, { spell: spell.getFormID(), casterId: ac.getFormID(), lastSeen: Date.now() });
        } else {
          this.greymarchHeldSpells.delete(castKey);
        }
      }
    });
  }

  // GREYMARCH: IS THIS COPY A BEAST (2026-10-23)? SkyMP replays another player's spell casts on this game's copy of them (castSpellImmediate,
  // interruptCast) and copies their animation variables onto it (applyAnimationVariablesToActor), raw arrays by index into the graph's variables.
  // On a werewolf or werebear copy that wrote the caster's variables into the werewolf graph (its own graph, or the human one while the copy was still
  // a stand-in, or the other way round): a watching game crashed in the voice-cast step (BeginCastVoiceEvaluator, garbage pointer, 2026-10-22 17:28,
  // a polar bear) and the moment a werewolf roared (2026-10-23 17:02, the Elder Alpha: R casts the howl voice in the roarer's own game). A beast casts
  // nothing a watching game must show (the roar reaches it as greymarchWolfRoar, a sound), so nothing is replayed onto it. The copy is a beast when its
  // race is a were-race, or when the server's look for it has no head parts (a beast look, the stand-in included, or a creature form).
  private greymarchIsBeastCopy(remoteId: number, ac: Actor): boolean {
    try {
      const race = ac.getRace();
      if (race) {
        if (this.greymarchWerebearRace < 0) { const f = Game.getFormFromFile(0x1e17b, "Dragonborn.esm"); this.greymarchWerebearRace = f ? f.getFormID() : 0; }
        const m: any = (Function("return this")() as any).__gmWolfRace;
        const formRaces = m ? Object.keys(m).map((k) => Number(m[k]) || 0) : [];
        if (isWereRace(race.getFormID(), this.greymarchWerebearRace, formRaces)) return true;
      }
      const forms = this.getWorldModel().forms;
      for (let i = 0; i < forms.length; i++) {
        const f = forms[i];
        if (f && f.refrId === remoteId) {
          const ap: any = f.appearance;
          return !!ap && !(Array.isArray(ap.headpartIds) && ap.headpartIds.length > 0);
        }
      }
    } catch (e) { /* not known: replayed as before */ }
    return false;
  }
  private greymarchWerebearRace = -1;

  // GREYMARCH: is this copy a player's (the server sends a look for every player's actor, none for an NPC)
  private greymarchIsPlayerCopy(remoteId: number): boolean {
    try {
      const forms = this.getWorldModel().forms;
      for (let i = 0; i < forms.length; i++) {
        const f = forms[i];
        if (f && f.refrId === remoteId) return !!f.appearance;
      }
    } catch (e) { /* not known */ }
    return false;
  }

  private greymarchIsHeld(spell: Spell): boolean {
    try { const effect = spell.getNthEffectMagicEffect(0); return !!effect && effect.getCastingType() === 2; } catch (e) { return false; }
  }

  private greymarchEndSilentHeldSpells(): void {
    if (this.greymarchHeldSpells.size === 0) return;
    const now = Date.now();
    for (const [key, showing] of Array.from(this.greymarchHeldSpells.entries())) {
      if (now - showing.lastSeen < RemoteServer.HELD_SILENCE_MS) continue;
      this.greymarchHeldSpells.delete(key);
      try { const ac = Actor.from(Game.getFormEx(showing.casterId)); if (ac) ac.interruptCast(); } catch (e) { /* not loaded */ }
      this.greymarchMagicDiag(`magic: no word for ${RemoteServer.HELD_SILENCE_MS} ms about ${key} (${showing.spell.toString(16)}): ended here`);
    }
  }

  private static readonly HELD_SILENCE_MS = 2500;
  private greymarchHeldSpells = new Map<string, { spell: number, casterId: number, lastSeen: number }>();

  // GREYMARCH: what this game does with other players' spell casts, a few lines per session to the server log
  private greymarchMagicDiag(text: string): void {
    if (this.greymarchMagicDiagLeft <= 0) return;
    this.greymarchMagicDiagLeft--;
    try { (this.controller.emitter as any).emit("greymarchStage", text); } catch (e) { /* diagnostics only */ }
  }
  private greymarchMagicDiagLeft = 40;
  private greymarchDoubleCreates = 0;
  private greymarchLastCastAt = new Map<string, number>();

  private onUpdateAnimVariablesMessage(event: ConnectionMessage<UpdateAnimVariablesMessage>): void {
    const msg = event.message;

    once('update', () => {
      const ac = Actor.from(Game.getFormEx(remoteIdToLocalId(msg.data.actorRemoteId)));
      if (!ac) {
        return;
      }

      const actorAnimationVariables: ActorAnimationVariables = {
        booleans: new Uint8Array(msg.data.actorAnimationVariables.booleans),
        floats: new Uint8Array(msg.data.actorAnimationVariables.floats),
        integers: new Uint8Array(msg.data.actorAnimationVariables.integers)
      };

      if (this.greymarchIsBeastCopy(msg.data.actorRemoteId, ac)) return; // GREYMARCH: never into a werewolf, werebear or creature form's graph (greymarchIsBeastCopy)

      const isApplyed = applyAnimationVariablesToActor(ac.getFormID(), actorAnimationVariables);

      if (!isApplyed) {
        logError(this, 'Failed apply AnimationVariables to actor with id: ' + ac.getFormID().toString(16));
      }
    });
  }

  private numSetInventory = 0;
}
