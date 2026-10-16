// TODO: refactor this out
import { localIdToRemoteId, remoteIdToLocalId } from "../../view/worldViewMisc";

// @ts-expect-error (TODO: Remove in 2.10.0)
import { SpellCastEvent, Actor, printConsole, Game, getAnimationVariablesFromActor, ActorAnimationVariables, SpellType, SlotType, EquippedItemType } from 'skyrimPlatform'
import { ClientListener, CombinedController, Sp } from './clientListener';
import { logTrace } from '../../logging';

import { MsgType } from "../../messages";
import { SpellCastMsgData, SpellCastMessage } from "../messages/spellCastMessage";
import { UpdateAnimVariablesMessageMsgData } from "../messages/updateAnimVariablesMessage";

export class MagicSyncService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.on("update", () => this.onUpdate());
        this.controller.on("spellCast", (e) => this.onSpellCast(e));

        const self = this;


        this.sp.hooks.sendAnimationEvent.add({
            enter: (ctx) => { },
            leave: (ctx) => {
                self.onSendAnimationEventLeave(ctx);
            }
        }, this.playerId, this.playerId);
    }

    private onUpdate() {
        this.checkActiveCasts();

        if (this.isAnyMagicStuffEquiped() === false) {
            return;
        }

        if (Date.now() - this.lastSendUpdateAnimationVariables <= this.sendUpdateAnimationVariablesRateMs) {
            return;
        }

        this.lastSendUpdateAnimationVariables = Date.now();

        this.controller.once('update', () => {
            const ac = Game.getPlayer();

            if (!ac) {
                return;
            }

            const animVariables = this.getAnimationVariablesFromActorConverted(ac.getFormID());

            this.controller.emitter.emit("sendMessage", {
                message: { t: MsgType.UpdateAnimVariables, data: this.getUpdateAnimVariablesEventData(ac, animVariables) },
                reliability: "reliable"
            });
        });

    }

    private onSpellCast(event: SpellCastEvent) {
        const isInterruptCast = false;

        const msg: SpellCastMsgData = this.getSpellCastEventData(event, isInterruptCast);

        // GREYMARCH: a new cast from the same hand ends the one before it in everyone else's game
        const key = this.castKey(msg);
        if (this.activeCasts.has(key)) {
            this.sendInterrupt(key);
        }

        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.SpellCast, data: msg },
            reliability: "reliable"
        });

        this.activeCasts.set(key, { msg, startedAt: Date.now(), sawCasting: false });
    }

    private onSendAnimationEventLeave(ctx: { animEventName: string, animationSucceeded: boolean }) {

        if (this.activeCasts.size === 0 || !this.isInteraptSpellCastAnim(ctx.animEventName)) {
            return;
        }

        this.controller.once('update', () => {
            for (const key of Array.from(this.activeCasts.keys())) {
                this.sendInterrupt(key);
            }
        });

    }

    // GREYMARCH: the end of a cast. The game does not always send the "equipped" animation event the stop used to wait for (letting go of
    // a concentration spell like Flames often went unseen), and then the caster kept shooting fire in everyone else's game, hurting whoever
    // stood in it. So each frame the casting actor's own "is casting" animation variable for that hand is read as well: once it is off
    // (after it was seen on, or 400 ms after the cast when it never was), the end is sent. Leaving the hand without the spell does the same.
    private checkActiveCasts() {
        if (this.activeCasts.size === 0) {
            return;
        }

        const now = Date.now();

        for (const [key, cast] of Array.from(this.activeCasts.entries())) {
            const casting = this.isStillCasting(cast.msg);
            if (casting === true) {
                cast.sawCasting = true;
                continue;
            }
            if (casting === false && !cast.sawCasting && now - cast.startedAt < this.castNeverSeenMs) {
                continue;
            }
            this.sendInterrupt(key);
        }
    }

    // true / false, or null when the caster is gone (then the cast is ended too)
    private isStillCasting(msg: SpellCastMsgData): boolean | null {
        const ac = Actor.from(Game.getFormEx(remoteIdToLocalId(msg.caster)));
        if (!ac) {
            return null;
        }

        if (msg.castingSource === SpellType.Left || msg.castingSource === SpellType.Right) {
            const equipped = ac.getEquippedSpell(msg.castingSource);
            if (equipped && equipped.getFormID() !== msg.spell) {
                return false;
            }
        }

        try {
            if (msg.isDualCasting && ac.getAnimationVariableBool("IsCastingDual")) {
                return true;
            }
            if (msg.castingSource === SpellType.Left) {
                return ac.getAnimationVariableBool("IsCastingLeft");
            }
            if (msg.castingSource === SpellType.Right) {
                return ac.getAnimationVariableBool("IsCastingRight");
            }
            return ac.getAnimationVariableBool("IsCastingLeft") || ac.getAnimationVariableBool("IsCastingRight");
        } catch (e) {
            return false;
        }
    }

    private sendInterrupt(key: string) {
        const cast = this.activeCasts.get(key);
        this.activeCasts.delete(key);
        if (!cast) {
            return;
        }

        const msg: SpellCastMsgData = { ...cast.msg, interruptCast: true };
        try {
            msg.actorAnimationVariables = this.getAnimationVariablesFromActorConverted(remoteIdToLocalId(cast.msg.caster));
        } catch (e) {
            // the caster is gone: the last known variables go with the end of the cast
        }

        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.SpellCast, data: msg },
            reliability: "reliable"
        });
    }

    private castKey(msg: SpellCastMsgData): string {
        return `${msg.caster}:${msg.castingSource}`;
    }

    private getSpellCastEventData(e: SpellCastEvent, isInterruptCast: boolean): SpellCastMsgData {
        const spellCastData: SpellCastMsgData = {
            caster: localIdToRemoteId(e.caster.getFormID(), true),
            // @ts-expect-error (TODO: Remove in 2.10.0)
            target: e.target ? localIdToRemoteId(e.target.getFormID(), true) : 0,
            spell: e.spell ? e.spell.getFormID() : 0,
            interruptCast: isInterruptCast,
            // @ts-expect-error (TODO: Remove in 2.10.0)
            isDualCasting: e.isDualCasting,
            // @ts-expect-error (TODO: Remove in 2.10.0)
            castingSource: e.castingSource,
            // @ts-expect-error (TODO: Remove in 2.10.0)
            aimAngle: e.aimAngle,
            // @ts-expect-error (TODO: Remove in 2.10.0)
            aimHeading: e.aimHeading,
            actorAnimationVariables: this.getAnimationVariablesFromActorConverted(e.caster.getFormID()),
        }
        return spellCastData;
    }

    private getAnimationVariablesFromActorConverted(actorId: number) {
        const animVars = getAnimationVariablesFromActor(actorId);
        const booleans: ArrayBuffer = animVars.booleans;
        const floats: ArrayBuffer = animVars.floats;
        const integers: ArrayBuffer = animVars.integers;
        return {
            booleans: Array.from(new Uint8Array(booleans)),
            floats: Array.from(new Uint8Array(floats)),
            integers: Array.from(new Uint8Array(integers)),
        }
    }

    private getUpdateAnimVariablesEventData(ac: Actor, animVariables: ActorAnimationVariables): UpdateAnimVariablesMessageMsgData {
        const animVarsData: UpdateAnimVariablesMessageMsgData = {
            actorRemoteId: localIdToRemoteId(ac.getFormID(), true),
            actorAnimationVariables: animVariables,
        }
        return animVarsData;
    }

    private isInteraptSpellCastAnim(animEventName: string): boolean {
        const eventName = animEventName.toLowerCase();
        return eventName === "mlh_equipped_event" || eventName === "mrh_equipped_event";
    };

    private isSpellCastAnim(animEventName: string): boolean {
        const eventName = animEventName.toLowerCase();

        const isSpellCastAnimForLeftHand = eventName === "mlh_spellaimedconcentrationstart" || eventName === "mlh_spellaimedstart" || eventName === "mlh_spellready_event" ||
            eventName === "mlh_spellrelease_event" || eventName === "mlh_equipped_event";

        const isSpellCastAnimForRightHand = eventName === "mrh_spellaimedconcentrationstart" || eventName === "mrh_spellaimedstart" || eventName === "mrh_spellready_event" ||
            eventName === "mrh_spellrelease_event" || eventName === "mrh_equipped_event";

        return isSpellCastAnimForLeftHand || isSpellCastAnimForRightHand;
    };

    private isAnyMagicStuffEquiped(): boolean {
        const ac = Game.getPlayer();

        if (!ac) {
            return false;
        }

        if (ac.getEquippedSpell(SpellType.Left) || ac.getEquippedSpell(SpellType.Right)) {
            return true;
        }

        if (ac.getEquippedSpell(SpellType.Voise) || ac.getEquippedSpell(SpellType.Instant)) {
            return true;
        }

        const leftHandEquipmentType = ac.getEquippedItemType(SlotType.Left);
        const rightHandEquipmentType = ac.getEquippedItemType(SlotType.Right);

        if (leftHandEquipmentType === 9 || leftHandEquipmentType === EquippedItemType.Staff ||
            rightHandEquipmentType === 9 || rightHandEquipmentType === EquippedItemType.Staff) {
            return true;
        }

        return false;
    }

    private playerId = 0x14;
    private sendUpdateAnimationVariablesRateMs = 500;
    private activeCasts = new Map<string, { msg: SpellCastMsgData, startedAt: number, sawCasting: boolean }>();
    private readonly castNeverSeenMs = 400;
    private lastSendUpdateAnimationVariables: number = 0;
}
