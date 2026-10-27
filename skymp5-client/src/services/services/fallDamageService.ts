// GREYMARCH: gentler fall damage (2026-10-27).
//
// The game works out fall damage on the player's own PC and the client reports the lower health to the server, which only checks
// that health does not rise too fast. So falls are softened with the game's own settings, once the game is running:
//   damage = ((height - fJumpFallHeightMin) * fJumpFallHeightMult) ^ fJumpFallHeightExponent   (height in game units, 70 = 1 m)
// A fall shorter than the minimum does nothing; past it, damage grows with the multiplier and exponent. The exponent is kept, so a
// long drop still kills. Vanilla is 600 / 0.1 / 1.45.
import { ClientListener, Sp, CombinedController } from "./clientListener";

export const FALL_DAMAGE_SETTINGS: Record<string, number> = {
    fJumpFallHeightMin: 900, // no damage below about 13 m (vanilla 600, about 8.5 m)
    fJumpFallHeightMult: 0.07, // vanilla 0.1
    fJumpFallHeightExponent: 1.45, // vanilla, unchanged
};

export class FallDamageService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        this.controller.once("update", () => this.onceUpdate());
    }

    private onceUpdate() {
        for (const [name, value] of Object.entries(FALL_DAMAGE_SETTINGS)) {
            this.sp.Game.setGameSettingFloat(name, value);
        }
    }
}
