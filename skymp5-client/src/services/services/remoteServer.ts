// @ts-expect-error (TODO: Remove in 2.10.0)
import { Actor, Debug, Form, FormType, Menu, Spell, Enchantment, callNative, interruptCast, castSpellImmediate, printConsole, applyAnimationVariablesToActor, ActorAnimationVariables } from 'skyrimPlatform';
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
  writeLogs,
} from 'skyrimPlatform';

import * as messages from '../../messages';

/* eslint-disable @typescript-eslint/no-empty-function */
import { ObjectReferenceEx } from '../../extensions/objectReferenceEx';
import { castAnimStart, castAnimStopEvent, castAnimFfMs, castAnimMode } from '../../greymarch/castAnimMode';
import { showSelfBuff } from '../../greymarch/selfShaders';
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

let gmBoundScriptedAt = 0;
on('update', () => {
  if (Date.now() - gmBoundScriptedAt < 400) return;
  gmBoundScriptedAt = Date.now();
  // GREYMARCH: THE BOUND SHIELD (2026-11-01, the owner): Mysticism's Bound Shield is a script effect (MAG_BoundShield_Script adds and equips the shield),
  // and that script does not run here either. While the effect is on the player the shield is given and worn; when it ends it is taken away. The server
  // lets them hold it (gamemode tools/bound-weapons.js SCRIPTED: the same pairs).
  for (const s of BOUND_SCRIPTED) {
    try {
      const pl = Game.getPlayer();
      const effect = Game.getFormFromFile(s.effect, s.file);
      const item = Game.getFormFromFile(s.item, s.file);
      if (!pl || !effect || !item) continue;
      const on = pl.hasMagicEffect(effect as any);
      const have = pl.getItemCount(item);
      if (on) {
        if (have < 1) pl.addItem(item, 1, true);
        if (!pl.isEquipped(item)) pl.equipItem(item, false, true);
      } else if (have > 0) {
        pl.removeItem(item, have, true, null);
      }
    } catch (e) { /* the next check */ }
  }
});
const BOUND_SCRIPTED = [
  { effect: 0xdc48d9, item: 0xdbf7d7, file: "MysticismMagic.esp" }, // Bound Shield
  { effect: 0xdc48db, item: 0xdc48d8, file: "MysticismMagic.esp" }, // Bound Shield (Mystic Binding)
];

