# Greymarch combat overhaul: client packet (fork, co-client)

The gamemode sends to the player (custom packet, let through in authService.ts):

```js
{ customPacketType: "greymarchCombatPerks", blockSpeed: true, bowSpeed: false, fastDraw: false }
```
(send it the way greymarchCombatMod is sent.)

| Field | Rank | What the client does |
|---|---|---|
| `blockSpeed` | One/Two Handed rank 4+ | adds the game's Block Runner perk (Skyrim.esm 0x106253: graph var bPerkShieldCharge, NPC_Blocking_ShieldCharge_MT = full run speed while blocking) |
| `bowSpeed` | Bowman rank 4+ | adds Ranger (0x058F63: bPerkQuickShot, NPC_BowDrawn_QuickShot_MT = full run speed with a bow drawn) |
| `fastDraw` | Bowman rank 5 | adds Quick Shot (0x105F19: draws a bow 30% faster) |

Only `true` counts; anything else is false. A false field removes the perk only if this client added it. Send it on entering the world
and on every rank change (send all three each time). Rechecked every 5 s while any is true.
Pair with the server's `mp.set(actorId, "combatPerks", ...)` (co-server docs/GREYMARCH-COMBAT-PERKS.md).
