// TODO: refactor this out
import { localIdToRemoteId } from "../../view/worldViewMisc";

import { FormType, HitEvent, storage } from "skyrimPlatform";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import { MsgType } from "../../messages";
import { Hit } from "../messages/hitMessage";
import { MagicSyncService } from "./magicSyncService";

export class HitService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        controller.on('hit', (e) => this.onHit(e));
    }

    private onHit(e: HitEvent) {
        const why = this.onHitInner(e);
        this.diag(e, why);
    }

    // GREYMARCH: the first hits this game sees that involve the player go to the server log ("[client N] hit: ..."): who hit what with
    // which source and projectile, and whether it was sent to the server or why not. Hits ON the player by another player's copy are
    // logged too (with the player's health), to see whether that copy's spell also hurts here on top of the server's damage.
    private diag(e: HitEvent, why: string) {
        try {
            const aggressor = e.aggressor ? e.aggressor.getFormID() : 0;
            const target = e.target ? e.target.getFormID() : 0;
            if (aggressor !== 0x14 && target !== 0x14) return;
            if (this.diagLeft <= 0 || why.indexOf("within 100 ms") >= 0) return; // a held spell repeats its hit many times a second
            this.diagLeft--;
            const hex = (n: number) => (n >>> 0).toString(16);
            let health = "";
            if (target === 0x14) {
                const pl = this.sp.Game.getPlayer();
                if (pl) health = ` (my health ${Math.round(pl.getActorValue("Health"))})`;
            }
            const text = `hit: ${hex(aggressor)} -> ${hex(target)} source ${e.source ? hex(e.source.getFormID()) : "none"} projectile ${e.projectile ? hex(e.projectile.getFormID()) : "none"}: ${why}${health}`;
            (this.controller.emitter as any).emit("greymarchStage", text);
        } catch (err) { /* diagnostics never break the game */ }
    }

    private diagLeft = 60;

    private onHitInner(e: HitEvent): string {
        const aggressor = e.aggressor.getFormID();
        if (aggressor < 0xff000000 && aggressor !== 0x14) return "skipped: the attacker is not a player or a SkyMP actor"; // all skymp npcs are FF+
        if (aggressor === 0x14 && storage["greymarchShapeOn"] === true) return "skipped: creature form"; // GREYMARCH: a creature form (staff); the server decides its hits (gamemode shapeshift.js), so the game's own are not reported

        if (aggressor >= 0xff000000) {
            // TODO: make host service
            const hosted = storage['hosted'];
            let alreadyHosted = false;
            if (Array.isArray(hosted)) {
                const remoteId = localIdToRemoteId(aggressor);
                if (hosted.includes(remoteId) || hosted.includes(remoteId + 0x100000000)) {
                    alreadyHosted = true;
                }
            }

            if (!alreadyHosted) {
              return "skipped: another player's copy (their own game reports it)";
            }
        }

        const base = e.target.getBaseObject();
        const type = base?.getType();

        if (type === FormType.Static || type === FormType.MovableStatic) {
            return "skipped: the target is a static";
        }

        const isWeapon = this.sp.Weapon.from(e.source);
        const isSpell = !isWeapon && this.sp.Spell.from(e.source);
        const isScroll = !isWeapon && !isSpell && this.sp.Scroll.from(e.source);

        // GREYMARCH: an area spell's blast (Incinerate, Fireball, Lightning Storm) hits with its EXPLOSION as the source: reported as the
        // spell it came from (a cast of this attacker in the last 5 s whose effect explodes into it), so area damage reaches the server
        let source = e.source ? e.source.getFormID() : 0;
        let fromExplosion = false;
        if (!isWeapon && !isSpell && !isScroll) {
            const isExplosion = !!e.source && e.source.getType() === FormType.Explosion;
            const spell = isExplosion ? this.controller.lookupListener(MagicSyncService).findSpellForExplosion(aggressor, source) : 0;
            if (!spell) {
                return isExplosion ? "skipped: an explosion of no recent cast" : "skipped: the source is not a weapon, spell or scroll";
            }
            source = spell;
            fromExplosion = true;
        }

        // prevent double hit that happens for some reason with magic projectiles
        // GREYMARCH: per attacker, target and spell (it was per attacker: an area spell then counted only the first of the targets it hit)
        if (isSpell || isScroll || fromExplosion) {
            const key = `${aggressor}:${e.target.getFormID()}:${source}`;
            const now = Date.now();

            const lastHitTime = this.recentMagicHits.get(key);
            if (lastHitTime && now - lastHitTime < 100) {
                return "skipped: within 100 ms of this attacker's last magic hit";
            }

            this.recentMagicHits.set(key, now);
            if (this.recentMagicHits.size > 256) {
                for (const [k, at] of Array.from(this.recentMagicHits.entries())) if (now - at > 1000) this.recentMagicHits.delete(k);
            }
        }

        this.controller.emitter.emit("sendMessage", {
            message: { t: MsgType.OnHit, data: { ...this.getHitData(e), source } },
            reliability: "reliable"
        });
        return fromExplosion ? `sent to the server as spell ${source.toString(16)}` : "sent to the server";
    }

    private getHitData(e: HitEvent): Hit {
        const hitData: Hit = {
            aggressor: localIdToRemoteId(e.aggressor.getFormID()),
            isBashAttack: e.isBashAttack,
            isHitBlocked: e.isHitBlocked,
            isPowerAttack: e.isPowerAttack,
            isSneakAttack: e.isSneakAttack,
            projectile: e.projectile ? e.projectile.getFormID() : 0,
            source: e.source ? e.source.getFormID() : 0,
            target: localIdToRemoteId(e.target.getFormID())
        }
        return hitData;
    }

    private recentMagicHits: Map<string, number> = new Map();
}
