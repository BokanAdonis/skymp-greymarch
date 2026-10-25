# Spell aim in other players' games (Greymarch)

**Symptom (fixed here):** a player faces a wall in third person and casts a frost spell or Ice Prism. On their own screen the spell is
fine, but everyone watching sees it leave from behind them and fly upward.

## Why

- The game keeps a player's aim as offsets from their body: the `AimPitchCurrent` / `AimHeadingCurrent` animation variables.
  - `Actor::GetAimAngle` = `-AimPitchCurrent`.
  - `GetAimHeading` = body heading − `AimHeadingCurrent`.
- In third person these offsets follow the point under the crosshair. When that point is right in front of the player (a wall), they swing
  round to behind and above the body. The caster's own spell still goes where they look: the game aims it from the hand at that point.
- Other games replay the cast from those numbers (`remoteServer.ts` → SkyrimPlatform `castSpellImmediate`), in two ways:
  - **Fire-and-forget spells** are launched with the cast's `aimAngle` / `aimHeading`.
  - **Held spells** (Ice Prism is a held stream of missiles, `Apocalypse - Magic of Skyrim.esp` 15E73E) ignore those angles. The copy of the
    caster aims by itself from the animation variables the cast carries, which include the same two offsets (float slots 13 and 14 in
    `AnimVariableMasterGraphIndexes.cpp`).
- Slow missiles that do not explode on contact show it clearly. Fire spells hide it by blowing up at once.

## The fix (client only, `skymp5-client/src/services/services/spellAim.ts`)

Before the player's cast goes out (`magicSyncService.ts`), an aim further than 35° from where the player looks is replaced by that look
direction (the player's angle X and Z). This covers:
- the cast's `aimAngle` / `aimHeading`;
- the animation variables sent with the cast, its once-a-second reminders, its end, and the regular animation-variable updates. There:
  - `AimPitchCurrent` = −look pitch;
  - `AimHeadingCurrent` = 0;
  - the magic arm offsets (slots 17 and 18) go back to 0.

A normal aim is sent unchanged, byte for byte. NPCs this game runs keep their own aim. The first five replacements per session are written
to the server log as `[client N] magic: aim ... replaced: game .../..., look .../... (rad)`.

Nothing on the server changes: spell damage is still checked by the server, and the aim only decides where the copy's projectile flies.

Tests: `skymp5-client/greymarch-test/spell-aim.test.js`.

## Not covered

- If the player's angle X does not follow the camera pitch in third person, a replaced aim flies level instead of up or down. It still
  goes forward, where it used to go backward.
