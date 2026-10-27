# Fall damage

Changed 2026-10-27 to make falls less dangerous.

The game works out fall damage on each player's own PC, and the client reports the lower health to the server. The server only checks that health does not rise too fast, so falls are softened with the game's own settings. `skymp5-client/src/services/services/fallDamageService.ts` sets them once the game is running.

Skyrim's formula, with height in game units (70 is about 1 m):

```
damage = ((height - fJumpFallHeightMin) * fJumpFallHeightMult) ^ fJumpFallHeightExponent
```

| Setting | Vanilla | Greymarch |
| --- | --- | --- |
| fJumpFallHeightMin | 600 (about 8.5 m) | 900 (about 13 m) |
| fJumpFallHeightMult | 0.1 | 0.07 |
| fJumpFallHeightExponent | 1.45 | 1.45 |

Roughly, before difficulty and armor:

| Drop | Vanilla | Greymarch |
| --- | --- | --- |
| 12 m | 100 | 0 |
| 20 m | 575 | 173 |
| 30 m | 1430 | 617 |
| 40 m | 2492 | 1201 |

So a short drop is now free, a 20 m drop takes about a third of what it did, and a long drop still kills.

## Changing it

1. Edit `FALL_DAMAGE_SETTINGS` in `fallDamageService.ts`.
2. Update the numbers that `skymp5-client/greymarch-test/fall-damage.test.js` checks.
3. Publish game files from `shapeshift`. The change only reaches players with new game files; nothing on the server changes.

A modified client could always skip fall damage, because the server takes the health the client reports. Making the server compute falls itself would be a separate, larger job.
