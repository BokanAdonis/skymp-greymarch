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

        // GREYMARCH: a cast of ANOTHER spell from the same hand ends the one before it in everyone else's game. The same spell again
        // (the game can report a held spell more than once) is sent as before, without an end in between.
        const key = this.castKey(msg);
        const open = this.activeCasts.get(key);
        if (open && open.msg.spell !== msg.spell) {
            this.sendInterrupt(key, "another spell cast from that hand");
        }

        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.SpellCast, data: msg },
            reliability: "reliable"
        });

        // every cast is remembered for a few seconds: an explosion that hits someone is reported as the spell it came from (hitService)
        this.recentCasts.unshift({ casterLocalId: event.caster.getFormID(), spell: msg.spell, at: Date.now() });
        this.recentCasts.length = Math.min(this.recentCasts.length, 8);

        if (open && open.msg.spell === msg.spell) {
            open.msg = msg;
            open.repeats++;
            open.lastSentAt = Date.now();
            return;
        }

        // GREYMARCH: only a held (concentration) spell stays open: it gets an end, and a reminder every second while it is held so other
        // games stop it by themselves when the reminders stop (a lost end can no longer leave fire burning). A fire-and-forget spell is
        // done once it is cast: nothing more is sent for it.
        if (!this.isConcentration(msg.spell)) {
            this.diag(`magic: cast ${msg.spell.toString(16)} hand ${msg.castingSource}${msg.isDualCasting ? " dual" : ""} by ${msg.caster.toString(16)} (fire and forget)`);
            return;
        }
        // the caster's id in THIS game (the player is 0x14 here; their server id does not map back to it)
        this.activeCasts.set(key, { msg, casterLocalId: event.caster.getFormID(), startedAt: Date.now(), lastSentAt: Date.now(), repeats: 0, varsSeen: {}, events: [] });
        this.diag(`magic: cast ${msg.spell.toString(16)} hand ${msg.castingSource}${msg.isDualCasting ? " dual" : ""} by ${msg.caster.toString(16)}`);
    }

    private onSendAnimationEventLeave(ctx: { animEventName: string, animationSucceeded: boolean }) {
        if (this.activeCasts.size === 0) {
            return;
        }

        // GREYMARCH: which animation events a cast goes through (for the server log, see diag)
        const lower = ctx.animEventName.toLowerCase();
        if (/spell|cast|equip|release|interrupt/.test(lower)) {
            const now = Date.now();
            for (const cast of Array.from(this.activeCasts.values())) {
                if (cast.events.length < 12) {
                    cast.events.push(`${ctx.animEventName}@${now - cast.startedAt}`);
                }
            }
        }

        if (!this.isInteraptSpellCastAnim(ctx.animEventName)) {
            return;
        }

        this.controller.once('update', () => {
            for (const key of Array.from(this.activeCasts.keys())) {
                this.sendInterrupt(key, ctx.animEventName);
            }
        });

    }

    // GREYMARCH: the end of a cast is sent on the "equipped" animation event (as upstream) or when the hand now holds another spell. Each
    // frame also notes when the caster's "is casting" animation variables are seen on and off; they go to the server log with the end, to
    // learn which signal really marks the end of a held spell like Flames (an earlier version ended casts on them and stopped every cast
    // in other players' games at once).
    private checkActiveCasts() {
        if (this.activeCasts.size === 0) {
            return;
        }

        const now = Date.now();

        for (const [key, cast] of Array.from(this.activeCasts.entries())) {
            const ac = Actor.from(Game.getFormEx(cast.casterLocalId));
            if (!ac) {
                this.sendInterrupt(key, "caster gone");
                continue;
            }

            if (cast.msg.castingSource === SpellType.Left || cast.msg.castingSource === SpellType.Right) {
                const equipped = ac.getEquippedSpell(cast.msg.castingSource);
                if (equipped && equipped.getFormID() !== cast.msg.spell) {
                    this.sendInterrupt(key, "another spell in that hand");
                    continue;
                }
            }

            if (now - cast.lastSentAt >= this.keepaliveMs) {
                cast.lastSentAt = now;
                const again: SpellCastMsgData = { ...cast.msg, interruptCast: false };
                try { again.actorAnimationVariables = this.getAnimationVariablesFromActorConverted(cast.casterLocalId); } catch (e) { /* keep the last ones */ }
                this.controller.emitter.emit("sendMessage", { message: { t: MsgType.SpellCast, data: again }, reliability: "reliable" });
            }

            for (const name of this.castVars) {
                let on = false;
                try { on = ac.getAnimationVariableBool(name); } catch (e) { continue; }
                const seen = cast.varsSeen[name] || (cast.varsSeen[name] = { on: -1, off: -1, was: false });
                if (on && !seen.was && seen.on < 0) seen.on = now - cast.startedAt;
                if (!on && seen.was && seen.off < 0) seen.off = now - cast.startedAt;
                seen.was = on;
            }
        }
    }

    private sendInterrupt(key: string, reason: string) {
        const cast = this.activeCasts.get(key);
        this.activeCasts.delete(key);
        if (!cast) {
            return;
        }

        const msg: SpellCastMsgData = { ...cast.msg, interruptCast: true };
        try {
            msg.actorAnimationVariables = this.getAnimationVariablesFromActorConverted(cast.casterLocalId);
        } catch (e) {
            // the caster is gone: the last known variables go with the end of the cast
        }

        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.SpellCast, data: msg },
            reliability: "reliable"
        });

        const vars = Object.keys(cast.varsSeen).map((n) => `${n} on@${cast.varsSeen[n].on} off@${cast.varsSeen[n].off}`).join(", ");
        this.diag(`magic: end ${cast.msg.spell.toString(16)} hand ${cast.msg.castingSource} after ${Date.now() - cast.startedAt} ms (${reason}); repeats ${cast.repeats}; ${vars}; events ${cast.events.join(" ")}`);
    }

    // a few lines per session to the server log ("[client N] magic: ..."), never more than diagLeft
    private diag(text: string) {
        if (this.diagLeft <= 0) {
            return;
        }
        this.diagLeft--;
        try { (this.controller.emitter as any).emit("greymarchStage", text); } catch (e) { /* diagnostics never break the game */ }
    }

    // a held spell: its first effect is cast by concentration (2)
    private isConcentration(spellId: number): boolean {
        try {
            const spell = this.sp.Spell.from(Game.getFormEx(spellId));
            const effect = spell ? spell.getNthEffectMagicEffect(0) : null;
            return !!effect && effect.getCastingType() === 2;
        } catch (e) {
            return true; // unknown: treat it as held, so it still gets an end
        }
    }

    // the spell a recent cast of this caster (within 5 s) that explodes into this explosion
    public findSpellForExplosion(casterLocalId: number, explosionId: number): number {
        const now = Date.now();
        for (const cast of this.recentCasts) {
            if (cast.casterLocalId !== casterLocalId || now - cast.at > 5000) continue;
            try {
                const spell = this.sp.Spell.from(Game.getFormEx(cast.spell));
                const n = spell ? spell.getNumEffects() : 0;
                for (let i = 0; i < n; i++) {
                    const explosion = spell!.getNthEffectMagicEffect(i)?.getExplosion();
                    if (explosion && explosion.getFormID() === explosionId) return cast.spell;
                }
            } catch (e) { /* next cast */ }
        }
        return 0;
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
    private activeCasts = new Map<string, { msg: SpellCastMsgData, casterLocalId: number, startedAt: number, lastSentAt: number, repeats: number, varsSeen: Record<string, { on: number, off: number, was: boolean }>, events: string[] }>();
    private readonly castVars = ["IsCastingRight", "IsCastingLeft", "IsCastingDual", "bWantCastRight", "bWantCastLeft"];
    private diagLeft = 40;
    private readonly keepaliveMs = 1000;
    private recentCasts: { casterLocalId: number, spell: number, at: number }[] = [];
    private lastSendUpdateAnimationVariables: number = 0;
}
