# Greymarch combat overhaul: server API (fork, co-server)

## Per actor: `combatPerks`

```js
mp.set(actorId, "combatPerks", { sneak: true, jumpPower: true, blockStops: 50 });
mp.set(actorId, "combatPerks", null); // clear: plays as before (NPC behaviour)
mp.get(actorId, "combatPerks");       // the object, or null when unset
```

| Field | Type | Left out | Effect |
|---|---|---|---|
| `sneak` | bool | `true` | the table's `sneak` multiplier counts for this actor's sneak attacks (rank 3+) |
| `jumpPower` | bool | `false` | this actor's power attack while in a jump (or within 1 s after the last movement update in a jump) does x2 instead of the table's `powerAttack` (rank 5) |
| `blockStops` | number 0..100 | none | percent of a hit this actor's WEAPON block stops (40 = rank 1-4, 50 = rank 5), instead of the table's `weaponBlock` |

Unset actors (NPCs): sneak bonus counts, no jump bonus, weapon block from the table. Not saved: set it again on every spawn / rank change.

## Balance table (`mp.set(0, "greymarchBalance", json)`) additions

- `shieldStops`: `{ "<global form id>": percent stopped 0..100 }`. A shield block with that shield stops its percent (60 at tier 1 .. 70 at tier 8); a shield not listed uses `shieldBlock` (what gets through, 0..1). The defender's `blockStops` does not apply to shield blocks.
- `enchantArmorCap`: number. The most armor rating one worn piece's enchantment (DamageResist effects) adds. Left out = unchanged.
- `powerAttack` fallback when the table has none is now 1.5 (was 2).

Note: `weaponBlock` / `shieldBlock` are fractions that GET THROUGH (0.6 = 40% stopped); `shieldStops` / `blockStops` are percents STOPPED.

Weapon enchantments: the server's damage formula never added weapon enchantment damage (only base weapon + arrow), so there is nothing server-side to cap yet.
