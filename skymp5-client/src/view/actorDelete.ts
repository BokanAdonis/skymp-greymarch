import { Actor, Game } from "skyrimPlatform";

// GREYMARCH: an actor deleted while still enabled crashed the game: the engine's movement job (MovementControllerNPC) still ran on it and read a deleted
// Character with no cell (EXCEPTION_ACCESS_VIOLATION at SkyrimSE.exe+0783642, a server deer that left view, 2026-10-17). As SkyMP's WorldCleanerService does,
// the actor is disabled first and deleted only once the disable has finished, re-fetched by its form ID (skipped if it is already gone, or in dialogue,
// which also crashes the game). onDone runs after that either way.
export const disableThenDeleteActor = (actor: Actor, onDone?: () => void): void => {
  const formId = actor.getFormID();
  const finish = () => {
    if (onDone) {
      onDone();
    }
  };
  actor.disable(false).then(() => {
    try {
      const ac = Actor.from(Game.getFormEx(formId));
      if (ac && !ac.isDeleted() && !ac.isInDialogueWithPlayer() && ac.getDialogueTarget() === null) {
        ac.delete();
      }
    } finally {
      finish();
    }
  }, finish);
};
