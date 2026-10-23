// GREYMARCH: A BEAST IS NEVER BUILT AS A BEAST (2026-10-23). The decisions for a beast look's NPC on a watching game, kept apart from formView.ts so they
// can be tested without the game. formView.ts builds every beast look as a person stand-in (GM_STANDIN_RACE, hidden) and, each update, asks beastSwitchStep
// what to do; it does the SetRace and the reveal itself.
//
// Why: every crash of a watching game on 2026-10-22 (five, in five different places in the werewolf graph) came in the first seconds of a werewolf or werebear
// NPC built from scratch, the first one that game had built. The vanilla game never builds one that way mid-play: an NPC werewolf is a person whose race the
// engine switches (Actor.SetRace, its own race-switch path). A form switch (the Alpha, the pup, ...) is another SetRace on the same actor. After every switch
// the NPC is held (no SkyMP movement, animation or gear) for GM_BEAST_SETTLE_MS: a SetRace while SkyMP moved the actor crashed in its physics rebuild (2026-10-17).

export const GM_STANDIN_RACE = 0x13746; // NordRace
export const GM_STANDIN_MS = 1000; // the stand-in's 3D must be in for this long before its first switch
export const GM_STANDIN_GIVE_UP_MS = 10000; // the first switch is made even if the 3D never reports loaded
export const GM_SHOW_AFTER_MS = 1500; // the stand-in is shown this long after its first switch
export const GM_BEAST_SETTLE_MS = 6000; // held this long after every switch

export interface BeastSwitchState {
  raceApplied: number; // GM_STANDIN_RACE: not switched yet; otherwise the race it was last switched to
  spawnMoment: number;
  freshUntil: number; // held (no SkyMP movement, animation or gear) until this time
  showAt: number; // 0: nothing to show
}

export interface BeastSwitchAction {
  setRace?: number; // switch the NPC to this race now
  first?: boolean; // the stand-in's first switch
  show?: boolean; // make it visible now (alpha 1)
}

// a freshly spawned beast-look NPC: a hidden stand-in, held until it has been switched and has settled
export const beastSpawned = (now: number): BeastSwitchState => ({ raceApplied: GM_STANDIN_RACE, spawnMoment: now, freshUntil: Number.MAX_SAFE_INTEGER, showAt: 0 });

// one update: wanted is the race the player's look asks for (their form's race), loaded whether the NPC's 3D is in
export function beastSwitchStep(st: BeastSwitchState, now: number, wanted: number, loaded: boolean): BeastSwitchAction {
  const out: BeastSwitchAction = {};
  const first = st.raceApplied === GM_STANDIN_RACE;
  const canSwitch = first
    ? (loaded && now - st.spawnMoment >= GM_STANDIN_MS) || now - st.spawnMoment >= GM_STANDIN_GIVE_UP_MS
    : now >= st.freshUntil;
  if (wanted && wanted !== st.raceApplied && canSwitch) {
    out.setRace = wanted;
    out.first = first;
    st.raceApplied = wanted;
    st.freshUntil = now + GM_BEAST_SETTLE_MS;
    if (first) st.showAt = now + GM_SHOW_AFTER_MS;
  }
  if (st.showAt && now >= st.showAt) {
    st.showAt = 0;
    out.show = true;
  }
  return out;
}

// only the were-races take the stand-in path: the werewolf (Skyrim.esm WerewolfBeastRace), the werebear (Dragonborn.esm DLC2WerebearBeastRace, its id in this
// load order passed in) and the forms' races (__gmWolfRace values: the Alpha, the pup, ...). A creature form (a wolf, a horker...) is built as before.
export const GM_WEREWOLF_RACE = 0xcdd84;
export const isWereRace = (raceId: number, werebearRace: number, formRaces: number[]): boolean =>
  !!raceId && (raceId === GM_WEREWOLF_RACE || (!!werebearRace && raceId === werebearRace) || formRaces.indexOf(raceId) >= 0);

export const beastHeld = (st: BeastSwitchState | null, now: number): boolean => !!st && now < st.freshUntil;
