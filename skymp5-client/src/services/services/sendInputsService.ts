import { ClientListener, CombinedController, Sp } from "./clientListener";
import { SinglePlayerService } from "./singlePlayerService";
import { FormModel, WorldModel } from "../../view/model";
import { MsgType } from "../../messages";
import { getMovement } from "../../sync/movementGet";

// TODO: refactor this out
import * as worldViewMisc from "../../view/worldViewMisc";

import { Animation, AnimationSource } from "../../sync/animation";
import { Actor, EquipEvent, FormType, writeLogs } from "skyrimPlatform";
import { getAppearance } from "../../sync/appearance";
import { ActorValues, getActorValues } from "../../sync/actorvalues";
import { getEquipment } from "../../sync/equipment";
import { nextHostAttempt } from "../../view/hostAttempts";
import { SkympClient } from "./skympClient";
import { MessageWithRefrId } from "../events/sendMessageWithRefrIdEvent";
import { UpdateMovementMessage } from "../messages/updateMovementMessage";
import { ChangeValuesMessage } from "../messages/changeValuesMessage";
import { UpdateAnimationMessage } from "../messages/updateAnimationMessage";
import { UpdateEquipmentMessage } from "../messages/updateEquipmentMessage";
import { UpdateAppearanceMessage } from "../messages/updateAppearanceMessage";
import { RemoteServer } from "./remoteServer";
import { DeathService } from "./deathService";
import { logTrace } from "../../logging";

const playerFormId = 0x14;

