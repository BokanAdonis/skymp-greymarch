# Equipment update with an item the server does not have (Greymarch)

**Symptom (fixed here, server side):** one item in a player's equipment that the server's inventory does not contain made
`ActionListener::OnUpdateEquipment` refuse the whole update. The hand spells were thrown out with it, so the server and every other player
kept an old copy of what that player held, often empty hands. Held spells like Dragon Breath then showed no fire for watchers.

Test server log, 2026-10-25, two players:
`OnUpdateEquipment ff004225 - rejected equipment update: inventory does not contain item 13790` (13790 = Iron War Axe).

## Now

- Items the server's inventory does not contain are left out (`inventory does not contain item X: left out of the equipment`). The rest of
  the update is kept: the other items and the hand spells.
- The player's game gets the server's inventory, and an `UnequipItem` for each item left out. Nothing the server does not have is ever
  equipped in the server's copy.
- When anything was left out (a missing item, or a spell the server does not know the player learned), the other players get the
  equipment the server accepted, not the player's own message. When nothing was left out, the message is passed on unchanged, as before.
- Two worn armor pieces sharing a body slot still refuse the whole update, as before.

Test: `unit/PartOne_UpdateEquipmentTest.cpp`, "UpdateEquipment keeps the rest when one item is missing". It runs in the "Greymarch server
build" workflow with `run_tests` on.

The client already covers the same symptom from its side (`docs/greymarch/ritual-spells.md`): a watcher puts a held spell its copy does not
hold into the copy's hands.

## Open

Why the client has an Iron War Axe the server does not know about is not found yet. Two players have it. The old code already sent the
server's inventory back after every refusal, and the axe came back each time, so it is probably added again in the client's own game
(start save or a local script).
