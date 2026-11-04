// GREYMARCH: the charge of the enchanted staff in a hand (0 left, 1 right) of the player, or -1 (2026-11-03, the owner: a staff came back full after a
// restart or a drop; the charge kept by the server never came into play). SKSE's WornObject.GetItemCharge first; the game's own actor values
// RightItemCharge / LeftItemCharge (the charge of what is in that hand) when it gives nothing. Each way's first few answers go to greymarch-logs.txt.
import { Actor, callNative, writeLogs } from "skyrimPlatform";

let told = 0;
export const readStaffCharge = (me: Actor, hand: number): number => {
  let worn = NaN, av = NaN;
  try { worn = Number(callNative("WornObject", "GetItemCharge", undefined, me, hand, 0)); } catch (e) { worn = NaN; }
  try { av = Number(me.getActorValue(hand === 0 ? "LeftItemCharge" : "RightItemCharge")); } catch (e) { av = NaN; }
  if (told < 6) { told++; try { writeLogs("greymarch", `staff charge: hand ${hand} WornObject ${worn} actor value ${av}`); } catch (e) { /* logs only */ } }
  // THE ACTOR VALUE FIRST (2026-11-03, the owner's log: after a staff was picked up WornObject said 500 for good while the charge itself went down, so the
  // charge set back was asked again and again and no cast was ever seen): it is the charge the game uses and shows
  if (isFinite(av) && av >= 0) return av;
  return isFinite(worn) && worn >= 0 ? worn : -1;
};

// puts a charge on the staff in that hand: WornObject.SetItemCharge, and the actor value too (whichever the game listens to)
export const writeStaffCharge = (me: Actor, hand: number, charge: number): void => {
  try { callNative("WornObject", "SetItemCharge", undefined, me, hand, 0, charge); } catch (e) { /* SKSE missing */ }
  try { const name = hand === 0 ? "LeftItemCharge" : "RightItemCharge"; const now = Number(me.getActorValue(name)); if (isFinite(now) && now > charge) me.damageActorValue(name, now - charge); } catch (e) { /* not there */ }
};
