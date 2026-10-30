import { Actor, ActorBase, HeadPart, Cell, Race, createText, Debug, destroyText, Form, FormType, Game, Keyword, NetImmerse, ObjectReference, once, printConsole, setTextColor, setTextPos, setTextSize, setTextString, storage, TESModPlatform, Utility, WorldSpace, worldPointToScreenPoint, writeLogs } from "skyrimPlatform";
import { setDefaultAnimsDisabled, applyAnimation, allowAttackAnim } from "../sync/animation";
const GM_PUPPET_MINE_FRESH_MS = 2500; // the server's word that an animal hunts this player holds this long (it repeats it at least once a second)
const GM_PUPPET_LOCAL_EVERY_MS = 100; // a hunting animal is moved here this often
const GM_PUPPET_REPORT_EVERY_MS = 200; // and its place reported this often
const GM_PUPPET_HOLD = 140; // in a fight it waits until the player is this far past its reach (the server's HOLD, wildlifebrain.js)
const GM_PUPPET_LUNGE_MS = 1100; // a server-driven animal's lunge: its animation moves it this long, not the frames (gmPuppetMove, 2026-10-28)
import { Appearance, applyAppearance } from "../sync/appearance";
import { isBadMenuShown, applyEquipment } from "../sync/equipment";
import { RespawnNeededError } from "../lib/errors";
import { MsgType } from "../messages";
const GM_GROUND_FIX_MS = 8000; // the server's word on where the ground is under an NPC holds this long (gmHostedTick)
const GM_GROUND_NEAR = 50; // within this of the ground under it, it is on it
const GM_GROUND_LIFT = 24; // set this far over the ground under it, so it never starts inside a slope
// the ground under (x, y) from the land the server sent with its word (5 x 5 heights, bilinear between them); the word's one height when there is none
// or (x, y) is off the grid
function gmGroundUnder(fix: any, x: number, y: number): number {
  const g = fix && fix.grid;
  if (!g) return fix.z;
  const fx = (x - g.x) / g.step + 2, fy = (y - g.y) / g.step + 2;
  if (!(fx >= 0 && fx <= 4 && fy >= 0 && fy <= 4)) return fix.z;
  const ix = Math.min(3, Math.floor(fx)), iy = Math.min(3, Math.floor(fy)), tx = fx - ix, ty = fy - iy;
  const at = (i: number, j: number) => g.h[j * 5 + i];
  const a = at(ix, iy), b2 = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
  if ([a, b2, c, d].some((v) => typeof v !== "number")) return fix.z;
  return a * (1 - tx) * (1 - ty) + b2 * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}
const GM_GROUND_SETTLE_MS = 900; // each step waits this long for the one before (one host check; 1.5 s until 2026-10-28: the owner, "they still float for a pretty long time")
// A STUCK RUNNER (gmHostedTick): checked this often; "running" above this Speed; not when this close to its target (it is fighting there); nudged at most this often
const GM_RUN_CHECK_MS = 1500;
const GM_RUN_SPEED = 150;
const GM_RUN_NEAR = 250;
const GM_RUN_NUDGE_MS = 8000;
// Skyrim's own reset of an actor's animation state (its graph goes back to standing, so the AI's next move starts a real run). It moves nothing and changes no gear
const GM_GRAPH_RESET = "IdleForceDefaultState";
// in a fight (DRESSED ONCE BY ITS HOST: an empty-handed NPC takes the server's gear, but not mid-fight)
function gmInCombat(ac: Actor): boolean { try { return ac.isInCombat(); } catch (e) { return true; } }
// A QUIVER (2026-10-28, the owner: the Skeleton archer had its bow on its back and never used it). The server sends an NPC's games only what it wears, and
// it puts the bow on but never the arrows (MpActor::EquipBestWeapon: the weapon only), so the archer came with no arrows and its AI would not shoot. The game
// that runs an NPC holding a bow or a crossbow with none of its ammunition gives it GM_QUIVER_COUNT, equipped: draugr arrows for a draugr bow, iron arrows
// for any other bow, steel bolts for a crossbow (Dawnguard)
const GM_QUIVER_COUNT = 40;
const GM_DRAUGR_BOWS = [0x302ca, 0x5d179];
function gmQuiver(ac: Actor): void {
  try {
    if (ac.getFormID() === 0x14) return;
    const w = ac.getEquippedWeapon(false) || ac.getEquippedWeapon(true);
    if (!w) return;
    const type = w.getWeaponType();
    if (type !== 7 && type !== 9) return; // a bow, a crossbow
    const ammo = type === 9 ? Game.getFormFromFile(0xbb3, "Dawnguard.esm") : GM_DRAUGR_BOWS.indexOf(w.getFormID()) >= 0 ? Game.getFormFromFile(0x34182, "Skyrim.esm") : Game.getFormFromFile(0x1397d, "Skyrim.esm");
    if (!ammo || ac.getItemCount(ammo) > 0) return;
    ac.addItem(ammo, GM_QUIVER_COUNT, true);
    ac.equipItem(ammo, false, true);
    gmCrumb("quiver " + gmHex(ac.getFormID()) + ": " + GM_QUIVER_COUNT + " of " + gmHex(ammo.getFormID()) + " for its " + (type === 9 ? "crossbow" : "bow") + " " + gmHex(w.getFormID()));
  } catch (e) { /* it fights without arrows */ }
}
// the gear puts a weapon in its hand (a weapon worn in it)
function gmGearArms(eq: any): boolean {
  try { return !!eq && !!eq.inv && Array.isArray(eq.inv.entries) && eq.inv.entries.some((e: any) => !!e && (e.worn || e.wornLeft) && (() => { const f = Game.getFormEx(e.baseId); return !!f && f.getType() === 41; })()); } catch (err) { return false; }
}
// dead here (a failed check counts as dead: the gear step is then skipped, never risked)
function gmIsDead(ac: Actor): boolean {
  try { return ac.isDead(); } catch (e) { return true; }
}
// a weapon in either hand (DRESSED ONCE BY ITS HOST: an NPC with empty hands still takes the server's gear)
function gmHoldsWeapon(ac: Actor): boolean {
  try { return !!ac.getEquippedWeapon(false) || !!ac.getEquippedWeapon(true); } catch (e) { return true; }
}
import { FormModel } from "./model";
import { applyMovement } from "../sync/movementApply";
import { Movement } from "../sync/movement";
import { SpawnProcess, gmAbandonedSpawns, gmSpawnedAtSpot } from "./spawnProcess";
import { BeastSwitchState, GM_STANDIN_RACE, beastDone, beastHeld, beastKept, beastSpawned, beastSwitchStep, isWereRace } from "./beastSwitch";
// GREYMARCH: is this look a werewolf's or werebear's (the stand-in path, beastSwitch.ts)? The werebear's race id is looked up once in this load order.
let gmWerebearRace = -1;
let gmWalkDiagNext = 0, gmWalkDiagLeft = 60; // the beast walk diagnostic (see update())
const gmWereLook = (ap: any, formRace: number): boolean => {
  if (!ap || (Array.isArray(ap.headpartIds) && ap.headpartIds.length > 0)) return false;
  if (gmWerebearRace < 0) { try { const f = Game.getFormFromFile(0x1e17b, "Dragonborn.esm"); gmWerebearRace = f ? f.getFormID() : 0; } catch (e) { gmWerebearRace = 0; } }
  let formRaces: number[] = [];
  try { const m: any = (Function("return this")() as any).__gmWolfRace; if (m) formRaces = Object.keys(m).map((k) => Number(m[k]) || 0); } catch (e) { formRaces = []; }
  return !!formRace || isWereRace(Number(ap.raceId) || 0, gmWerebearRace, formRaces);
};
import { ObjectReferenceEx } from "../extensions/objectReferenceEx";
import { PlayerCharacterDataHolder } from "./playerCharacterDataHolder";
import { getMovement } from "../sync/movementGet";
import { lastTryHost, tryHost } from "./hostAttempts";
import { ModelApplyUtils } from "./modelApplyUtils";
import { localIdToRemoteId, getViewFromStorage } from "./worldViewMisc";
import { flatStep, FLAT_STEPS, REGROUND_EVERY_MS, regroundExempt } from "../greymarch/npcHosting";
import { CHECK_EVERY_MS as GM_HOST_CHECK_MS, shouldRelease, pickTarget, markReleased, isReleased, withoutHosted, shouldReleaseUnloaded, movementDead, buildWhileDead, BODY_KILL_EVERY_MS } from "../greymarch/npcHosting";
import { SpApiInteractor } from "../services/spApiInteractor";
import { WorldCleanerService } from "../services/services/worldCleanerService";
import { GamemodeUpdateService } from "../services/services/gamemodeUpdateService";

