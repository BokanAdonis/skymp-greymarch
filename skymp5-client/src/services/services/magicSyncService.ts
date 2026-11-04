// TODO: refactor this out
import { localIdToRemoteId, remoteIdToLocalId } from "../../view/worldViewMisc";

// @ts-expect-error (TODO: Remove in 2.10.0)
import { SpellCastEvent, Actor, printConsole, Game, getAnimationVariablesFromActor, ActorAnimationVariables, SpellType, SlotType, EquippedItemType, storage } from 'skyrimPlatform'
import { ClientListener, CombinedController, Sp } from './clientListener';
import { logTrace } from '../../logging';

import { MsgType } from "../../messages";
import { SpellCastMsgData, SpellCastMessage } from "../messages/spellCastMessage";
import { UpdateAnimVariablesMessageMsgData } from "../messages/updateAnimVariablesMessage";
import { sanitizeAim, sanitizeAimFloats, lookFromAngles } from "./spellAim";

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
        this.checkStaffFire();

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

        // GREYMARCH (2026-10-30, a crash: Howling Blast ended, and with it the Frostbite of every NPC this game runs): these are the PLAYER's animation
        // events (the hook is the player's only), so they end the player's own casts only. An NPC's cast ends by its own checks (checkActiveCasts)
        this.controller.once('update', () => {
            for (const [key, cast] of Array.from(this.activeCasts.entries())) {
                if (cast.casterLocalId !== this.playerId) continue;
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

    // GREYMARCH: A STAFF FIRED (2026-11-03, the owner: "people see me do the animation but they dont see the magic come out"). The game raises no spell
    // cast event for a staff (the log: never a "magic: cast" line for one), so nothing was sent. Every 50 ms the charge of an enchanted staff in each hand
    // is read (SKSE WornObject); when it drops, the staff fired: a cast of its enchantment is sent like a spell's (the server passes it on when the caster
    // holds that staff, and the other games cast it from the copy: GreymarchCam.CastStaff). A held staff (Flames, Sparks ...) is sent again every second while
    // the charge keeps dropping, and its end once it stops for 0.7 s. A charge the server put back (bridge greymarchStaffChargeTick: storage
    // greymarchStaffChargeSetAt) is not a cast.
    private staffLast: Record<number, { base: number, charge: number, ench: number, held: boolean, firing: boolean, lastDropAt: number, lastSentAt: number }> = {};
    private staffNextAt = 0;
    private checkStaffFire() {
        const now = Date.now();
        if (now < this.staffNextAt) return;
        this.staffNextAt = now + 50;
        const me = Game.getPlayer();
        if (!me) return;
        for (const hand of [0, 1]) {
            let w: any = null;
            try { w = me.getEquippedWeapon(hand === 0); } catch (e) { w = null; }
            let ench: any = null;
            try { ench = w && w.getWeaponType() === 8 ? w.getEnchantment() : null; } catch (e) { ench = null; }
            if (!w || !ench) { this.staffEnd(hand, "staff put away"); delete this.staffLast[hand]; continue; }
            let charge = -1;
            try { charge = Number(this.sp.callNative("WornObject", "GetItemCharge", undefined, me, hand, 0)); } catch (e) { charge = -1; }
            if (!(charge >= 0) || !isFinite(charge)) continue;
            const base = w.getFormID() >>> 0;
            let st = this.staffLast[hand];
            if (!st || st.base !== base) {
                if (st) this.staffEnd(hand, "another staff");
                let held = false;
                try { const fx = ench.getNthEffectMagicEffect(0); held = !!fx && fx.getCastingType() === 2; } catch (e) { held = false; }
                this.staffLast[hand] = { base, charge, ench: ench.getFormID() >>> 0, held, firing: false, lastDropAt: 0, lastSentAt: 0 };
                continue;
            }
            const dropped = charge < st.charge - 0.01;
            st.charge = charge;
            const setBack = now - (Number(storage["greymarchStaffChargeSetAt"]) || 0) < 1500;
            if (dropped && !setBack) {
                st.lastDropAt = now;
                if (!st.held || !st.firing || now - st.lastSentAt >= 1000) {
                    st.lastSentAt = now;
                    this.staffSend(me, st.ench, hand, false);
                    if (!st.firing) this.diag(`magic: staff ${base.toString(16)} fired ${st.ench.toString(16)} hand ${hand}${st.held ? " (held)" : ""}`);
                }
                st.firing = st.held;
            } else if (st.firing && now - st.lastDropAt > 700) {
                this.staffEnd(hand, "the charge stopped dropping");
            }
        }
    }
    private staffEnd(hand: number, reason: string) {
        const st = this.staffLast[hand];
        if (!st || !st.firing) return;
        st.firing = false;
        const me = Game.getPlayer();
        if (me) this.staffSend(me, st.ench, hand, true);
        this.diag(`magic: staff end ${st.ench.toString(16)} hand ${hand} (${reason})`);
    }
    private staffSend(me: Actor, ench: number, hand: number, end: boolean) {
        let aimAngle = 0, aimHeading = 0;
        const look = this.getPlayerLook(me);
        if (look) { aimAngle = look.lookPitch; aimHeading = look.bodyHeading; }
        let vars: any = { booleans: [], floats: [], integers: [] };
        try { vars = this.getAnimationVariablesFromActorConverted(me.getFormID()); } catch (e) { /* none */ }
        const msg: SpellCastMsgData = { caster: localIdToRemoteId(me.getFormID(), true), target: 0, spell: ench, isDualCasting: false, interruptCast: end, castingSource: hand, aimAngle, aimHeading, actorAnimationVariables: vars };
        this.controller.emitter.emit("sendMessage", { message: { t: MsgType.SpellCast, data: msg }, reliability: "reliable" });
        if (!end) {
            this.recentCasts.unshift({ casterLocalId: me.getFormID(), spell: ench, at: Date.now() }); // its blast is reported as the enchantment (findSpellForExplosion)
            this.recentCasts.length = Math.min(this.recentCasts.length, 8);
        }
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

    // GREYMARCH (2026-10-30, a crash): did THIS game cast this spell from this caster (an NPC it runs) in the last ms? The server sends the cast back to
    // the game that runs the NPC too, and replaying it there launched a second projectile from the same hands (two Fireballs at once, point blank: the
    // game crashed in the projectile's animation)
    public castHere(casterLocalId: number, spell: number, ms: number): boolean {
        const now = Date.now();
        return this.recentCasts.some((c) => c.casterLocalId === casterLocalId && c.spell === spell && now - c.at <= ms);
    }

    // the spell a recent cast of this caster (within 5 s) that explodes into this explosion
    public findSpellForExplosion(casterLocalId: number, explosionId: number): number {
        const now = Date.now();
        for (const cast of this.recentCasts) {
            if (cast.casterLocalId !== casterLocalId || now - cast.at > 5000) continue;
            try {
                // a staff's cast names its enchantment (2026-11-03): its blast is reported as that enchantment (the server's staff damage, OnStaffHit)
                const form = Game.getFormEx(cast.spell);
                const spell: any = this.sp.Spell.from(form) || this.sp.Enchantment.from(form);
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

        // GREYMARCH: the player's aim is sent as where they look when the game's aim points far away from it (spellAim.ts)
        if (e.caster.getFormID() === this.playerId) {
            const look = this.getPlayerLook(e.caster);
            if (look) {
                const aim = sanitizeAim(spellCastData.aimAngle, spellCastData.aimHeading, look.lookPitch, look.bodyHeading);
                if (aim.fixed) {
                    this.aimDiag(`magic: aim of ${spellCastData.spell.toString(16)} replaced: game ${spellCastData.aimAngle.toFixed(2)}/${spellCastData.aimHeading.toFixed(2)}, look ${aim.aimAngle.toFixed(2)}/${aim.aimHeading.toFixed(2)} (rad)`);
                    spellCastData.aimAngle = aim.aimAngle;
                    spellCastData.aimHeading = aim.aimHeading;
                }
            }
        }
        return spellCastData;
    }

    // the player's pitch and heading in radians, or null when they cannot be read
    private getPlayerLook(ac: { getAngleX(): number, getAngleZ(): number }): { lookPitch: number, bodyHeading: number } | null {
        try {
            return lookFromAngles(ac.getAngleX(), ac.getAngleZ());
        } catch (e) {
            return null;
        }
    }

    // its own budget: the cast lines (diagLeft) are used up after 40 casts, and a replaced aim must still reach the log
    private aimDiag(text: string) {
        if (this.aimDiagLeft <= 0) {
            return;
        }
        this.aimDiagLeft--;
        try { (this.controller.emitter as any).emit("greymarchStage", text); } catch (e) { /* diagnostics never break the game */ }
    }

    private getAnimationVariablesFromActorConverted(actorId: number) {
        const animVars = getAnimationVariablesFromActor(actorId);
        const booleans: ArrayBuffer = animVars.booleans;
        const floats: ArrayBuffer = animVars.floats;
        const integers: ArrayBuffer = animVars.integers;
        let floatBytes = Array.from(new Uint8Array(floats));
        // GREYMARCH: the player's aim offsets go out as where they look when they point far away from it: a held spell is aimed from
        // them in other games (spellAim.ts)
        if (actorId === this.playerId) {
            const ac = Game.getPlayer();
            const look = ac ? this.getPlayerLook(ac) : null;
            if (look) {
                const res = sanitizeAimFloats(floatBytes, look.lookPitch);
                if (res.fixed) {
                    this.aimDiag(`magic: aim variables replaced: game pitch ${res.pitch.toFixed(2)} heading ${res.heading.toFixed(2)}, look pitch ${look.lookPitch.toFixed(2)} (rad)`);
                    floatBytes = res.bytes;
                }
            }
        }
        return {
            booleans: Array.from(new Uint8Array(booleans)),
            floats: floatBytes,
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
    private aimDiagLeft = 5;
    private readonly keepaliveMs = 1000;
    private recentCasts: { casterLocalId: number, spell: number, at: number }[] = [];
    private lastSendUpdateAnimationVariables: number = 0;
}
