# Ritual spells in other players' games (Greymarch)

**Symptom (fixed here):** after the ritual charge of Dragon Breath (Dragonborn.esm 0265A3, a held spell cast with both hands), nobody else
saw fire coming out of the caster's hands.

## Why (test server log, 2026-10-25)

- **The cast went out too early.** The game reports the cast when the ritual charge begins. The fire only starts about 5 s later, at the
  animation event `RitualSpellAimConcentrationStart`.
- **The cast was never ended.** A ritual plays no "equipped" animation event, which is the normal end signal for a held spell. One cast stayed
  open for 349 s, until the caster switched spells.
- **The watcher's copy of the caster held nothing.** The server refused the caster's equipment updates ("inventory does not contain item
  13790", an Iron War Axe), so no spell was in the copy's hands. A held spell does not keep burning on empty hands.

## The fix (client only)

- **Caster** (`magicSyncService.ts`, for the player's own held spells whose equip slot is BothHands, Skyrim.esm 013F45):
  - The cast waits and goes out on `RitualSpellAimConcentrationStart`. A `RitualSpellOut` before any fire (the end of the charge) does nothing.
  - `RitualSpellOut` after the fire started sends the end.
  - A second stream within 15 s goes out again from the last cast, since the game does not always report the cast twice.
  - If no fire start comes within 8 s, the cast is sent anyway, as it was before this change. A waiting cast is dropped when the hand switches
    to another spell.
- **Watcher** (`remoteServer.ts` `greymarchEquipForCast`): a held spell the copy does not hold is put in the copy's casting hand, or in both
  hands for a BothHands spell, before the cast is replayed.

Server log lines: `magic: ritual cast ... sent when its fire starts`, `magic: ritual fire ... cast sent N ms after the cast`,
`magic: end ... (RitualSpellOut)`. On the watcher's side: `saw ... cast ... put in their copy's hands`.

Tests: `skymp5-client/greymarch-test/ritual-cast.test.js`.

## Not covered

- **The refused equipment update.** When one item in the update is missing from the server's inventory, the server rejects the whole update
  (`ActionListener::OnUpdateEquipment`). The other items, the spells included, are lost with it. The real fix is server side: drop the missing
  item and keep the rest.
- The ritual event names come from one test-server log. Other ritual spells may use other events; those still fall back to the 8 s send.