// GREYMARCH: how long a freshly built beast (a werewolf or werebear look) is left alone: no movement, no animation, no gear (see update()); and how long a
// new werewolf form (__gmWolfRace) must stay the same before the NPC is built again with it
// (GM_BEAST_SETTLE_MS and the stand-in rules: beastSwitch.ts, A BEAST IS NEVER BUILT AS A BEAST)
const GM_WOLF_RACE_SETTLE_MS = 4000;

// GREYMARCH: A VAMPIRE'S EYES (2026-10-30). The bridge (greymarchVampEyes) names the eye part each other vampire is drawn with in __gmVampEyes (server actor id ->
// the head part's form id; none: their own eyes). Their character is BUILT with it in place of the eyes in their look, so it is shaped to the face like any part:
// an eye part swapped on the live character (ChangeHeadPart) was never shaped and sat out of the face, worst with /eyes (the owner, 2026-10-29 and 2026-10-30).
// A change (a glow, a colour, /eyes) builds the character again, as a changed look does.
const gmVampEyeFor = (remoteId: number): number => { try { const m: any = (Function("return this")() as any).__gmVampEyes; return (m && Number(m[remoteId])) || 0; } catch (e) { return 0; } };
const gmWithEyes = (ap: any, eyeId: number): any => {
  if (!eyeId || !ap || !Array.isArray(ap.headpartIds) || !ap.headpartIds.length) return ap; // no eyes named, or a beast look (no head parts)
  const parts = ap.headpartIds.filter((id: number) => { const hp = HeadPart.from(Game.getFormEx(id)); return !hp || hp.getType() !== 2; }); // 2: eyes
  return { ...ap, headpartIds: [...parts, eyeId] };
};

