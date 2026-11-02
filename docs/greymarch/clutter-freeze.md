# Clutter stays put

2026-11-02, the owner: "I don't want players to run over a table and knock everything off."

Each game moves loose objects with its own physics. A player running or fighting through a table sent the plates, tankards and food flying in their game, and the server never knew.

`skymp5-client/src/services/services/clutterFreezeService.ts` makes every loose object keyframed (no physics: bumping it does nothing) when its 3D loads. It listens to the `objectLoaded` event, which fires again whenever a cell reloads, and handles the reference on the next update, at most 150 a frame.

- Loose objects: misc items, food and ingredients, potions, books, weapons, armor, keys, soul gems, scrolls, ammo, lights, and movable statics (baskets, buckets). Furniture, statics, containers and people are not touched.
- World objects (from plugins) freeze at once. Items made while playing (a dropped item, ids from `0xff000000`) freeze 3 s later, so they fall to the ground first.
- Items are still picked up with E. Z (grab) no longer drags clutter.
- Off switch: the server sends `{ customPacketType: "greymarchClutterFreeze", on: false }` (the gamemode does this while `greymarch-data/clutter-freeze.off` exists); `on: true` turns it back on. Turning it off stops freezing new loads; what is frozen stays so until its cell loads again.

Test: `skymp5-client/greymarch-test/clutter-freeze.test.js`. Ships with Publish game files.