// TODO: split this service into EquipmentService, MovementService, AnimationService, ActorValueService, HostAttemptsService
const GM_EQ_SETTLE_MS = 1500; // GREYMARCH: after the last equip or unequip, the gear is sent once more (see sendEquipment)
export class SendInputsService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.on("update", () => this.onUpdate());
        this.controller.on("equip", (e) => this.onEquip(e));
        this.controller.on("unequip", (e) => this.onUnequip(e));
        this.controller.on("loadGame", () => this.onLoadGame());
    }

    private onUpdate() {
        if (!this.singlePlayerService.isSinglePlayer) {
            this.sendInputs();

            const player = this.sp.Game.getPlayer()!;
            const isPlayerCasting = player.getAnimationVariableBool("IsCastingRight")
                || player.getAnimationVariableBool("IsCastingLeft")
                || player.getAnimationVariableBool("IsCastingDual");

            if (isPlayerCasting) {
                this.prevCastingDetectedTime = Date.now();
            }
        }
    }

    private onEquip(event: EquipEvent) {
        if (!event.actor || !event.baseObj) {
            return;
        }

        if (event.actor.getFormID() !== playerFormId) {
            return;
        }

        const type = event.baseObj.getType();
        if (type !== FormType.Book && type !== FormType.Potion && type !== FormType.Ingredient) {
            // Trigger UpdateEquipment only for equips that are not spell tomes, potions, ingredients
            this.equipmentChanged = true;
            this.gmEqSettleAt = Date.now() + GM_EQ_SETTLE_MS; // and once more when the dressing has settled
            this.gmEquipCrumb("equip", event);
        }

        // GREYMARCH (2026-11-08, the owner: health "randomly drops by like 10, then goes back to normal" after eating something that heals): the game heals at
        // once; when its health report reached the server before the eat did, the server took the heal back as too much regeneration and gave it again a moment
        // later when the eat came. A potion, food or ingredient now holds the health report back a moment (as casting does), and its eat is sent reliably (lost,
        // the server never gave its heal or filled hunger).
        const eaten = type === FormType.Potion || type === FormType.Ingredient;
        if (eaten) {
            this.gmEatHoldUntil = Date.now() + 1500;
        }

        // Send OnEquip for any equips including spell tomes, potions, ingredients
        // Otherwise, the server won't trigger spell learn, potion drink, ingredient eat and Papyrus scripts
        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.OnEquip, baseId: event.baseObj.getFormID() },
            reliability: eaten ? "reliable" : "unreliable"
        });
    }

    private onUnequip(event: EquipEvent) {
        if (!event.actor || !event.baseObj) {
            return;
        }

        if (event.actor.getFormID() === playerFormId) {
            this.equipmentChanged = true;
            this.gmEqSettleAt = Date.now() + GM_EQ_SETTLE_MS;
            this.gmEquipCrumb("unequip", event);
        }
    }

    // GREYMARCH: TEST (2026-11-02, the owner: a player's character was re-dressed every few seconds in other games): each equip and unequip of this player,
    // what it was, to the breadcrumbs file (at most 300 lines a game), so the next file shows what keeps flipping
    private gmEquipCrumbsLeft = 300;
    private gmEquipCrumbStart = Date.now();
    private gmEquipCrumb(what: string, event: EquipEvent) {
        if (this.gmEquipCrumbsLeft-- <= 0) return;
        try {
            const b = event.baseObj;
            writeLogs("greymarch-crumbs", ((Date.now() - this.gmEquipCrumbStart) / 1000).toFixed(1) + "s my " + what + " " + (b.getFormID() >>> 0).toString(16) + " " + (b.getName() || "") + " (type " + b.getType() + ")");
        } catch (e) { /* the log only */ }
    }

    private onLoadGame() {
        // Currently only armor is equipped after relogging (see remoteServer.ts)
        // This hack forces sending /equipment without weapons/ back to the server
        this.sp.Utility.wait(3).then(() => (this.equipmentChanged = true));
    }

    private sendInputs() {
        const hosted =
            typeof this.sp.storage['hosted'] === typeof [] ? this.sp.storage['hosted'] : [];
        const targets = [undefined].concat(hosted as any);

        const modelSource = this.controller.lookupListener(RemoteServer);

        const world = modelSource.getWorldModel();

        targets.forEach((target) => {
            const targetFormModel = target ? this.getForm(target, world) : this.getForm(undefined, world);
            this.sendMovement(target, targetFormModel);
            this.sendAnimation(target);
            this.sendAppearance(target);
            this.sendEquipment(target);
            this.sendActorValuePercentage(target, targetFormModel);
        });
        this.sendHostAttempts();
    }

    private sendMovement(_refrId?: number, form?: FormModel) {
        const owner = this.getInputOwner(_refrId);
        if (!owner) {
          return;
        }

        const refrIdStr = `${_refrId}`;
        const sendMovementRateMs = 130;
        const now = Date.now();
        const last = this.lastSendMovementMoment.get(refrIdStr);
        if (!last || now - last > sendMovementRateMs) {
            const movement = getMovement(owner, form);
            // GREYMARCH: a player in a creature form shown as an NPC has a hidden person's body that never draws a weapon (bridge.ts SHAPE_NO_FISTS); while the creature
            // attacks, its combat stance goes out with the movement so every other game puts the creature it draws into it (some creatures attack only from it)
            if (owner.getFormID() === 0x14 && Number((this.sp.storage as any)["greymarchShapeCombatUntil"]) > now) movement.isWeapDrawn = true;
            const message: MessageWithRefrId<UpdateMovementMessage> = {
                t: MsgType.UpdateMovement,
                data: movement,
                _refrId
            };
            this.controller.emitter.emit("sendMessageWithRefrId", {
                message,
                reliability: "unreliable"
            });
            this.lastSendMovementMoment.set(refrIdStr, now);
        }
    }

    private sendActorValuePercentage(_refrId?: number, form?: FormModel) {
        const canSend = form && (form.isDead ?? false) === false;
        if (!canSend) {
          return;
        }

        const owner = this.getInputOwner(_refrId);
        if (!owner) {
          return;
        }

        const av = getActorValues(this.sp.Game.getPlayer() as Actor);
        const currentTime = Date.now();
        if (
            this.actorValuesNeedUpdate === false &&
            this.prevValues.health === av.health &&
            this.prevValues.stamina === av.stamina &&
            this.prevValues.magicka === av.magicka
        ) {
            return;
        }


        if (
            currentTime - this.prevActorValuesUpdateTime < 2000 &&
            this.actorValuesNeedUpdate === false
        ) {
            return;
        }

        // Delaying actor values update due to casting
        // TODO: use partial updates for actor values once server finally supports it
        // i.e. keep sending health and stamina during casting, but delay magicka update
        if (
            currentTime - this.prevCastingDetectedTime < 500 &&
            av.health > 0 // don't delay death actor value update
        ) {
            return;
        }

        // GREYMARCH: just ate or drank: the server hears of it first (onEquip)
        if (currentTime < this.gmEatHoldUntil && av.health > 0) {
            return;
        }

        const deathService = this.controller.lookupListener(DeathService);
        if (deathService.isBusy()) {
            logTrace(this, "Not sending actor values, death service is busy");
            return;
        }

        const message: MessageWithRefrId<ChangeValuesMessage> = {
            t: MsgType.ChangeValues,
            data: av,
            _refrId
        };
        this.controller.emitter.emit("sendMessageWithRefrId", {
            message,
            reliability: "unreliable"
        });
        this.actorValuesNeedUpdate = false;
        this.prevValues = av;
        this.prevActorValuesUpdateTime = currentTime;

    }

    private sendAnimation(_refrId?: number) {
        const owner = this.getInputOwner(_refrId);
        if (!owner) {
          return;
        }

        // Extermly important that it's a local id since AnimationSource depends on it
        const refrIdStr = owner.getFormID().toString(16);

        let animSource = this.playerAnimSource.get(refrIdStr);
        if (!animSource) {
            animSource = new AnimationSource(owner);
            this.playerAnimSource.set(refrIdStr, animSource);
        }
        const anim = animSource.getAnimation();

        const lastAnimationSent = this.lastAnimationSent.get(refrIdStr);
        if (
            !lastAnimationSent ||
            anim.numChanges !== lastAnimationSent.numChanges
        ) {
            // Drink potion anim from this mod https://www.nexusmods.com/skyrimspecialedition/mods/97660
            if (anim.animEventName !== '' && !anim.animEventName.startsWith("DrinkPotion_")) {
                this.lastAnimationSent.set(refrIdStr, anim);
                this.updateActorValuesAfterAnimation(anim.animEventName);
                const message: MessageWithRefrId<UpdateAnimationMessage> = {
                    t: MsgType.UpdateAnimation,
                    data: anim,
                    _refrId
                };
                this.controller.emitter.emit("sendMessageWithRefrId", {
                    message,
                    reliability: "unreliable"
                });
            }
        }
    }

    private sendAppearance(_refrId?: number) {
        if (_refrId) {
          return;
        }
        const shown = this.sp.Ui.isMenuOpen('RaceSex Menu');
        if (shown != this.isRaceSexMenuShown) {
            this.isRaceSexMenuShown = shown;
            if (!shown) {
                this.sp.printConsole('Exited from race menu');

                const appearance = getAppearance(this.sp.Game.getPlayer() as Actor);
                // TODO: log appearance contents to debug appearance issues?
                const message: MessageWithRefrId<UpdateAppearanceMessage> = {
                    t: MsgType.UpdateAppearance,
                    data: appearance,
                    _refrId
                };
                this.controller.emitter.emit("sendMessageWithRefrId", {
                    message,
                    reliability: "reliable"
                });
            }
        }
    }

    private sendEquipment(_refrId?: number) {
        if (_refrId) {
          return;
        }
        // GREYMARCH: SENT AGAIN ONCE SETTLED (2026-11-11, the owner: "people spawn in wearing armor on their screens and on others they are naked; they have to
        // unequip and reequip for everyone to see it"): at a spawn the game strips and re-dresses the body in a burst (the breadcrumbs: unequip everything, equip it,
        // unequip, equip again within 0.6 s), and an equip event can come before its piece counts as worn, so the last report could read the body half dressed or
        // naked; the server kept that and nothing sent it again until a re-equip. Now GM_EQ_SETTLE_MS after the last equip or unequip the gear is sent once more, as
        // the body really wears it (other games take an unchanged report as seen: no re-dress)
        if (this.gmEqSettleAt && Date.now() >= this.gmEqSettleAt) {
            this.gmEqSettleAt = 0;
            this.equipmentChanged = true;
            try { writeLogs("greymarch-crumbs", ((Date.now() - this.gmEquipCrumbStart) / 1000).toFixed(1) + "s my gear sent again, settled"); } catch (e) { /* the log only */ }
        }
        if (this.equipmentChanged) {
            this.equipmentChanged = false;

            ++this.numEquipmentChanges;

            const eq = getEquipment(
                this.sp.Game.getPlayer() as Actor,
                this.numEquipmentChanges,
            );
            const message: MessageWithRefrId<UpdateEquipmentMessage> = {
                t: MsgType.UpdateEquipment,
                data: eq,
                _refrId
            };

            this.controller.emitter.emit("sendMessageWithRefrId", {
                message,
                reliability: "reliable"
            });
        }
    }

    private sendHostAttempts() {
        const remoteId = nextHostAttempt();
        if (!remoteId) {
          return;
        }
        // GREYMARCH: a game in staff god mode never runs an NPC's AI (greymarch/bridge.ts sets greymarchNoHost): the NPC would ignore the ghost and every
        // other player, standing still for all of them (a GM in a dungeon, 2026-10-22). Another game nearby hosts it instead.
        if ((this.sp.storage as any)["greymarchNoHost"] === true) {
          return;
        }

        this.controller.emitter.emit("sendMessage", {
            message: {
                t: MsgType.Host,
                remoteId
            },
            reliability: "unreliable"
        });
    }

    private getInputOwner(_refrId?: number) {
        return _refrId
            ? this.sp.Actor.from(this.sp.Game.getFormEx(worldViewMisc.remoteIdToLocalId(_refrId)))
            : this.sp.Game.getPlayer();
    }

    private getForm(refrId: number | undefined, world: WorldModel): FormModel | undefined {
        const form = refrId
            ? world?.forms.find((f) => f?.refrId === refrId)
            : world.forms[world.playerCharacterFormIdx];
        return form;
    }

    private updateActorValuesAfterAnimation(animName: string) {
        if (
            animName === 'JumpLand' ||
            animName === 'JumpLandDirectional' ||
            animName === 'DeathAnim'
        ) {
            this.actorValuesNeedUpdate = true;
        }
    }

    private get singlePlayerService() {
        return this.controller.lookupListener(SinglePlayerService);
    }

    private lastSendMovementMoment = new Map<string, number>();
    private playerAnimSource = new Map<string, AnimationSource>(); // TODO: make service
    private lastAnimationSent = new Map<string, Animation>();
    private actorValuesNeedUpdate = false;
    private isRaceSexMenuShown = false;
    private equipmentChanged = false;
    private gmEqSettleAt = 0; // GREYMARCH: when to send the gear once more, settled (0: not due)
    private numEquipmentChanges = 0;
    private prevValues: ActorValues = { health: 0, stamina: 0, magicka: 0 };
    private prevActorValuesUpdateTime = 0;
    private prevCastingDetectedTime = 0;
    private gmEatHoldUntil = 0;
}
