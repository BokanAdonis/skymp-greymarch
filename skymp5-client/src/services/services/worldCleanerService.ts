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

  // GREYMARCH: SEVERAL PICKS A FRAME (2026-11-08, the owner: "I am getting NPCs popping up in whiterun still", his own game with the fixed client; the log had
  // only cows, chickens, rabbits, mudcrabs and players from the server, so the NPCs seen were the game's own farmers and townsfolk waiting their turn). The
  // cleaner looked at ONE random actor a frame, and every pick that landed on a server creature, another player's character, a body or one already disabled
  // was a lost frame; with the server's wildlife and herds around a town most picks were lost and a farmer could stand there for many seconds. Up to 24
  // picks a frame now, stopping after 4 actors acted on; the 1 s wait before a delete stays (the crash fix), and one waiting for its delete is not picked again.
  private onUpdate() {
    for (let i = 0, acted = 0; i < 24 && acted < 4; ++i) {
      const r = this.processOneActor();
      if (r === null) { this.stats.none++; break; }
      if (r) ++acted;
    }
    this.sweepCell();
  }

  // GREYMARCH: THE CELL SWEPT TOO, AND WHAT IS LEFT WRITTEN DOWN (2026-11-08, the owner: "I'm seeing A LOT of NPCs still, No base game NPCs should bleed
  // through", with the faster picks). The random pick only finds actors the game is processing up close, so every 2 s every NPC placed in the player's own
  // cell is looked at too and cleaned the same way. Each sweep that finds one still standing writes it to greymarch-logs.txt ("cleaner:"), with why it was
  // left or that it was cleaned now, and the pick totals, so the next report says which NPCs survive and why (at most LOG_LINES lines a session).
  private sweepCell() {
    const now = Date.now();
    if (now - this.sweptAt < 2000) return;
    this.sweptAt = now;
    const pc = this.sp.Game.getPlayer();
    if (!pc) return;
    let cell: any = null, n = 0;
    try { cell = pc.getParentCell(); n = cell ? Math.min(cell.getNumRefs(62), 600) : 0; } catch (e) { return; } // 62: placed characters
    const seen: string[] = [];
    let found = 0;
    for (let i = 0; i < n; ++i) {
      let ac: Actor | null = null;
      try { ac = this.sp.Actor.from(cell.getNthRef(i, 62)); } catch (e) { ac = null; }
      if (!ac) continue;
      let id = 0, disabled = true;
      try { id = ac.getFormID() >>> 0; disabled = ac.isDisabled(); } catch (e) { continue; }
      if (id === 0x14 || disabled || this.pending.has(id)) continue;
      found++;
      let why = "";
      if ((this.protection.get(id) || 0) > 0) why = "kept (the server's)";
      else if (ac.isDead() && id < 0xff000000) why = "kept (a placed body)";
      else { const r = this.consider(ac); why = r ? "cleaned now" : "left"; if (r) this.stats.swept++; }
      if (seen.length < 6) { let name = ""; try { name = ac.getDisplayName() || (ac.getBaseObject() ? (ac.getBaseObject() as any).getName() : ""); } catch (e) { name = ""; } seen.push(id.toString(16) + " " + name + ": " + why); }
    }
    if (found && this.logsLeft > 0) {
      this.logsLeft--;
      try { this.sp.writeLogs("greymarch", "[" + new Date().toISOString().substr(11, 12) + "] cleaner: cell " + ((cell.getFormID() >>> 0).toString(16)) + " has " + found + " NPCs up of " + n + " placed: " + seen.join("; ") + " | picks: " + this.stats.picks + " (none " + this.stats.none + ", the server's " + this.stats.prot + ", off " + this.stats.off + ", cleaned " + this.stats.cleaned + "), cleaned by the sweep " + this.stats.swept); } catch (e) { /* no log */ }
    }
  }

  // null: no actor near; false: looked at, nothing to do; true: acted on
  private processOneActor(): boolean | null {
    const pc = this.sp.Game.getPlayer();
    if (pc === null) {
      return null;
    }

    const actor = this.sp.Game.findRandomActor(
      pc.getPositionX(),
      pc.getPositionY(),
      pc.getPositionZ(),
      8192
    );
    if (actor === null) {
      return null;
    }
    this.stats.picks++;
    const r = this.consider(actor);
    if (r) this.stats.cleaned++;
    return r;
  }

  private consider(actor: Actor): boolean {
    const actorId = actor.getFormID();

    const currentProtection = this.protection.get(actorId) || 0;
    if (currentProtection > 0) {
      this.stats.prot++;
      return false;
    }

    if (actorId === 0x14 || this.pending.has(actorId) || actor.isDisabled() || actor.isDeleted()) {
      this.stats.off++;
      return false;
    }

    if (this.isActorInDialogue(actor)) {
      // Deleting actor in dialogue crashes Skyrim
      // https://github.com/skyrim-multiplayer/issue-tracker/issues/13
      actor.setPosition(0, 0, 0);
      actor.disableNoWait(true); // Seems to not crash
      return true;
    }

    // Keep vanila pre-placed bodies, but delete player bodies
    if (actor.isDead() && actorId < 0xff000000) {
      actor.blockActivation(true);
      return false;
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
            return false;
          }
          logTrace(this, `Deleting chicken anomaly`, actorId.toString(16));
          actor.killSilent(null);
          actor.blockActivation(true);
          actor.disableNoWait(false);
          actor.setAlpha(0, false);
          return true;
        }
      }
    }

    // GREYMARCH: STOPPED BEFORE IT GOES, DELETED A SECOND LATER (2026-11-07, a player's crash 25 s after loading in: a Bandit Hedge Wizard of BSHeartland,
    // deleted and in no cell, read by the movement code, MovementControllerNPC / IMovementMessageInterface). The cleaner disabled a hostile NPC already on
    // its way to the player and deleted it a frame later, its movement still being worked on: now its combat and moves are stopped first and the delete
    // waits a second after the disable.
    // EVERY NPC IS STILL DELETED, PLACED ONES TOO (2026-11-08, the owner: "NPCs have started bleeding through into the game", guards and farmers seen on
    // live; a player's screenshot of Markarth's guards on the stairs): for a few hours placed NPCs were only disabled and their AI switched off first,
    // and a disabled-only NPC is not always gone (SkyMP's cleaner deletes because some actors keep their 3D after Disable, the chicken anomaly above), and
    // the cleaner skips an NPC once it reads as disabled, so those stayed for good. The AI is not switched off here (a disable is not held back by it).
    try { actor.stopCombat(); } catch (e) { /* not fighting */ }
    try { actor.stopTranslation(); actor.clearKeepOffsetFromActor(); } catch (e) { /* not moving */ }
    this.pending.add(actorId);
    actor.disable(false).then(() => {
      return this.sp.Utility.wait(1).then(() => {
        this.pending.delete(actorId);
        const ac = this.sp.Actor.from(this.sp.Game.getFormEx(actorId));
        if (!ac || this.isActorInDialogue(ac) || !ac.isDisabled()) {
          return;
        }
        ac.delete();
      });
    }).catch(() => { this.pending.delete(actorId); });
    return true;
  }

  private isActorInDialogue(ac: Actor) {
    return ac.isInDialogueWithPlayer() || ac.getDialogueTarget() !== null;
  }

  private protection = new Map<number, number>();
  private pending = new Set<number>(); // disabled, its delete still to come
  private sweptAt = 0;
  private logsLeft = 60;
  private stats = { picks: 0, none: 0, prot: 0, off: 0, cleaned: 0, swept: 0 };
  private initialPos?: NiPoint3;
  private initialCellOrWorld?: number;
}
