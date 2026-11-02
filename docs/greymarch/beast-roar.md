# Another player's roar on this screen (2026-10-27)

A changed werewolf or werebear player presses R: their own game plays the vanilla howl on their body (`HowlStart`, `HowlRelease` 200 ms later), clearing
its voice recovery first, and reports `greymarchWolf op howl`. The server (launcher repo `gamemode/src/werewolf.js`) sends
`{ customPacketType: "greymarchWolfRoar", actor, bear }` to every player within 6000 units. SkyMP's own relay of the howl events is still dropped on a beast
copy (`view/formView.ts`, the "WW Howl.hkx" crash). Everything below is `greymarch/bridge.ts`: the roar queue in `greymarchWolfTick` and `greymarchWolfHowlOther`.

What a watching game does with each roar:

- **The howl on the copy** once it has settled after its race switch (`__gmBeastHeld`): the howl shout (`HowlWerewolfDetectLife` 0x0CE218) in its voice
  slot, **its voice recovery cleared**, `HowlStart`, `HowlRelease` 200 ms later.
- **One sound.** A werewolf copy that howls gets no extra sound: the howl brings its own. A werebear copy adds the bear's roar (0x0F95BB), as in the
  roarer's own game. A copy still settling, or one that is not a beast body here, gets the sound only (`NPCWerewolfShout` 0x101008 or the bear's roar).
- **One roar per copy per tick.** R has no wait (`WOLF_ROAR_MS`, `howlCooldownMs` 0), so two roars of one player can arrive together; the second is dropped.

Why (2026-10-27, read from the code; no watcher log of it yet):

- The copy's voice recovery was never cleared. After one howl the copy's voice was recovering, so the next `HowlStart` had nothing to cast: watchers saw the
  first roar, then a half-played start that snapped out at the copy's next movement. The roarer's own game had the same bug on 2026-10-23.
- The watcher played `NPCWerewolfShout` on top of the howl's own sound: two howls a beat apart, heard as a repeat.

Tests: `greymarch-test/bridge-wolf.test.js` ("watchers: ..."). Untested in game. If the copy still slides during the howl, the next suspect is
`sync/movementApply.ts` correcting the howl's root motion (translateTo / keepOffsetFromActor).