// GREYMARCH: CRASH BREADCRUMBS (2026-10-20). One line in Data\Platform\Logs\greymarch-crumbs-logs.txt just BEFORE each step that touches another player's or a creature's
// NPC in a way that has crashed games (spawning, removing, a model refresh, gear, an idle or a beast's animation). Every line is flushed (SkyrimPlatform's writeLogs ends
// it with std::endl), so after a crash the last lines say what this game was doing. The launcher keeps the previous session's file and puts both in the support file.
const gmCrumbStart = Date.now();
let gmEchoLeft = 60; // GREYMARCH: "own anim" breadcrumb lines left (ITS OWN ANIMATIONS BACK)
// GREYMARCH: an actor's cell for the drift lines: its id and whether it is loaded ("attached"), or "none"
const gmCellOf = (a: Actor): string => { try { const c = a.getParentCell(); return c ? gmHex(c.getFormID()) + (c.isAttached() ? " attached" : " NOT attached") : "none"; } catch (e) { return "?"; } };
let gmDriftLeft = 120; // GREYMARCH: drift diagnostic lines left (gmHostedTick)
const GM_HOLD_MAX_MS = 3000; // GREYMARCH: an NPC nobody hosts is held where the server has it for at most this long (see the movement branch)
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
    // GREYMARCH: except an NPC's body (greymarch/npcHosting.ts, BODIES): it is built and then made dead below, so it never vanishes
    if (model.isDead) {
      if (this.refrId === 0 && !buildWhileDead(!!model.appearance && (model as any).greymarchPuppet !== true)) {
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

          // GREYMARCH: THE SAME BODY (beastSwitch.ts beastKept). A person who changes into a werewolf or werebear while this game shows them keeps
          // the NPC that played their transformation: no rebuild (the base and its look stay), the engine switches its race in update(). On the way back
          // the same look returns and the same NPC is switched back. Only a game that did not show them as a person builds the stand-in.
          const gmKeepRefr = ObjectReference.from(Game.getFormEx(this.refrId));
          const gmKeepAc = gmKeepRefr ? Actor.from(gmKeepRefr) : null;
          const gmStateAp: any = this.appearanceState.appearance;
          const gmToWere = gmWereLook(model.appearance, 0) && !!gmStateAp && Array.isArray(gmStateAp.headpartIds) && gmStateAp.headpartIds.length > 0;
          const gmKeptCopy = this.gmKeptLook ? JSON.parse(JSON.stringify(this.gmKeptLook)) : null;
          if (gmKeptCopy) gmKeptCopy.name = "";
          const gmBackToKept = !!gmKeptCopy && !gmWereLook(model.appearance, 0) && JSON.stringify(modelAppearanceCopy) === JSON.stringify(gmKeptCopy);
          if (equalWithoutNames) {
            // Change name inplace
            const refr = ObjectReference.from(Game.getFormEx(this.refrId));
            refr?.getBaseObject()?.setName(model.appearance.name);
            refr?.setDisplayName(model.appearance.name, true);
            //printConsole("Appearance updated, changing name inplace");
          } else if (gmToWere && !this.gmBeast && this.ready && !!gmKeepAc && gmKeepAc.is3DLoaded()) {
            this.gmKeptLook = gmStateAp;
            this.gmBeast = beastKept(Date.now(), Number(gmStateAp.raceId) || 0);
            this.gmSpawnedBeast = true; // a beast body from now on (held, no model refresh, disabled before delete)
            this.gmLookJustChanged = true; // the form's race is taken at once (the __gmWolfRace settle rule)
            gmCrumb("keep body " + gmHex(this.refrId) + " (a person turning into a beast)");
          } else if (gmBackToKept && this.gmBeast) {
            gmCrumb("back to person " + gmHex(this.refrId) + " (the same body)");
          } else {
            this.gmKeptLook = null;
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
      const gmBuildingAnyway = this.appearanceBasedBaseId === 0 || this.gmLookJustChanged;
      const gmSettled = Date.now() - this.gmWolfRacePendingAt >= GM_WOLF_RACE_SETTLE_MS && !(this.gmSpawnedBeast && beastHeld(this.gmBeast, Date.now()));
      if (gmBuildingAnyway || gmSettled) {
        gmCrumb("race " + gmHex(this.getRemoteRefrId() || 0) + " -> " + gmHex(gmWolfRace) + (gmBuildingAnyway ? " (with the new look)" : " (settled)"));
        this.gmWolfRace = gmWolfRace; // the race the stand-in is switched to (update(): A BEAST IS NEVER BUILT AS A BEAST); no rebuild
      }
    } else this.gmWolfRacePending = gmWolfRace;
    this.gmLookJustChanged = false;
    // GREYMARCH: a vampire's eyes changed (gmVampEyeFor above): this character is built again with them
    {
      const gmEyeNow = gmVampEyeFor(this.getRemoteRefrId() || 0);
      const gmAp: any = this.appearanceState.appearance;
      if (gmEyeNow !== this.gmVampEye && this.appearanceBasedBaseId !== 0 && gmAp && Array.isArray(gmAp.headpartIds) && gmAp.headpartIds.length > 0) {
        gmCrumb("vampire eyes " + gmHex(this.getRemoteRefrId() || 0) + " -> " + gmHex(gmEyeNow) + " (built again)");
        this.appearanceBasedBaseId = 0;
      }
    }

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
        const gmBeastLookNow = !!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0); // a werewolf or werebear look
        // GREYMARCH: persist: a server NPC was made as a temporary reference for one test (2026-10-24): it ran with its height locked all the same, so it is
        // persistent again, as when the bandits walked their best (the developer, "it was working before").
        const spawnAtSpot = (baseForm: Form, pos: [number, number, number], rot: [number, number, number], persist = true): ObjectReference | null => {
          try {
            const worldOrCell = model.movement ? model.movement.worldOrCell : 0;
            const markerBase = Game.getFormEx(0x3b); // XMarker
            const marker = markerBase ? (player.placeAtMe(markerBase, 1, false, true) as ObjectReference) : null;
            if (!marker) return null;
            if (!worldOrCell) { marker.delete(); return null; }
            TESModPlatform.moveRefrToPosition(marker, Cell.from(Game.getFormEx(worldOrCell)), WorldSpace.from(Game.getFormEx(worldOrCell)), pos[0], pos[1], pos[2], rot[0], rot[1], rot[2]);
            const ref = marker.placeAtMe(baseForm, 1, persist, true) as ObjectReference;
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
              const atSpot = spawnAtSpot(baseForm, spawnPosition, spawnRotation, true);
              if (atSpot) return atSpot;
            }
            // GREYMARCH: A BEAST LOOK IS ALSO MADE AT ITS SPOT (2026-10-22), and is not moved after (spawnProcess.ts skips its setPosition). Made at the watching
            // player and then moved, the werewolf's first movement update was the engine's movement tweener easing it into its new place; a werewolf's
            // movement comes from its animations (MovementTweenerAgentAnimationDriven), so the tweener asked the graph, still loading, for its clips and the
            // watching game crashed on a null clip (ClipAddingFunctor) the second the player was drawn as the beast: 3 of 3 times on one staff game on
            // 2026-10-22 (#HXBA as the Elder Alpha, 12:27, 12:43, 12:53). If the spot cannot be used it is made at the player as before.
            if (gmBeastLookNow) {
              const atSpot = spawnAtSpot(baseForm, spawnPosition, spawnRotation);
              if (atSpot) { gmSpawnedAtSpot.add(atSpot.getFormID()); gmCrumb("at spot " + gmHex(atSpot.getFormID()) + " beast"); return atSpot; }
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
            this.gmSpawnedNoLook = !model.appearance; // a server NPC built from its own record (encounters, dungeons): disabled before it is deleted too (see destroy())
            const gmWere = gmBeastSpawn && gmWereLook(this.appearanceState.appearance, this.gmWolfRace);
            this.gmBeast = gmWere ? beastSpawned(Date.now()) : null; // GREYMARCH: a werewolf or werebear: a hidden stand-in, switched to its race in update() (beastSwitch.ts)
            if (gmWere) { try { const gmSi = Actor.from(ObjectReference.from(Game.getFormEx(this.refrId))); if (gmSi) gmSi.setAlpha(0, false); } catch (e) { /* shown as it is */ } }
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
      // GREYMARCH: BODIES (greymarch/npcHosting.ts): an NPC the server has dead is made dead here once its body is in (built dead, or alive here a moment behind)
      if (model.isDead && actor && !actor.isDead() && actor.is3DLoaded() && Date.now() - this.gmBodyKillAt >= BODY_KILL_EVERY_MS) {
        this.gmBodyKillAt = Date.now();
        try { SpApiInteractor.getControllerInstance().emitter.emit("applyDeathStateEvent", { actor, isDead: true }); } catch (e) { /* the next update tries again */ }
      }

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
    // GREYMARCH: AND EVERY SERVER NPC BUILT FROM ITS OWN RECORD (2026-10-29: a player's game crashed in a Falmer's animation-graph physics step,
    // GraphPhysicsStepListener -> FalmerBehavior.hkb reading nothing, Duskglow Crevice 2026-10-22; and a Soul Cairn skeleton in its character physics,
    // Halldir's Cairn 2026-10-29): the same delete while still enabled, its graph and bodies still being stepped. Disabled first, deleted once that is done.
    const gmBeast = this.gmSpawnedBeast || this.gmSpawnedNoLook;
    this.gmSpawnedBeast = false; this.gmSpawnedNoLook = false;
    this.gmBeast = null; this.gmKeptLook = null;
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
    if (refrId >= 0xff000000) gmCrumb("remove " + gmHex(refrId) + (gmBeast ? " (disable first)" : ""));
    once("update", () => {
      if (refrId >= 0xff000000 && gmBeast) {
        // The world cleaner's protection is dropped only AFTER the delete (2026-10-20). Dropped at once, the NPC was unprotected and not yet disabled for the frames
        // the disable takes, and the world cleaner (one random nearby actor a frame) could pick it and disable and delete it too: a second delete of the same actor,
        // the crash of a watching game the moment a beast player changed back.
        const unprotect = () => SpApiInteractor.getControllerInstance().lookupListener(WorldCleanerService).modWcProtection(refrId, -1);
        const refr = ObjectReference.from(Game.getFormEx(refrId));
        if (!refr) { unprotect(); return; }
        // ITS MOVES STOPPED FIRST (2026-10-30, crash: a wildlife Deer deleted while a movement order SkyMP gave it was still queued, MovementControllerNPC
        // reading the deleted actor, IMovementMessageInterface): the translateTo and keepOffsetFromActor orders are cancelled before it is disabled and deleted
        try { const gmMover = Actor.from(refr); if (gmMover) { gmMover.stopTranslation(); gmMover.clearKeepOffsetFromActor(); } } catch (e) { /* it was not moving */ }
        refr.disable(false).then(() => {
          const gone = ObjectReference.from(Game.getFormEx(refrId));
          if (gone) gone.delete();
          gmCrumb("removed " + gmHex(refrId) + " (disabled first)");
          unprotect();
        });
        return;
      }
      if (refrId >= 0xff000000) {
        const refr = ObjectReference.from(Game.getFormEx(refrId));
        if (refr) {
          try { const gmMover = Actor.from(refr); if (gmMover) { gmMover.stopTranslation(); gmMover.clearKeepOffsetFromActor(); } } catch (e) { /* it was not moving */ } // (its moves stopped first, as above)
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
    // GREYMARCH: hosting follows the players (greymarch/npcHosting.ts): once a second, an NPC this game runs is handed on to a clearly closer player, or made to
    // fight another player it detects while it fights nobody
    this.gmIsPlayerLook = !!model.appearance && (model as any).greymarchPuppet !== true;
    if (alreadyHosted && refr.is3DLoaded() && Date.now() - this.gmHostCheckAt >= GM_HOST_CHECK_MS) {
      this.gmHostCheckAt = Date.now();
      if (this.gmHostedTick(refr) === "released") alreadyHosted = false;
    }
    // GREYMARCH: FLOATING NPCs (greymarch/npcHosting.ts): an NPC this game hosts but has not had loaded for UNLOADED_RELEASE_MS is let go
    if (alreadyHosted && !refr.is3DLoaded()) {
      if (!this.gmUnloadedSince) this.gmUnloadedSince = Date.now();
      else if (shouldReleaseUnloaded(this.gmUnloadedSince, Date.now())) {
        const gmRid = this.remoteRefrId as number;
        storage["hosted"] = withoutHosted(storage["hosted"], gmRid);
        markReleased(gmRid, Date.now());
        gmCrumb("handoff " + gmHex(gmRid) + ": not loaded here for " + (Date.now() - this.gmUnloadedSince) + " ms");
        this.gmUnloadedSince = 0;
        alreadyHosted = false;
      }
    } else this.gmUnloadedSince = 0;
    setDefaultAnimsDisabled(this.refrId, alreadyHosted ? false : true);

    if (alreadyHosted) {
      Actor.from(refr)?.clearKeepOffsetFromActor();
    }
    // GREYMARCH: STUCK MOVES (greymarch/npcHosting.ts): an NPC this game has just become the host of is taken out of any move SkyMP gave it while it played the
    // server's movement, so the engine's own ground and gravity drive it from now on
    if (alreadyHosted && !this.gmWasHost) {
      try { Actor.from(refr)?.stopTranslation(); } catch (e) { /* it was not moving */ }
      // its animation state is reset too (2026-10-28, the owner: the armed encounter skeletons ran in place; breadcrumbs: Speed 334, SpeedSampled 0). Until this
      // game ran it, its own animations were held back (setDefaultAnimsDisabled), and a run its AI started then never began in its graph
      let gmReset = false;
      try { const gmHa = Actor.from(refr); if (gmHa && gmHa.is3DLoaded() && !gmHa.isDead()) { Debug.sendAnimationEvent(gmHa, GM_GRAPH_RESET); gmReset = true; } } catch (e) { /* the stuck-run check resets it later */ }
      gmCrumb("host start " + gmHex(this.refrId) + ": move stopped" + (gmReset ? ", animation state reset" : ""));
    }
    this.gmWasHost = alreadyHosted;

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
      // GREYMARCH: A BEAST IS NEVER BUILT AS A BEAST (beastSwitch.ts): the hidden stand-in is switched to its race by the engine (SetRace), then shown
      if (this.gmBeast) {
        const gmApW: any = this.appearanceState.appearance;
        const gmWereNow = gmWereLook(gmApW, this.gmWolfRace);
        const gmPersonRace = this.gmKeptLook ? Number(this.gmKeptLook.raceId) || 0 : 0;
        const gmWanted = gmWereNow ? (this.gmWolfRace || (gmApW ? Number(gmApW.raceId) || 0 : 0)) : gmPersonRace; // on the way back: the person's own race
        const gmSwAc = Actor.from(refr);
        const gmLoaded = !!gmSwAc && gmSwAc.is3DLoaded();
        const gmRace = gmWanted ? Race.from(Game.getFormEx(gmWanted)) : null;
        const gmDo = gmSwAc && gmRace ? beastSwitchStep(this.gmBeast, Date.now(), gmWanted, gmLoaded) : {};
        if (gmDo.setRace && gmSwAc && gmRace) {
          gmCrumb("setrace " + gmHex(refr.getFormID()) + " -> " + gmHex(gmDo.setRace) + (gmDo.first ? " (stand-in" + (gmLoaded ? ", 3D in)" : ", 3D not in)") : " (form switch)"));
          // a live body SkyMP was moving: its moves are stopped first (a SetRace during a move crashed in the physics rebuild, 2026-10-17)
          if (!gmDo.first) { try { gmSwAc.stopTranslation(); gmSwAc.clearKeepOffsetFromActor(); } catch (e) { /* not moving */ } }
          try { gmSwAc.setRace(gmRace); } catch (e) { gmCrumb("setrace failed " + gmHex(refr.getFormID()) + ": " + e); }
        }
        if (gmDo.show && gmSwAc) {
          try { gmSwAc.setAlpha(1, false); gmCrumb("shown " + gmHex(refr.getFormID()) + " beast"); } catch (e) { /* stays hidden */ }
        }
        if (!gmWereNow && beastDone(this.gmBeast, Date.now(), gmPersonRace)) { // back in the person's own race and settled: an ordinary NPC again
          gmCrumb("person again " + gmHex(refr.getFormID()));
          this.gmBeast = null; this.gmKeptLook = null; this.gmSpawnedBeast = false;
        }
      }
      const gmHoldStill = this.gmSpawnedBeast && beastHeld(this.gmBeast, Date.now());
      // GREYMARCH: which beast NPCs are still settling, for the bridge's howl on other players' werewolves (greymarchWolfHowlOther)
      try { const gmHeldMap: any = (Function("return this")() as any).__gmBeastHeld || ((Function("return this")() as any).__gmBeastHeld = {}); if (gmHoldStill) gmHeldMap[refr.getFormID()] = true; else delete gmHeldMap[refr.getFormID()]; } catch (e) { /* the howl waits */ }
      // GREYMARCH: NO COMBAT ON A BEAST COPY (2026-10-23). Another player's werewolf here was in combat the whole time (measured): its combat AI then steers it and
      // fights SkyMP's follow movement (the walk). It is a copy: what it does comes from its player's game (movement, attacks as animation events).
      if (this.gmSpawnedBeast && !gmHoldStill) { try { const gmCb = Actor.from(refr); if (gmCb && gmCb.isInCombat()) gmCb.stopCombat(); } catch (e) { /* next update */ } }
      // DIAGNOSTIC (2026-10-23, a werewolf slid instead of walking on other players' screens): every 2 s, at most 60 lines a game, for a beast NPC: what SkyMP was
      // told (run mode, speed) and what the NPC's own graph and AI do with it. Goes to the server log (greymarchStage).
      if (this.gmSpawnedBeast && model.movement && Date.now() >= gmWalkDiagNext && gmWalkDiagLeft > 0) {
        gmWalkDiagNext = Date.now() + 2000; gmWalkDiagLeft--;
        try {
          const d = Actor.from(refr);
          const m = model.movement;
          const off = Math.round(Math.hypot(m.pos[0] - refr.getPositionX(), m.pos[1] - refr.getPositionY()));
          if (d) (SpApiInteractor.getControllerInstance().emitter as any).emit("greymarchStage", "wolf walk (theirs " + gmHex(this.getRemoteRefrId()) + " as " + gmHex(refr.getFormID()) + "): told " + m.runMode + " speed " + Math.round(m.speed || 0) + " dir " + Math.round(m.direction || 0) + ", " + off + " units off | NPC: SpeedSampled " + Math.round(d.getAnimationVariableFloat("SpeedSampled")) + ", Speed " + Math.round(d.getAnimationVariableFloat("Speed")) + ", AI " + d.isAIEnabled() + ", combat " + d.isInCombat() + ", weapon drawn " + d.isWeaponDrawn() + ", animation driven " + d.getAnimationVariableBool("bAnimationDriven") + ", race " + gmHex(d.getRace() ? d.getRace()!.getFormID() : 0) + ", held " + gmHoldStill);
        } catch (e) { /* diagnostics only */ }
      }
      if (gmHoldStill && !this.gmHeldSaid) { this.gmHeldSaid = true; gmCrumb("hold still " + gmHex(refr.getFormID()) + " beast (fresh)"); }
      if (!gmHoldStill) this.gmHeldSaid = false;
      if (
        !gmHoldStill && (
        +(model.numMovementChanges as number) !==
        this.movState.lastNumChanges ||
        Date.now() - this.movState.lastApply > 2000)
      ) {
        this.movState.lastApply = Date.now();
        // GREYMARCH: AN NPC NOBODY HOSTS YET STAYS WHERE THE SERVER HAS IT (2026-10-23). SkyMP let every game that does not host an NPC run its own copy with
        // its own AI until the server picked a host, so the copies wandered apart (one deer in different places on different screens) and the server's
        // position went stale (the wildlife's resync had to move animals back to the player fighting them). Now only the host's game runs the AI: every
        // other game keeps playing the server's movement, and asks to host it (below) while nobody does.
        // A FALLBACK (2026-10-23): an NPC held this way for GM_HOLD_MAX_MS without becoming this game's (the deer standing still on test) is run here as before,
        // so an NPC never freezes; the breadcrumbs file says which NPCs that happened to, and which this game became the host of.
        const gmNobody = !model.isHostedByOther && !alreadyHosted;
        if (!gmNobody) { if (this.gmHoldSince && alreadyHosted) gmCrumb("host " + gmHex(this.refrId) + " after " + (Date.now() - this.gmHoldSince) + " ms"); this.gmHoldSince = 0; this.gmHoldGaveUp = false; }
        else if (!this.gmHoldSince) this.gmHoldSince = Date.now();
        const gmGiveUp = gmNobody && Date.now() - this.gmHoldSince > GM_HOLD_MAX_MS;
        if (gmGiveUp && !this.gmHoldGaveUp) { this.gmHoldGaveUp = true; gmCrumb("no host " + gmHex(this.refrId) + " (remote " + gmHex(this.remoteRefrId as number) + ") after " + GM_HOLD_MAX_MS + " ms: this game runs it"); }
        // GREYMARCH: NEVER BOTH (2026-10-28, the owner: the armed encounter skeletons moved "very slowly, like it's only the push doing it all"). An NPC this
        // game runs is moved by its own AI only: the server's movement (translateTo to the place last reported) is not played on it, even when the server's
        // word says another game hosts it, which pulled it back every update while its AI ran. Breadcrumb "host clash" when the two disagree
        const gmMineOnly = alreadyHosted && this.movState.everApplied;
        if (gmMineOnly && model.isHostedByOther && !this.gmClashSaid) { this.gmClashSaid = true; gmCrumb("host clash " + gmHex(this.remoteRefrId as number) + ": this game runs it, the server says another does; its movement is not played here"); }
        if (!gmMineOnly && (model.isHostedByOther || !this.movState.everApplied || (gmNobody && !gmGiveUp))) {
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
          // GREYMARCH: BODIES (greymarch/npcHosting.ts): a movement that still has the NPC alive never brings back one the server has dead
          const gmDeadBackup = model.movement.isDead;
          model.movement.isDead = movementDead(model.isDead, model.movement.isDead);
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
          model.movement.isDead = gmDeadBackup;

          this.movState.lastNumChanges = +(model.numMovementChanges as number);
          this.movState.everApplied = true;

          // GREYMARCH: nobody hosts it: ask (the server gives it to the first game that asks; tryHostIfNeed asks at most once a second)
          if (!model.isHostedByOther && !alreadyHosted) {
            const gmAc = Actor.from(refr);
            const gmRemote = this.remoteRefrId;
            if (gmAc && gmRemote && gmAc.is3DLoaded()) this.tryHostIfNeed(gmAc, gmRemote as number);
          }
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
    // a beast look, or a body still switching (the same body on its way back is still the beast until its race is switched back)
    const gmBeastLook = (!!model.appearance && !(Array.isArray(model.appearance.headpartIds) && model.appearance.headpartIds.length > 0)) || !!this.gmBeast;

    if (refr.is3DLoaded()) {
      // GREYMARCH: ITS OWN ANIMATIONS BACK (2026-10-24). The server sends an NPC's animations to every player near it, the host's game too, and SkyMP played them
      // again on the NPC this game runs itself, a moment late: a jump or fall played on an NPC already on the ground left it in the falling state (the drift
      // breadcrumbs: "jump true" for 17 s, hanging 160 units over its player) and played on it, it was sent out again. Deer, bandits and draugr walked in the air
      // or into the ground. An NPC this game hosts plays only what its own AI does; the change count is taken so nothing old is played once it is handed on.
      if (model.animation && alreadyHosted) {
        if (this.animState.lastNumChanges !== model.animation.numChanges) {
          this.animState.lastNumChanges = model.animation.numChanges;
          if (gmEchoLeft > 0) { gmEchoLeft--; gmCrumb("own anim " + gmHex(refr.getFormID()) + " " + String(model.animation.animEventName).slice(0, 40) + ": not played again"); }
        }
      } else if (model.animation) {
        // and never a howl on a beast: played into a remote beast's graph without the howl shout behind it, "WW Howl.hkx" crashed the watching game (2026-10-19 #SZGE)
        if (gmBeastLook && (this.animState.useAnimOverrides || beastHeld(this.gmBeast, Date.now()) || String(model.animation.animEventName || "").toLowerCase().startsWith("howl") || /^skympfake/i.test(String(model.animation.animEventName || "")))) this.animState.lastNumChanges = model.animation.numChanges; // and never SkyMP's equip / unequip (it draws the weapon: see "NO WEAPON DRAW" above)
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
      this.gmLastEquipment = model.equipment; // GREYMARCH: what it wears, for a rebuild (gmHostedTick, "reground")
      if (this.eqState.lastNumChanges !== model.equipment.numChanges) {
        const ac = Actor.from(refr);
        // If we do not block inventory here, we will be able to reproduce the bug:
        // 1. Place ~90 bots and force them to reequip iron swords to the left hand (rate should be ~50ms)
        // 2. Open your inventory and reequip different items fast
        // 3. After 1-2 minutes close your inventory and see that HUD disappeared
        // GREYMARCH breadcrumb: a gear change its host holds back (DRESSED ONCE BY ITS HOST), once per change
        if (ac && this.gmWasHost && this.gmGearDone && this.gmHeldGear !== model.equipment.numChanges && (gmHoldsWeapon(ac) || (gmInCombat(ac) && !gmGearArms(model.equipment)))) {
          this.gmHeldGear = model.equipment.numChanges as number;
          gmCrumb("gear held " + gmHex(ac.getFormID()) + ": " + (gmHoldsWeapon(ac) ? "it holds a weapon" : "in a fight, the change brings no weapon"));
        }
        if (
          ac &&
          !isBadMenuShown() &&
          Date.now() - this.eqState.lastEqMoment > 500 &&
          Date.now() - this.spawnMoment > -1 &&
          this.spawnMoment > 0 &&
          // GREYMARCH: DRESSED ONCE BY ITS HOST (2026-10-28, the owner: encounter skeletons "slide for a bit then run", then: the armed ones "run in place and
          // sheath their weapon"). applyEquipment empties the NPC and dresses it again. An NPC this game runs got that again when this game took it over and at
          // the server's echo of its own gear: the weapon was pulled from its hand (SkympFakeUnequip in the breadcrumbs), and an armed fighter's graph stuck,
          // running on the spot. Once this game hosts it and has dressed it, this game's own gear is the real one (it reports it to the server); the server's
          // copy is not put back on it (a rebuild still dresses it: "reground"). UNLESS ITS HANDS ARE EMPTY (2026-10-28, the owner: the Skeleton archer had no
          // bow): the server equips the weapon the gamemode gave it (npcresolve armFor) only when a game takes it over, after the first dressing; with nothing in
          // its hands there is no weapon to pull, so that dressing is taken
          !(this.gmWasHost && this.gmGearDone && (gmHoldsWeapon(ac) || (gmInCombat(ac) && !gmGearArms(model.equipment)))) && // (empty hands mid-fight: after the fight, so it does not slide; at once when it brings a weapon: the archer fought its whole life with its fists, 2026-10-28)
          (!gmBeastLook || (!!this.gmBeast && !beastHeld(this.gmBeast, Date.now()))) &&
          // GREYMARCH: NEVER RE-DRESS A DEAD NPC (2026-10-29, crash: a Soul Cairn skeleton "Shade" in Halldir's Cairn, the game crashed in its character physics
          // (bhkCharRigidBodyController) with this game's gear step half done: "gear ff000ca1", then TESModPlatform.Add waiting). Its loot goes on the body when it
          // dies (npcloot.js), that counts as a gear change, and its hands are empty once it falls, so the step emptied and dressed a body going into its ragdoll.
          // A body keeps what it wore; its loot is the server's (the container), not this step's. (A body built for a dead NPC is dressed before it is made dead.)
          !gmIsDead(ac)
        ) {
          //if (this.spawnMoment > 0 && Date.now() - this.spawnMoment > 5000) {
          gmCrumb("gear " + gmHex(ac.getFormID()) + (gmBeastLook ? " beast" : ""));
          if (applyEquipment(ac, model.equipment)) {
            this.eqState.lastNumChanges = model.equipment.numChanges;
            this.gmGearDone = true;
            if (this.gmWasHost) gmQuiver(ac); // the game that runs it: a bow comes with arrows
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
    // GREYMARCH: a disguised player (/disguise with a mask on, gamemode disguise.js) has no floating name either; their body shows as usual
    try { const gmGlobal2: any = Function("return this")(); if (gmGlobal2.__gmDisguised && gmGlobal2.__gmDisguised[this.getRemoteRefrId()]) return true; } catch (gmErr2) { /* names stay as they are */ }
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
      const gmAp = this.appearanceState.appearance;
      const gmLook = gmWereLook(gmAp, this.gmWolfRace) ? { ...gmAp, raceId: GM_STANDIN_RACE } : gmAp; // GREYMARCH: a beast look is built as a person stand-in, switched to its race later (A BEAST IS NEVER BUILT AS A BEAST)
      this.gmVampEye = gmVampEyeFor(this.getRemoteRefrId() || 0); // GREYMARCH: a vampire is built with their vampire eyes
      this.appearanceBasedBaseId = applyAppearance(gmWithEyes(gmLook, this.gmVampEye)).getFormID();
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
    // DEAD (2026-10-28: animals that could not be killed): a body is never moved, and its last "alive" frame is never played again (applyMovement would bring it back)
    if (model.isDead || ac.isDead()) return "";
    if (!this.gmPuppetReady) {
      this.gmPuppetReady = true;
      // its own AI never moves it (2026-10-28, the owner's cow clip: hit, it jumped back and forth, its own flight against the server's frames): never a fight
      // (Aggression 0), never a flight (Confidence 4, foolhardy), never helping another (Assistance 0); only the server's frames move it
      try { ac.setActorValue("Aggression", 0); ac.setActorValue("Confidence", 4); ac.setActorValue("Assistance", 0); ac.setActorValue("AttackDamageMult", 0); } catch (e) { /* the server still decides every hit */ } // never a fight of its own, never local damage
    }
    try { if (ac.isInCombat()) ac.stopCombat(); } catch (e) { /* next frame */ }
    // the bridge's frames: through the global first (see bridge.ts greymarchBeastFrames, 2026-10-28), storage as before
    const frames = ((Function("return this")() as any).__gmBeastFrames || storage["greymarchBeastFrames"] || {}) as Record<string, { pos: number[]; heading: number; speed: number; anim: string; at: number; hp?: number; hunt?: number; ev?: string; mine?: number; reach?: number; run?: number }>;
    const f = frames[String(this.remoteRefrId)];
    const now = Date.now();
    // breadcrumbs (2026-10-28, animals that never moved): the first frame played for this animal, or, 3 s after it was first seen, that none was found
    if (!this.gmPuppetSeenAt) this.gmPuppetSeenAt = now;
    if (f && !this.gmPuppetCrumbed) { this.gmPuppetCrumbed = true; gmCrumb("puppet " + gmHex(this.remoteRefrId as number) + ": first frame " + f.anim + " to " + f.pos.map(Math.round).join(" ") + " (it stands at " + [refr.getPositionX(), refr.getPositionY(), refr.getPositionZ()].map(Math.round).join(" ") + ")"); }
    if (!f && !this.gmPuppetCrumbed && now - this.gmPuppetSeenAt > 3000) { this.gmPuppetCrumbed = true; const keys = Object.keys(frames); gmCrumb("puppet " + gmHex(this.remoteRefrId as number) + ": no frame after 3 s; frames held for " + keys.length + " animal(s)" + (keys.length ? ", e.g. " + Number(keys[0]).toString(16) : "")); }
    // A LUNGE (2026-10-28, the owner's clip: a wolf leapt past the player and slid back): the lunge's own animation carries the animal forward, so for its
    // length it is not placed by the frames too (it was placed by the server at the end of the leap AND carried on by the animation: past the player);
    // afterwards the frames take it again where the server has it
    if (f && f.anim === "attack" && f.at !== this.gmPuppetAttackAt && typeof f.ev === "string" && /power|lunge/i.test(f.ev) && this.movState.everApplied) {
      this.gmPuppetAttackAt = f.at;
      this.gmPuppetLungeUntil = now + GM_PUPPET_LUNGE_MS;
      try { allowAttackAnim(ac.getFormID(), f.ev); Debug.sendAnimationEvent(ac, f.ev); } catch (e) { /* the server already counted the bite */ }
      return "";
    }
    if (now < this.gmPuppetLungeUntil) { if (f && f.mine === 1) this.gmPuppetReport(refr, now); return ""; }
    // IT HUNTS THIS PLAYER (2026-10-28, the owner: the wolves still teleported): this game moves it, toward where the player really is (the server knows that
    // a moment late), and reports where it is; the server still decides every bite and lunge
    if (f && f.mine === 1 && f.hunt === 1 && now - f.at < GM_PUPPET_MINE_FRESH_MS && this.movState.everApplied) return this.gmPuppetDriveLocal(refr, ac, model, f, now);
    let m: Movement | null = null;
    if (!f) {
      if (this.movState.everApplied) return "";
      m = model.movement;
    } else {
      if (f.at === this.gmPuppetAt && now - this.movState.lastApply < 1000) return "";
      this.gmPuppetAt = f.at;
      m = { ...model.movement, pos: [f.pos[0], f.pos[1], f.pos[2]], rot: [0, 0, f.heading], runMode: f.anim === "run" ? "Running" : f.anim === "walk" ? "Walking" : "Standing", direction: 0, speed: f.hunt === 1 ? 0 : f.speed, isInJumpState: false, isSneaking: false, isBlocking: false, isWeapDrawn: f.hunt === 1 || f.anim === "attack", ...(typeof f.hp === "number" ? { healthPercentage: Math.max(0.02, f.hp) } : {}) };
      // speed 0 while hunting (2026-10-28, the owner's clip: wolves teleported on the player): SkyMP places a moving one a fifth of a second AHEAD of its frame
      // (lag for a player); a wolf that stopped at the player was put past them, then pulled back. Hunting, it goes where the server has it
      // the server's health on the bar (2026-10-28). Never 0 here: at 0 the game held it dying, and the server's death then came as a quiet one (the owner:
      // no death sound); the death itself comes from the server (applyDeathState). isWeapDrawn: hunting, it stands in its fighting stance (the owner: no
      // attack animations; a creature attacks only from there)
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
      // allowed first: the anim hook blanks attacks on actors with default anims off (2026-10-28, the owner: no attack animations)
      // the creature's own attack event from the server (2026-10-28, the owner: still no attack: a creature's body does not answer a person's "attackStart")
      const ev = f.ev || "attackStart";
      try { allowAttackAnim(ac.getFormID(), ev); Debug.sendAnimationEvent(ac, ev); } catch (e) { /* the server already counted the bite */ }
      if (!this.gmPuppetAttackCrumbed) { this.gmPuppetAttackCrumbed = true; let drawn = "?"; try { drawn = String(ac.isWeaponDrawn()); } catch (e) { /* unknown */ } gmCrumb("puppet " + gmHex(this.remoteRefrId as number) + ": first attack played: " + ev + " (fighting stance " + drawn + ")"); }
    }
    return "";
  }
  // GREYMARCH: a server-driven animal that hunts this player, moved here (2026-10-28): it runs toward the player until in reach, then stands facing them and
  // bites when the server says; in a fight it waits until the player is GM_PUPPET_HOLD past its reach. Its place goes to the server (gmPuppetReport).
  private gmPuppetDriveLocal(refr: ObjectReference, ac: Actor, model: FormModel, f: { pos: number[]; heading: number; speed: number; anim: string; at: number; hp?: number; ev?: string; reach?: number; run?: number }, now: number): string {
    if (f.anim === "attack" && f.at !== this.gmPuppetAttackAt) {
      this.gmPuppetAttackAt = f.at;
      const ev = f.ev || "attackStart";
      try { allowAttackAnim(ac.getFormID(), ev); Debug.sendAnimationEvent(ac, ev); } catch (e) { /* the server already counted the bite */ }
    }
    if (now - this.gmPuppetLocalAt < GM_PUPPET_LOCAL_EVERY_MS) return "";
    this.gmPuppetLocalAt = now;
    const me = Game.getPlayer();
    if (!me) return "";
    const px = me.getPositionX(), py = me.getPositionY(), pz = me.getPositionZ();
    const wx = refr.getPositionX(), wy = refr.getPositionY(), wz = refr.getPositionZ();
    const dx = px - wx, dy = py - wy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const reach = f.reach || 150, run = f.run || 400;
    const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // Skyrim: 0 is north (+y), clockwise
    let tx = wx, ty = wy, tz = wz, moving = false;
    if (d <= reach) this.gmPuppetEngaged = true;
    else if (!(this.gmPuppetEngaged && d <= reach + GM_PUPPET_HOLD)) {
      this.gmPuppetEngaged = false;
      const go = Math.min(d - reach * 0.8, run * 0.2); // a fifth of a second ahead: translateTo gets there at its run speed
      if (go > 5) { moving = true; tx = wx + (dx / d) * go; ty = wy + (dy / d) * go; tz = wz + (pz - wz) * Math.min(1, go / d); }
    }
    const m = { ...model.movement, pos: [tx, ty, tz], rot: [0, 0, heading], runMode: moving ? "Running" : "Standing", direction: 0, speed: 0, isInJumpState: false, isSneaking: false, isBlocking: false, isWeapDrawn: true, ...(typeof f.hp === "number" ? { healthPercentage: Math.max(0.02, f.hp) } : {}) } as Movement;
    this.movState.lastApply = now;
    try {
      applyMovement(refr, m, false);
      if (!moving && Math.abs(((refr.getAngleZ() - heading + 540) % 360) - 180) > 20) refr.setAngle(0, 0, heading); // standing: it turns to face the player
    } catch (e) {
      if (e instanceof RespawnNeededError) {
        this.lastWorldOrCell = m.worldOrCell;
        this.destroy();
        this.refrId = 0;
        this.appearanceBasedBaseId = 0;
        return "respawn";
      }
      throw e;
    }
    if (!this.gmPuppetDriveCrumbed) { this.gmPuppetDriveCrumbed = true; gmCrumb("puppet " + gmHex(this.remoteRefrId as number) + ": hunts this player, moved here (" + Math.round(d) + " away)"); }
    this.gmPuppetReport(refr, now);
    return "";
  }
  // where this game has a hunting animal, to the server (wildlifesystem.js handlePacket greymarchBeastPos), at most every GM_PUPPET_REPORT_EVERY_MS
  private gmPuppetReport(refr: ObjectReference, now: number): void {
    if (now - this.gmPuppetReportAt < GM_PUPPET_REPORT_EVERY_MS) return;
    this.gmPuppetReportAt = now;
    try {
      const pos = [refr.getPositionX(), refr.getPositionY(), refr.getPositionZ()].map((n) => Math.round(n));
      const message = { t: MsgType.CustomPacket, contentJsonDump: JSON.stringify({ customPacketType: "greymarchBeastPos", id: this.remoteRefrId, pos, h: Math.round(refr.getAngleZ()) }) };
      SpApiInteractor.getControllerInstance().emitter.emit("sendMessage", { message: message, reliability: "unreliable" } as any);
    } catch (e) { /* the next one */ }
  }
  // GREYMARCH: an NPC put down (PUT DOWN BY ITS HOST) goes back at the one it fought, weapon drawn: being set down or rebuilt ended its fight (2026-10-28)
  private gmGroundRefight(npc: Actor): void {
    if (!this.gmGroundTargetId) return;
    try {
      const target = Actor.from(Game.getFormEx(this.gmGroundTargetId));
      if (!target || target.isDead()) { this.gmGroundTargetId = 0; return; }
      if (!npc.isInCombat() || !npc.getCombatTarget()) npc.startCombat(target);
      if (!npc.isWeaponDrawn()) npc.drawWeapon();
    } catch (e) { /* the next check tries again */ }
  }
  // GREYMARCH: an NPC this game hosts, checked once a second (greymarch/npcHosting.ts). "released" when it was handed on.
  private gmHostedTick(refr: ObjectReference): string {
    try {
      const npc = Actor.from(refr);
      const me = Game.getPlayer();
      if (!npc || !me || npc.isDead()) return "";
      const placeOf = (a: Actor): number => { const w = a.getWorldSpace() || a.getParentCell(); return w ? w.getFormID() : 0; };
      const myPlace = placeOf(me);
      // DIAGNOSTIC (2026-10-24, NPCs walking in the air or half in the ground with only their host's player there): every 3 s, at most 120 lines a game, an NPC
      // this game runs near its player: its height and the player's, to the breadcrumbs file
      // GREYMARCH: LOCKED HEIGHT (greymarch/npcHosting.ts): far each second with no height change, three times in a row: dropped back onto the ground
      const gmNow = [npc.getPositionX(), npc.getPositionY(), npc.getPositionZ()];
      // a giant or a mammoth is never rebuilt (regroundExempt): its charge passed the flat test
      const gmRaceName = (() => { try { const r = npc.getRace(); return r ? r.getName() : ""; } catch (e) { return ""; } })();
      this.gmFlatSteps = flatStep(this.gmLastPos, gmNow) && !regroundExempt(gmRaceName) ? this.gmFlatSteps + 1 : 0;
      this.gmLastPos = gmNow;
      if ((this.gmFlatSteps >= FLAT_STEPS || this.gmGroundForce) && Date.now() - this.gmRegroundAt >= REGROUND_EVERY_MS) {
        this.gmRegroundAt = Date.now(); this.gmFlatSteps = 0; this.gmGroundForce = false;
        // its body rebuilt where it stands (disabled and enabled again), as when the bandits walked their best (2026-10-24). Enabled again, the game draws its
        // gear anew from its outfit lists ("bandits respawn with other loadouts"): the server's record of what it wore is put back on it at once, and once more
        // by the normal gear step (its change count is reset)
        gmCrumb("reground " + gmHex(this.remoteRefrId as number) + " at " + gmNow.map(Math.round).join(" ") + " (height locked; rebuilt, gear kept)");
        const gmRid = npc.getFormID();
        const gmEq = this.gmLastEquipment;
        try {
          npc.disable(false).then(() => {
            const again = ObjectReference.from(Game.getFormEx(gmRid));
            if (!again) return;
            return again.enable(false).then(() => {
              const ac = Actor.from(Game.getFormEx(gmRid));
              if (ac && gmEq) { try { applyEquipment(ac, gmEq); } catch (e) { /* the gear step tries again */ } }
              this.eqState = this.getDefaultEquipState();
              if (ac) this.gmGroundRefight(ac); // rebuilt, it forgot its fight (2026-10-28): back at the one it fought, weapon drawn
            });
          }).catch(() => { /* the next check tries again */ });
        } catch (e) { /* the next check tries again */ }
      }
      if (Date.now() - this.gmDriftAt >= 3000 && gmDriftLeft > 0) {
        const hd = Math.hypot(npc.getPositionX() - me.getPositionX(), npc.getPositionY() - me.getPositionY());
        if (hd < 800) {
          this.gmDriftAt = Date.now(); gmDriftLeft--;
          gmCrumb("drift " + gmHex(this.remoteRefrId as number) + " base " + gmHex(npc.getBaseObject() ? npc.getBaseObject()!.getFormID() : 0) + ": at " + Math.round(gmNow[0]) + " " + Math.round(gmNow[1]) + ", z " + Math.round(npc.getPositionZ()) + ", cell " + gmCellOf(npc) + " (player " + gmCellOf(me) + ")" + ", player z " + Math.round(me.getPositionZ()) + ", " + Math.round(hd) + " away, combat " + npc.getCombatState() + ", speed " + Math.round(npc.getAnimationVariableFloat("Speed")) + ", jump " + npc.getAnimationVariableBool("bInJumpState") + ", AI " + npc.isAIEnabled());
        }
      }
      // GREYMARCH: A STUCK RUNNER, WATCHED (2026-10-28, the owner: encounter draugr and skeletons "run in place, or get stuck when running"). Checked every
      // GM_RUN_CHECK_MS: an NPC in a fight, "running" (Speed over GM_RUN_SPEED), not near its target, that covered less than a quarter of what that speed covers,
      // twice in a row, is written down ("stuck run"); when its graph is not moving at all its animation state is reset. It is never moved: moved onto itself it stayed stuck, and rebuilt it
      // vanished and came back with other weapons (the owner, 2026-10-28). At most once each GM_RUN_NUDGE_MS
      if (Date.now() - this.gmQuiverAt >= 5000) { this.gmQuiverAt = Date.now(); gmQuiver(npc); } // A QUIVER: its bow may come after it was dressed
      {
        const gmRNow = Date.now();
        if (gmRNow - this.gmRunAt >= GM_RUN_CHECK_MS) {
          const gmRP = [npc.getPositionX(), npc.getPositionY()];
          let gmRSpeed = 0; try { gmRSpeed = npc.getAnimationVariableFloat("Speed"); } catch (e) { gmRSpeed = 0; }
          let gmRTarget: Actor | null = null; try { gmRTarget = npc.isInCombat() ? npc.getCombatTarget() : null; } catch (e) { gmRTarget = null; }
          const gmRGap = gmRTarget ? Math.hypot(gmRTarget.getPositionX() - gmRP[0], gmRTarget.getPositionY() - gmRP[1]) : 0;
          if (this.gmRunPos && this.gmRunAt && gmRTarget && gmRSpeed > GM_RUN_SPEED && gmRGap > GM_RUN_NEAR) {
            const gmMoved = Math.hypot(gmRP[0] - this.gmRunPos[0], gmRP[1] - this.gmRunPos[1]);
            const gmExpect = (gmRSpeed * (gmRNow - this.gmRunAt)) / 1000;
            this.gmRunStuck = gmMoved < gmExpect * 0.25 ? this.gmRunStuck + 1 : 0;
            if (this.gmRunStuck >= 2 && gmRNow - this.gmRunNudgedAt >= GM_RUN_NUDGE_MS) {
              this.gmRunStuck = 0; this.gmRunNudgedAt = gmRNow;
              const gmV = (n: string) => { try { return String(Math.round(npc.getAnimationVariableFloat(n) * 100) / 100); } catch (e) { return "?"; } };
              const gmB = (n: string) => { try { return npc.getAnimationVariableBool(n) ? "1" : "0"; } catch (e) { return "?"; } };
              // its graph is not moving at all while its AI runs (SpeedSampled 0): its animation state is reset (GM_GRAPH_RESET), nothing else is done to it
              let gmSampled0 = false; try { gmSampled0 = npc.getAnimationVariableFloat("SpeedSampled") < 1; } catch (e) { gmSampled0 = false; }
              let gmLos = "?"; try { gmLos = npc.hasLOS(gmRTarget) ? "yes" : "no"; } catch (e) { gmLos = "?"; }
              gmCrumb("stuck run " + gmHex(this.remoteRefrId as number) + " base " + gmHex(npc.getBaseObject() ? npc.getBaseObject()!.getFormID() : 0) + ": speed " + Math.round(gmRSpeed) + ", moved " + Math.round(gmMoved) + " of " + Math.round(gmExpect) + ", target " + gmHex(gmRTarget.getFormID()) + (gmRTarget.getFormID() === 0x14 ? " (me)" : "") + " " + Math.round(gmRGap) + " away, " + Math.round(gmRTarget.getPositionZ() - npc.getPositionZ()) + " higher, sees it " + gmLos + ", weapon " + (npc.isWeaponDrawn() ? "drawn" : "away") + ", blocking " + gmB("IsBlocking") + ", direction " + gmV("Direction") + ", sampled " + gmV("SpeedSampled") + ", run " + gmB("IsRunning") + ", sprint " + gmB("IsSprinting") + ", speed mult " + Math.round(npc.getActorValue("SpeedMult")) + (gmSampled0 ? "; animation state reset" : ""));
              if (gmSampled0) { try { Debug.sendAnimationEvent(npc, GM_GRAPH_RESET); } catch (e) { /* the next check tries again */ } }
            }
          } else this.gmRunStuck = 0;
          this.gmRunPos = gmRP; this.gmRunAt = gmRNow;
        }
      }
      // GREYMARCH: PUT DOWN BY ITS HOST (2026-10-28, the owner: bandits still walked on air and sank into the ground chasing people). The server saw this NPC
      // off the ground (gamemode groundclamp.js) and sent the land around it (5 x 5 heights): the ground under its own feet is read from them (on a steep
      // hillside one height for the spot was 100+ too high, and the bandit stayed up there). Then, as long as it is still off: its move is stopped (a stuck move
      // keeps an actor out of its gravity), then it is set just over that ground, then, if it is still up, rebuilt where it stands (the LOCKED HEIGHT cure above).
      // Done here by its own host, never moved by the server (a move from the server ended its fight). Breadcrumbs: "ground"
      {
        const gmGl: any = Function("return this")();
        const gmFixes: any = gmGl.__gmGroundFix;
        const gmKey = String(this.remoteRefrId);
        const gmFix = gmFixes ? gmFixes[gmKey] : null;
        if (gmFix && !gmFix.seen) { gmFix.seen = true; gmCrumb("ground seen " + gmHex(this.remoteRefrId as number) + ": " + Math.round(npc.getPositionZ() - gmGroundUnder(gmFix, npc.getPositionX(), npc.getPositionY())) + " over the ground under it, " + Math.round((Date.now() - gmFix.at) / 100) / 10 + " s after the word"); }
        if (gmFix && Date.now() - gmFix.at < GM_GROUND_FIX_MS) {
          const gmX = npc.getPositionX(), gmY = npc.getPositionY(), gmZ = npc.getPositionZ();
          const gmGround = gmGroundUnder(gmFix, gmX, gmY);
          const gmOff = gmZ - gmGround;
          const gmNow2 = Date.now();
          if (Math.abs(gmOff) <= GM_GROUND_NEAR) { if (gmFix.step) { gmCrumb("ground " + gmHex(this.remoteRefrId as number) + ": down, " + Math.round(gmOff) + " from the ground"); if (gmFix.step >= 2) this.gmGroundRefight(npc); } delete gmFixes[gmKey]; }
          else if (!gmFix.step) {
            gmFix.step = 1; gmFix.stepAt = gmNow2;
            try { const t = npc.getCombatTarget(); if (t && !t.isDead()) this.gmGroundTargetId = t.getFormID(); } catch (e) { /* no fight to keep */ }
            try { npc.stopTranslation(); } catch (e) { /* it was not moving */ }
            gmCrumb("ground " + gmHex(this.remoteRefrId as number) + ": " + Math.round(gmOff) + " off the ground under it, its move stopped (it falls by itself)");
          } else if (gmFix.step === 1 && gmNow2 - gmFix.stepAt >= GM_GROUND_SETTLE_MS) {
            gmFix.step = 2; gmFix.stepAt = gmNow2;
            // MoveTo onto itself, the ground under it as the offset (2026-10-28, the owner: set down with SetPosition they all went straight back up): MoveTo places
            // the actor anew, its physics with it, the usual cure for an actor stuck in the air; SetPosition only moved it, still without its gravity
            try { npc.moveTo(npc, 0, 0, gmGround + GM_GROUND_LIFT - gmZ, false); } catch (e) { /* the next step tries the rebuild */ }
            this.gmGroundRefight(npc); // set down, it dropped its fight and put its weapon away: back at the one it fought
            gmCrumb("ground " + gmHex(this.remoteRefrId as number) + ": still " + Math.round(gmOff) + " off, set just over the ground under it (" + Math.round(gmGround) + ")");
          } else if (gmFix.step === 2 && gmNow2 - gmFix.stepAt >= GM_GROUND_SETTLE_MS) {
            gmFix.step = 3; gmFix.stepAt = gmNow2;
            if (!regroundExempt(gmRaceName)) this.gmGroundForce = true; // rebuilt where it stands at the next check (a giant or a mammoth never: see regroundExempt)
            gmCrumb("ground " + gmHex(this.remoteRefrId as number) + ": back up " + Math.round(gmOff) + " off after it was set down, rebuilt where it stands");
          }
        } else if (gmFix) { delete gmFixes[gmKey]; }
      }
      const others: Actor[] = [];
      const arr = getViewFromStorage()?.getFormViews();
      const n = arr ? arr.getFormViewsArrayLength() : 0;
      for (let i = 0; i < n; i++) {
        const fv = arr!.getNthFormView(i);
        if (!fv || fv === this || !fv.gmIsPlayerLook) continue;
        const ac = Actor.from(Game.getFormEx(fv.getLocalRefrId()));
        if (!ac || ac.isDead() || !ac.is3DLoaded() || placeOf(ac) !== myPlace) continue;
        others.push(ac);
      }
      if (!others.length) return "";
      const remoteId = this.remoteRefrId as number;
      const dMe = npc.getDistance(me);
      const dist = others.map((o) => npc.getDistance(o));
      if (shouldRelease(dMe, dist)) {
        storage["hosted"] = withoutHosted(storage["hosted"], remoteId);
        markReleased(remoteId, Date.now());
        gmCrumb("handoff " + gmHex(remoteId) + ": a player is " + Math.round(Math.min(...dist)) + " away, mine " + Math.round(dMe));
        return "released";
      }
      if (npc.getCombatState() === 0 && npc.isHostileToActor(me)) {
        const pick = pickTarget(others.map((o, k) => ({ d: dist[k], detected: o.isDetectedBy(npc) })));
        if (pick >= 0) {
          npc.startCombat(others[pick]);
          gmCrumb("engage " + gmHex(remoteId) + " -> " + gmHex(others[pick].getFormID()) + " at " + Math.round(dist[pick]));
        }
      }
    } catch (e) { /* the NPC stays as it is */ }
    return "";
  }
  public gmIsPlayerLook = false; // GREYMARCH: this view draws a player (another player's character), not an NPC
  private gmHostCheckAt = 0;
  private gmWasHost = false;
  private gmPuppetSeenAt = 0; // GREYMARCH: when this puppet was first played (its breadcrumbs, gmPuppetMove)
  private gmPuppetCrumbed = false; // GREYMARCH: this game hosted this NPC at the last update
  private gmDriftAt = 0;
  private gmRunAt = 0; // A STUCK RUNNER: when it was last checked, where it was then, checks in a row stuck, when it was last nudged
  private gmRunPos: number[] | null = null;
  private gmRunStuck = 0;
  private gmRunNudgedAt = 0;
  private gmHeldGear: number | null = null; // GREYMARCH: the gear change last held back (its breadcrumb)
  private gmQuiverAt = 0; // GREYMARCH: when its host last checked it has arrows for its bow (A QUIVER)
  private gmClashSaid = false; // GREYMARCH: "host clash" written down for it (NEVER BOTH)
  private gmGearDone = false; // GREYMARCH: the gear step has dressed it once (its host then leaves its gear alone: DRESSED ONCE BY ITS HOST)
  private gmLastEquipment: any = null; // GREYMARCH: the server's record of what this NPC wears (put back after a rebuild)
  private gmLastPos: number[] | null = null; // GREYMARCH: LOCKED HEIGHT: where this hosted NPC was at the last check
  private gmFlatSteps = 0;
  private gmGroundForce = false; // the server saw it off the ground and its stopped move did not bring it down: rebuilt at the next check (gmHostedTick)
  private gmGroundTargetId = 0; // the one it fought when it was put down (gmGroundRefight)
  private gmRegroundAt = 0;
  private gmUnloadedSince = 0; // GREYMARCH: since when this game hosts this NPC without having it loaded (0: loaded)
  private gmBodyKillAt = 0;
  private gmPuppetReady = false;
  private gmPuppetAt = 0;
  private gmPuppetAttackAt = 0;
  private gmPuppetAttackCrumbed = false; // breadcrumbs: the first attack played
  private gmPuppetLungeUntil = 0; // a lunge's animation moves it until then (gmPuppetMove)
  private gmPuppetLocalAt = 0; // a hunting animal moved here (gmPuppetDriveLocal)
  private gmPuppetReportAt = 0; // its place last reported
  private gmPuppetEngaged = false; // in a fight: waits until the player is GM_PUPPET_HOLD past its reach
  private gmPuppetDriveCrumbed = false; // breadcrumbs: first moved here

  private tryHostIfNeed(ac: Actor, remoteId: number) {
    if (isReleased(remoteId, Date.now())) return false; // GREYMARCH: this game handed it to a closer player a moment ago (greymarch/npcHosting.ts)
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
  private gmVampEye = 0; // GREYMARCH: the vampire eye part this character was built with (0: their own eyes)
  private gmKeptLook: any = null; // GREYMARCH: the person look of a body kept through its change (THE SAME BODY)
  private gmLookJustChanged = false;
  private gmBeast: BeastSwitchState | null = null; // GREYMARCH: a beast look's NPC: its stand-in and switch state (beastSwitch.ts)
  private gmWolfRace = 0; // GREYMARCH: the werewolf variant's race this player's NPC was built with (0: none)
  private leveledBaseId = 0;
  private isOnScreen = false;
  private lastPcWorldOrCell = 0;
  private lastWorldOrCell = 0;
  private spawnMoment = 0;
  private gmSpawnedBeast = false;
  private gmSpawnedNoLook = false; // GREYMARCH: an NPC built from its own record (no look sent): see destroy()
  private gmHeldSaid = false;
  private gmHoldSince = 0; // GREYMARCH: since when nobody hosts this NPC (0: someone does)
  private gmHoldGaveUp = false;
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
