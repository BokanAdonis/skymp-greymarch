// GREYMARCH: how another player's cast is animated on their copy (2026-11-04: staff switch it live with /castanim, gamemode castanim.js, to find the one
// that looks like the game's own cast). The server sends { mode, ffMs } (bridge.ts keeps them in storage).
//   1 the cast switches only (bWantCast...)        2 + the cast start (BeginCast...)
//   3 + held MRh_SpellAimedStart, single shot MRh_SpellAimedConcentrationStart (the swapped set)
//   4 + held MRh_SpellAimedConcentrationStart, single shot MRh_SpellAimedStart (by their names)
//   5 the swapped set without BeginCast           6 nothing of ours
import { storage } from "skyrimPlatform";

export const castAnimMode = (): number => { const m = Number(storage["greymarchCastAnimMode"]); return m >= 1 && m <= 6 ? m : 3; };
export const castAnimFfMs = (): number => { const v = Number(storage["greymarchCastAnimFfMs"]); return v >= 200 && v <= 3000 ? v : 700; };
// what to do for a cast starting: { vars, begin, sub } (sub: the graph event, or "")
export const castAnimStart = (hand: number, held: boolean): { vars: boolean, begin: boolean, sub: string } => {
  const m = castAnimMode(), h = hand === 0 ? "MLh" : "MRh";
  const swapped = held ? "_SpellAimedStart" : "_SpellAimedConcentrationStart";
  const named = held ? "_SpellAimedConcentrationStart" : "_SpellAimedStart";
  return { vars: m !== 6, begin: m === 2 || m === 3 || m === 4, sub: m === 3 || m === 5 ? h + swapped : m === 4 ? h + named : "" };
};
// on a cast's end: CastStop too (modes 2 to 5)
export const castAnimStopEvent = (): boolean => { const m = castAnimMode(); return m >= 2 && m <= 5; };