// GREYMARCH: THE CIRCLE SPELLS' RINGS (2026-11-04, the owner: "Do that with all the circle spells"): the ring each circle cast by another player shows here, placed at their
// feet by the bridge (greymarchCircleTick). Each its own hazard when that hazard carries no spell (Mysticism's three colours, Guardian Circle's) or only turns
// undead (Circle of Protection's); Apocalypse's three carry their drain or death, which would work on this player here a second time, so they show Guardian Circle's.
// ms: how long the circle stands (gamemode circles.js); life: the hazard's own lifetime, after which it is placed again. Any other "circle" spell: Guardian's.
const GM_CIRCLE_RINGS: { spell: number, file: string, hazard: string, ms: number, life: number }[] = [
  { spell: 0x0e0ccf, file: "Skyrim.esm", hazard: "fead3:Skyrim.esm", ms: 60000, life: 30000 }, // Guardian Circle
  { spell: 0x05312d, file: "Skyrim.esm", hazard: "4e80c:Skyrim.esm", ms: 60000, life: 30000 }, // Circle of Protection
  { spell: 0xf3637f, file: "MysticismMagic.esp", hazard: "f36373:MysticismMagic.esp", ms: 120000, life: 120000 }, // Circle of Life
  { spell: 0xf3b48d, file: "MysticismMagic.esp", hazard: "f36373:MysticismMagic.esp", ms: 120000, life: 120000 }, // Font of Life
  { spell: 0x48ceeb, file: "MysticismMagic.esp", hazard: "f08a1c:MysticismMagic.esp", ms: 120000, life: 120000 }, // Circle of Wisdom
  { spell: 0xf3636b, file: "MysticismMagic.esp", hazard: "f08a1c:MysticismMagic.esp", ms: 120000, life: 120000 }, // Font of Wisdom
  { spell: 0xf21f4a, file: "MysticismMagic.esp", hazard: "f1ce37:MysticismMagic.esp", ms: 120000, life: 120000 }, // Circle of Strength
  { spell: 0xf3635d, file: "MysticismMagic.esp", hazard: "f1ce37:MysticismMagic.esp", ms: 120000, life: 120000 }, // Font of Strength
  { spell: 0x036a05, file: "Apocalypse - Magic of Skyrim.esp", hazard: "fead3:Skyrim.esm", ms: 30000, life: 30000 }, // Circle of Strength (a drain)
  { spell: 0x111cfb, file: "Apocalypse - Magic of Skyrim.esp", hazard: "fead3:Skyrim.esm", ms: 30000, life: 30000 }, // Circle of the Moons (a drain)
  { spell: 0x01220f, file: "Apocalypse - Magic of Skyrim.esp", hazard: "fead3:Skyrim.esm", ms: 30000, life: 30000 }, // Circle of Death
];
let gmCircleRingIds: Map<number, { hazard: string, ms: number, life: number }> | null = null;
const greymarchCircleRing = (spellId: number): { hazard: string, ms: number, life: number } => {
  if (!gmCircleRingIds) {
    gmCircleRingIds = new Map();
    for (const r of GM_CIRCLE_RINGS) { try { const f = Game.getFormFromFile(r.spell, r.file); if (f) gmCircleRingIds.set(f.getFormID() >>> 0, r); } catch (e) { /* that mod is not loaded */ } }
  }
  return gmCircleRingIds.get(spellId >>> 0) || GM_CIRCLE_RINGS[0];
};

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
      const go = () => {
        if (actor /*&& actor.getFormID() === 0x14*/) {
          ragdollService.safeRemoveRagdollFromWorld(actor, removeRagdollCallback);
        } else {
          removeRagdollCallback();
        }
      };
      // GREYMARCH: NEVER MOVED ON A HORSE (2026-10-31, the owner: "fix any and all conflicts these horses need"). Every server move (staff teleports, saved spots,
      // freezes, dungeons, encounters, /stuck, guard escorts, vampire feeding, the guard's put-back) took the character out of the physics and moved it while it
      // sat on a horse, which threw horse and rider about and once crashed the game in the horse camera. A mounted character gets off first (up to 3 s), then moves
      let gmMounted = false;
      try { gmMounted = !!actor && actor.isOnMount(); } catch (e) { gmMounted = false; }
      if (!gmMounted) { go(); return; }
      try { actor!.dismount(); } catch (e) { /* moved anyway after the wait */ }
      const gmSince = Date.now();
      const gmWait = () => {
        let still = false;
        try { still = !!actor && actor.isOnMount(); } catch (e) { still = false; }
        if (!still || Date.now() - gmSince > 3000) go(); else once('update', gmWait);
      };
      once('update', gmWait);
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
        this.greymarchCastPose(ac.getFormID(), msg.data.castingSource, false, false);
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
      // GREYMARCH (2026-11-03, the owner: "I am just holding them in others eyes"): a STAFF's cast names its enchantment, which castSpellImmediate cannot
      // cast (it takes a spell only). The copy casts it through GreymarchCamera.dll 1.11 (GreymarchCam.CastStaff): the bolt flies, a held staff's beam
      // starts. Its damage here is 0 (the server sends the staffs' enchantments with the spell edits, and does a staff's damage itself: staffs.js). A held
      // staff goes on while the caster's reminders come and ends like a held spell (their end, or HELD_SILENCE_MS without word).
      let ench: Enchantment | null = null;
      try { ench = Enchantment.from(Game.getFormEx(msg.data.spell)); } catch (e) { ench = null; }
      if (ench) {
        let heldStaff = false;
        try { const fx = ench.getNthEffectMagicEffect(0); heldStaff = !!fx && fx.getCastingType() === 2; } catch (e) { heldStaff = false; }
        const showingStaff = this.greymarchHeldSpells.get(castKey);
        if (heldStaff && showingStaff && showingStaff.spell === ench.getFormID()) {
          showingStaff.lastSeen = Date.now();
          this.greymarchAimCopy(ac, msg.data.aimAngle, msg.data.aimHeading);
          this.greymarchSprayAim(castKey, msg.data.aimAngle, msg.data.aimHeading);
          return;
        }
        // the same staff from the same hand again within 0.6 s is the same shot (a game that sent it twice): shown once
        if (!heldStaff) {
          const lastShot = this.greymarchStaffShotAt.get(castKey) || 0;
          if (Date.now() - lastShot < 600) return;
          this.greymarchStaffShotAt.set(castKey, Date.now());
        }
        let tgt: ObjectReference | null = null;
        try { tgt = msg.data.target ? ObjectReference.from(Game.getFormEx(remoteIdToLocalId(msg.data.target))) : null; } catch (e) { tgt = null; }
        let cast = false;
        // a held staff's spray is fired from the hand along the caster's aim (greymarchSpray), as a held spell's; anything else by CastStaff
        if (heldStaff && this.greymarchSpray(castKey, ac, ench.getFormID(), msg.data.castingSource, msg.data.aimAngle, msg.data.aimHeading)) cast = true;
        else { try { cast = !!callNative("GreymarchCam", "CastStaff", undefined, ac, ench, msg.data.castingSource === 0 ? 0 : 1, tgt); } catch (e) { cast = false; } }
        if (heldStaff && cast) { this.greymarchHeldSpells.set(castKey, { spell: ench.getFormID(), casterId: ac.getFormID(), lastSeen: Date.now() }); this.greymarchAimCopy(ac, msg.data.aimAngle, msg.data.aimHeading); }
        else this.greymarchHeldSpells.delete(castKey);
        this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast staff ${msg.data.spell.toString(16)} hand ${msg.data.castingSource}: ${cast ? (heldStaff ? "held, cast here" : "cast here") : "not cast (GreymarchCamera.dll older than 1.11?)"}`);
        return;
      }

      const spell = held || Spell.from(Game.getFormEx(msg.data.spell));

      // GREYMARCH: a held (concentration) spell is shown once; the caster's game repeats the cast every second while it is held, and those
      // reminders only keep it going here. With no word for HELD_SILENCE_MS it is ended here (a lost end, a caster who left).
      const isHeld = !!spell && this.greymarchIsHeld(spell);
      const showing = this.greymarchHeldSpells.get(castKey);
      if (isHeld && showing && showing.spell === spell!.getFormID()) {
        showing.lastSeen = Date.now();
        this.greymarchAimCopy(ac, msg.data.aimAngle, msg.data.aimHeading);
        this.greymarchSprayAim(castKey, msg.data.aimAngle, msg.data.aimHeading);
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

      this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast ${msg.data.spell.toString(16)} hand ${msg.data.castingSource} (their copy holds ${held ? held.getFormID().toString(16) : "nothing"}, casting ${spell ? spell.getFormID().toString(16) : "nothing"}; aim ${Number(msg.data.aimAngle).toFixed(2)}/${Number(msg.data.aimHeading).toFixed(2)}, copy angle ${Math.round(ac.getAngleX())}/${Math.round(ac.getAngleZ())}; /castanim ${castAnimMode()})`);
      // GREYMARCH (2026-11-01, the owner: a fire or frost cloak was never seen by others): a spell cast on oneself has no projectile, so the launch below
      // showed nothing; its look (each effect's shader on the caster) is played instead, and nothing else is run here (greymarch/selfShaders.ts)
      if (spell && showSelfBuff(ac, spell.getFormID())) {
        this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} buff themselves with ${spell.getFormID().toString(16)}: its look shown`);
        return;
      }
      // GREYMARCH (2026-11-01, the owner: another player's Bound Bow was given to someone else, or made the bow in their hands invisible): any other spell cast
      // on oneself (delivery Self: a bound weapon, a summon on self ...) is never launched here either: launched as a projectile it landed on whoever stood
      // nearest in this game, and its effect (a bound weapon) went to them. What it gives the caster reaches this game through their gear.
      let selfSpell = false;
      try { const fx = spell ? spell.getNthEffectMagicEffect(0) : null; selfSpell = !!fx && fx.getDeliveryType() === 0; } catch (e) { selfSpell = false; }
      if (spell && selfSpell) {
        // A BOUND WEAPON (2026-11-01, the owner: then nobody saw the caster's Bound Bow): the weapon that comes through the gear has no look (a bound weapon is
        // seen through the glow its magic effect starts). So a bound-weapon spell (named "Bound ...") is cast by the caster's copy ON ITSELF here (the game's
        // Cast with the copy as source and target: nobody else can get it), and the copy holds the game's own bound weapon, glow and all.
        let bound = false;
        try { bound = /^bound\b/i.test(spell.getName() || "") && this.greymarchIsPlayerCopy(msg.data.caster); } catch (e) { bound = false; }
        // NEVER WHILE THIS PLAYER HOLDS ONE (2026-11-01, test: this player's own Bound Bow vanished each time another player's was conjured here; alone it lasted
        // its full two minutes): a bound weapon starting on the copy ended this player's own, so while they hold a bound weapon the copy's is not conjured
        let mineHeld = false;
        try {
          const me = Game.getPlayer();
          const r = me ? me.getEquippedWeapon(false) : null, l = me ? me.getEquippedWeapon(true) : null;
          mineHeld = (!!r && /^bound\b/i.test(r.getName() || "")) || (!!l && /^bound\b/i.test(l.getName() || ""));
        } catch (e) { mineHeld = true; }
        if (bound && mineHeld) {
          this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} conjure ${spell.getFormID().toString(16)}: not on their copy (this player holds a bound weapon)`);
          return;
        }
        if (bound) {
          try { spell.cast(ac, ac).catch(() => { /* not shown */ }); } catch (e) { /* not shown */ }
          this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} conjure ${spell.getFormID().toString(16)}: cast on their copy itself`);
          return;
        }
        // A CIRCLE SPELL (2026-11-04, the owner: "Still can not see the ring", after the server's ring word never came): another player's Guardian Circle,
        // Circle of Life, Font of ..., Circle of the Moons ... is shown here from the cast itself: their copy casts Guardian Circle ON ITSELF, which puts its
        // ring at their feet (it heals that copy only, which the server overrides, and turns undead as theirs does). Never their own spell: a drain or a
        // restore circle would work on this player here too, and what a circle does is the server's (gamemode circles.js). The bridge then skips the server's
        // ring word for that caster (__gmCircleShownAt), so one ring stands
        let circle = false;
        try { circle = /circle|^font of /i.test(spell.getName() || "") && !/dispel/i.test(spell.getName() || "") && this.greymarchIsPlayerCopy(msg.data.caster); } catch (e) { circle = false; }
        // (2026-11-04, the owner: "Still don't see it": Guardian Circle cast by the copy showed nothing, the copy's cast does not spawn the hazard.) The ring
        // itself, Guardian Circle's hazard, is placed at their feet by the bridge instead (greymarchCircleTick, the same placing as the server's word)
        if (circle) {
          try {
            const gl: any = Function("return this")();
            const now = Date.now(), who = msg.data.caster >>> 0;
            (gl.__gmCircleShownAt || (gl.__gmCircleShownAt = {}))[String(who)] = now;
            const ring = greymarchCircleRing(spell.getFormID());
            (gl.__gmCircleLocalQueue || (gl.__gmCircleLocalQueue = [])).push({ key: who + ":" + now, pos: [ac.getPositionX(), ac.getPositionY(), ac.getPositionZ()], hazard: ring.hazard, ms: ring.ms, life: ring.life, local: true, caster: who });
          } catch (e) { /* not shown */ }
          this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast the circle ${spell.getFormID().toString(16)}: its ring goes at their feet`);
          return;
        }
        this.greymarchMagicDiag(`magic: saw ${msg.data.caster.toString(16)} cast ${spell.getFormID().toString(16)} on themselves: not replayed here`);
        return;
      }
      // GREYMARCH (2026-11-01, a crash in a Skeleton's behavior graph in Bonechill Passage, weapon out, its magic modifier running): castSpellImmediate
      // first writes the caster's game's animation variables into this copy's graph, slot by slot, as if it were the same graph. For a player's copy it is
      // (the human graph); an NPC's is its own (a draugr's, a Falmer's ...), and the writes broke its state machine. An NPC another game runs is shown
      // casting with the game's own plain Cast instead (the spell's projectile from it, nothing written into its graph); a held spell is not shown
      if (spell && !this.greymarchIsPlayerCopy(msg.data.caster)) {
        if (!isHeld) {
          try {
            const tgt = msg.data.target ? ObjectReference.from(Game.getFormEx(remoteIdToLocalId(msg.data.target))) : null;
            spell.cast(ac, tgt).catch(() => { /* not shown */ });
          } catch (e) { /* not shown */ }
        }
        this.greymarchMagicDiag(`magic: saw NPC ${msg.data.caster.toString(16)} cast ${spell.getFormID().toString(16)}: ${isHeld ? "held, not shown" : "plain cast"}`);
        return;
      }
      if (spell) {
        // a held spray (Flames, Frostbite ...) is fired from the hand along the caster's own aim (greymarchSpray); anything else as SkyMP casts it
        const sprayed = isHeld && this.greymarchSpray(castKey, ac, spell.getFormID(), msg.data.castingSource, msg.data.aimAngle, msg.data.aimHeading);
        if (!sprayed) castSpellImmediate(ac.getFormID(), msg.data.castingSource, spell.getFormID(), remoteIdToLocalId(msg.data.target),
          msg.data.aimAngle, msg.data.aimHeading, actorAnimationVariables);
        this.greymarchCastPose(ac.getFormID(), msg.data.castingSource, true, isHeld);
        if (isHeld) this.greymarchAimCopy(ac, msg.data.aimAngle, msg.data.aimHeading);
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

  // GREYMARCH: THE CASTING POSE (2026-11-04, the owner: "people actually do the magic casting animation for other people instead of just standing there
  // shooting magic"; and a held spell's stream went in different directions, aimed from a hand hanging at the copy's side). The character graph casts
  // with the hand's bWantCastRight / bWantCastLeft (magicbehavior.hkx: BeginCast on false to true, CastStop on true to false); SkyMP only copied them
  // once with the cast's animation variables. They are set on the caster's copy: on at the cast, off when a held spell ends, and off after
  // POSE_FF_MS for a fire-and-forget spell (its release). Player copies only (the human graph), hands only.
  private static readonly POSE_FF_MS = 700;
  private greymarchPoseOff = new Map<string, number>(); // "copy:hand" -> when its pose goes off (fire and forget)
  private greymarchCastPose(copyId: number, castingSource: number, on: boolean, held: boolean): void {
    if (castingSource !== 0 && castingSource !== 1) return;
    const name = castingSource === 0 ? "bWantCastLeft" : "bWantCastRight";
    const key = copyId + ":" + castingSource;
    // THE GRAPH'S OWN EVENTS (2026-11-04, the owner: still no casting animation; the variables alone, which SkyMP also sends every half second, do not move
    // the graph): <hand>_SpellAimedStart / _SpellAimedConcentrationStart put the arm into the aimed cast, CastStop ends it (0_master / magicbehavior.hkx)
    const hand = castingSource === 0 ? "MLh" : "MRh";
    try {
      const ac = Actor.from(Game.getFormEx(copyId));
      if (!ac) return;
      const how = castAnimStart(castingSource, held);
      if (how.vars) ac.setAnimationVariableBool(name, on);
      // a single shot whose charge was already shown (greymarchCastCharge, bridge.ts) is not started again: the charge flows into the release
      const charging = !held && Date.now() - (Number(storage["greymarchCharging:" + copyId + ":" + castingSource]) || 0) < 15000;
      storage["greymarchCharging:" + copyId + ":" + castingSource] = 0;
      if (on && !charging) {
        if (how.begin) Debug.sendAnimationEvent(ac, castingSource === 0 ? "BeginCastLeft" : "BeginCastRight"); // the input event the game's own cast sends
        // SWAPPED (2026-11-04, the owner: "when people cast a single shot they hold their hand out, and when they cast a stream they charge it by their
        // head. That animation is reversed"): in this graph _SpellAimedStart gives the hand held out (the stream) and _SpellAimedConcentrationStart the charge
        // by the head (the single shot)
        if (how.sub) Debug.sendAnimationEvent(ac, how.sub); // which one: /castanim (castAnimMode.ts); the swapped set by default
        // WHAT THE COPY DID (diagnostics, a quarter second later): drawn, casting, the hand's type and state, the aim it was given
        const at0 = Date.now();
        const look = () => {
          if (Date.now() - at0 < 250) { once('update', look); return; }
          try {
            const a3 = Actor.from(Game.getFormEx(copyId)); if (!a3) return;
            const b = (n: string) => { try { return a3.getAnimationVariableBool(n) ? 1 : 0; } catch (e) { return -1; } };
            const i = (n: string) => { try { return a3.getAnimationVariableInt(n); } catch (e) { return -1; } };
            const fl = (n: string) => { try { return Math.round(a3.getAnimationVariableFloat(n) * 100) / 100; } catch (e) { return -1; } };
            this.greymarchMagicDiag(`magic: copy ${copyId.toString(16)} after the cast: drawn ${a3.isWeaponDrawn() ? 1 : 0}, ${name} ${b(name)}, IsCastingRight ${b("IsCastingRight")} IsCastingLeft ${b("IsCastingLeft")}, iState ${i("iState")}, iRightHandType ${i("iRightHandType")} iLeftHandType ${i("iLeftHandType")}, aim pitch ${fl("AimPitchCurrent")} heading ${fl("AimHeadingCurrent")}, angle x ${Math.round(a3.getAngleX())}`);
          } catch (e) { /* diagnostics only */ }
        };
        once('update', look);
      }
      else { this.greymarchAimRelease(copyId); if (castAnimStopEvent()) Debug.sendAnimationEvent(ac, "CastStop"); if (held === false) { try { if (Math.abs(ac.getAngleX()) > 1) ac.setAngle(0, ac.getAngleY(), ac.getAngleZ()); } catch (e2) { /* level again */ } } }
    } catch (e) { return; }
    if (!on || held) { this.greymarchPoseOff.delete(key); return; }
    const at = Date.now() + castAnimFfMs();
    this.greymarchPoseOff.set(key, at);
    const later = () => {
      if (this.greymarchPoseOff.get(key) !== at) return; // another cast since: its own timer
      if (Date.now() < at) { once('update', later); return; }
      this.greymarchPoseOff.delete(key);
      try { const a2 = Actor.from(Game.getFormEx(copyId)); if (a2) { if (castAnimMode() !== 6) a2.setAnimationVariableBool(name, false); if (castAnimStopEvent()) Debug.sendAnimationEvent(a2, "CastStop"); } } catch (e) { /* gone */ }
    };
    once('update', later);
  }

  // GREYMARCH: a held spell aims from the copy's own pitch, which the movement never brings (always 0): the cast's aim (radians, the game's angle X) is put
  // on the copy, at the cast and with each of the caster's aim updates while it is held
  // SMOOTH (2026-11-04, the owner: "so seamless its like its being casted from their game"): the caster's aim (pitch and heading, the camera's, up to 10
  // updates a second) is a target; every frame the copy turns a third of the way to it, so a sweep is followed without steps. Heading too: a standing
  // turn under 80 degrees never reached the copy (movementApply), and the stream went off to the side. Held 1.6 s after the caster's last word (their
  // reminders come each second), and let go at the cast's end.
  private greymarchAimTargets = new Map<number, { pitch: number, heading: number, until: number, cur?: number, put?: number }>();
  private greymarchAimLoop = false;
  private greymarchPitchNative: boolean | undefined = undefined; // GreymarchCamera.dll 1.13 SetActorPitch there?
  private greymarchAimCopy(ac: Actor, aimAngle: number, aimHeading: number): void {
    if (!Number.isFinite(aimAngle)) return;
    const pitch = Math.max(-89, Math.min(89, aimAngle * 180 / Math.PI));
    let heading = Number.isFinite(aimHeading) ? aimHeading * 180 / Math.PI : NaN;
    if (Number.isFinite(heading)) heading = ((heading % 360) + 360) % 360;
    const was = this.greymarchAimTargets.get(ac.getFormID());
    this.greymarchAimTargets.set(ac.getFormID(), { pitch, heading, until: Date.now() + 1600, cur: was ? was.cur : undefined, put: was ? was.put : undefined });
    if (this.greymarchAimLoop) return;
    this.greymarchAimLoop = true;
    let prev = Date.now();
    const step = () => {
      const now = Date.now();
      // CLEAN (2026-11-04, the owner: following now, "but its extremely buggy"): eased by time, not by frame (the same speed at any frame rate)
      const alpha = 1 - Math.exp(-Math.max(1, now - prev) / 90);
      prev = now;
      for (const [id, t] of Array.from(this.greymarchAimTargets.entries())) {
        if (now > t.until) { this.greymarchAimTargets.delete(id); continue; }
        try {
          const a = Actor.from(Game.getFormEx(id));
          if (!a || a.isDead()) { this.greymarchAimTargets.delete(id); continue; }
          // UP AND DOWN BY TRANSLATETO (2026-11-04, the owner: "its reading side to side, but it is not reading up and down"): the game ignores SetAngle's
          // X on a character, but keeps the X a TranslateTo brings (the movement's way: a copy once stayed 54 degrees down after one). The pitch is kept
          // here (cur), a third of the way to the target each frame, and put on with a TranslateTo to where the copy stands; the heading by SetAngle.
          // movementApply.ts uses the same pitch while it lasts (storage greymarchAimPitch), so a walk does not level it.
          // the heading: the body turns smoothly to face where the stream goes (a turn of under a degree is left alone: no twitch)
          const z = a.getAngleZ();
          let nz = z;
          if (Number.isFinite(t.heading)) { const d = ((t.heading - z + 540) % 360) - 180; if (Math.abs(d) > 1) nz = z + d * alpha; }
          if (nz !== z) a.setAngle(a.getAngleX(), a.getAngleY(), nz);
          // THE PITCH (2026-11-04, the owner: "now it not even moving up and down": the game aims a spray, and a beam, from the copy's own pitch). Eased by
          // time and written straight into the copy every frame (GreymarchCamera.dll 1.13 SetActorPitch: no movement, so no twitch). An older DLL: a
          // TranslateTo, but only when it moved 1.5 degrees (one every frame made the copy twitch and slide)
          const cur: number = typeof t.cur === "number" && Number.isFinite(t.cur) ? t.cur : a.getAngleX();
          const nx = Math.abs(t.pitch - cur) < 0.2 ? t.pitch : cur + (t.pitch - cur) * alpha;
          let direct = false;
          if (this.greymarchPitchNative !== false) {
            try { direct = !!callNative("GreymarchCam", "SetActorPitch", undefined, a, nx * Math.PI / 180); } catch (e3) { direct = false; }
            this.greymarchPitchNative = direct;
          }
          if (direct) { t.cur = nx; t.put = nx; }
          else if (typeof t.put !== "number" || !Number.isFinite(t.put) || Math.abs(nx - t.put) > 1.5) {
            a.translateTo(a.getPositionX(), a.getPositionY(), a.getPositionZ(), nx, a.getAngleY(), nz, 100, 0);
            t.put = nx;
          }
          t.cur = nx;
          const aimPitch = storage["greymarchAimPitch"] || (storage["greymarchAimPitch"] = {});
          (aimPitch as any)[id] = { deg: nx, until: t.until };
        } catch (e) { this.greymarchAimTargets.delete(id); }
      }
      if (this.greymarchAimTargets.size) once('update', step); else this.greymarchAimLoop = false;
    };
    once('update', step);
  }
  // the cast ended: the copy's aim is no longer held (the movement and the level pitch take it again)
  private greymarchAimRelease(copyId: number): void { this.greymarchAimTargets.delete(copyId); try { const m: any = storage["greymarchAimPitch"]; if (m) delete m[copyId]; } catch (e) { /* none */ } }

  // GREYMARCH: ANOTHER PLAYER'S STREAM, FIRED ALONG THEIR AIM (2026-11-04, the owner: "he is shooting it directly at the statue and its going behind him").
  // A held spray cast on the copy was aimed by the game from the copy, which never has the caster's aim. Instead its projectiles are launched here from
  // the copy's hand along the aim the caster's game sends (the camera's: GreymarchCamera.dll 1.12 GreymarchCam.FireSpellAt), SPRAY_MS apart, easing a
  // third of the way to each new aim, until the cast ends (greymarchHeldSpells no longer holds it). false when the DLL is older or it is no spray (a beam):
  // then it is cast as before.
  private static readonly SPRAY_MS = 33; // about 30 a second: a steady stream, not puffs
  private greymarchSprays = new Map<string, { copyId: number, form: number, hand: number, pitch: number, heading: number, wantPitch: number, wantHeading: number }>();
  private greymarchSpray(castKey: string, ac: Actor, form: number, castingSource: number, aimAngle: number, aimHeading: number): boolean {
    if (!Number.isFinite(aimAngle) || !Number.isFinite(aimHeading)) return false;
    // FROM THE MOUTH (2026-11-11, the owner: breath powers): a cast from the voice slot (2: Breath of Fire, Frost, Poison) is sprayed from the copy's head
    // (GreymarchCamera 1.18 FireSpellAt source 2); an older DLL that does not know 2 sprays it from the right hand
    const hand = castingSource === 0 ? 0 : castingSource === 2 ? 2 : 1;
    let ok = false;
    try { ok = !!callNative("GreymarchCam", "FireSpellAt", undefined, ac, Game.getFormEx(form), hand, aimAngle, aimHeading); } catch (e) { ok = false; }
    if (!ok) return false;
    const had = this.greymarchSprays.has(castKey);
    this.greymarchSprays.set(castKey, { copyId: ac.getFormID(), form, hand, pitch: aimAngle, heading: aimHeading, wantPitch: aimAngle, wantHeading: aimHeading });
    this.greymarchMagicDiag(`magic: spraying ${form.toString(16)} from copy ${ac.getFormID().toString(16)} along ${aimAngle.toFixed(2)}/${aimHeading.toFixed(2)}`);
    if (had) return true;
    let last = Date.now();
    const tick = () => {
      const st = this.greymarchSprays.get(castKey);
      if (!st) return;
      const held = this.greymarchHeldSpells.get(castKey);
      if (!held || held.spell !== st.form) { this.greymarchSprays.delete(castKey); return; }
      const now = Date.now();
      if (now - last >= RemoteServer.SPRAY_MS) {
        const k = 1 - Math.exp(-(now - last) / 70); // eased by time toward the newest aim
        last = now;
        st.pitch += (st.wantPitch - st.pitch) * k;
        // one pitch for the copy and its spray: the aim loop's (greymarchAimCopy), when it holds this copy
        const aimT = this.greymarchAimTargets.get(st.copyId);
        if (aimT && typeof aimT.cur === "number" && Number.isFinite(aimT.cur)) st.pitch = aimT.cur * Math.PI / 180;
        let d = st.wantHeading - st.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        st.heading += d * k;
        try {
          const a = Actor.from(Game.getFormEx(st.copyId));
          if (!a || a.isDead()) { this.greymarchSprays.delete(castKey); return; }
          callNative("GreymarchCam", "FireSpellAt", undefined, a, Game.getFormEx(st.form), st.hand, st.pitch, st.heading);
        } catch (e) { this.greymarchSprays.delete(castKey); return; }
      }
      once('update', tick);
    };
    once('update', tick);
    return true;
  }
  private greymarchSprayAim(castKey: string, aimAngle: number, aimHeading: number): void {
    const st = this.greymarchSprays.get(castKey);
    if (!st || !Number.isFinite(aimAngle) || !Number.isFinite(aimHeading)) return;
    st.wantPitch = aimAngle; st.wantHeading = aimHeading;
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
      try { const ac = Actor.from(Game.getFormEx(showing.casterId)); if (ac) { ac.interruptCast(); ac.setAnimationVariableBool("bWantCastLeft", false); ac.setAnimationVariableBool("bWantCastRight", false); Debug.sendAnimationEvent(ac, "CastStop"); } } catch (e) { /* not loaded */ }
      this.greymarchMagicDiag(`magic: no word for ${RemoteServer.HELD_SILENCE_MS} ms about ${key} (${showing.spell.toString(16)}): ended here`);
    }
  }

  private static readonly HELD_SILENCE_MS = 2500;
  private greymarchHeldSpells = new Map<string, { spell: number, casterId: number, lastSeen: number }>();
  private greymarchStaffShotAt = new Map<string, number>();

  // GREYMARCH: what this game does with other players' spell casts, a few lines per session to the server log
  private greymarchMagicDiag(text: string): void {
    if (this.greymarchMagicDiagLeft <= 0) return;
    this.greymarchMagicDiagLeft--;
    try { (this.controller.emitter as any).emit("greymarchStage", text); } catch (e) { /* diagnostics only */ }
  }
  private greymarchMagicDiagLeft = 400;
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
