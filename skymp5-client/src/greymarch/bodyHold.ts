// GREYMARCH: the character select screen comes BEFORE the world loads.
//
// SkyMP loads the world the moment the server sends "this is your body" (createActor, isMe). With character select on, that body is only a waiting
// body at the spawn point: the world loaded behind the screen, SkyMP took the keyboard from the screen, and after a choice the world loaded a second time.
// Now the server says at connect that character select is on (greymarchHold). From then on the game keeps its own body's message to itself
// (networkingService) instead of loading anything, and lets the LAST one go once a character is chosen (bridge.ts): the server binds the chosen body
// just before it says "entered", so that message is the one the world loads from: once, straight into the chosen character.
//
// Safety nets: no select screen within 20 s of the hold (the server changed its mind) lets the body go at once; and the hold never applies to a game
// whose server did not ask for it.

export const SETTLE_MS = 300; // after "entered": room for the bind's message to arrive in case it comes a moment later
export const NO_SELECT_MS = 20000;

export class BodyHold {
    armed = false;
    armedAt = 0;
    selectAt = 0;
    enteredAt = 0;
    held: any = null;
    selectSeen = false;
    hasEntered = false;
    count = 0;

    // The server announced the select screen: hold from now on (a new connection starts over).
    arm(now: number): void {
        this.armed = true; this.armedAt = now; this.selectAt = 0; this.enteredAt = 0; this.selectSeen = false; this.hasEntered = false; this.held = null; this.count = 0;
    }

    // Our own body arrived. True = kept (the caller must not pass it on); the newest one wins.
    keep(event: any): boolean {
        if (!this.armed) return false;
        this.held = event;
        this.count++;
        return true;
    }
    sawSelect(now: number): void { if (this.armed && !this.selectSeen) { this.selectSeen = true; this.selectAt = now; } }
    entered(now: number): void { if (this.armed && !this.hasEntered) { this.hasEntered = true; this.enteredAt = now; } }

    // Called every tick. When the hold is over, returns why and the body to let go (null if none ever came) and stops holding.
    due(now: number): { reason: string, event: any } | null {
        if (!this.armed) return null;
        var reason = "";
        if (this.hasEntered && now - this.enteredAt >= SETTLE_MS) reason = "a character was chosen";
        else if (!this.selectSeen && !this.hasEntered && now - this.armedAt >= NO_SELECT_MS) reason = "no character select screen came within " + NO_SELECT_MS / 1000 + " s";
        if (!reason) return null;
        var event = this.held;
        this.armed = false; this.held = null;
        return { reason: reason, event: event };
    }
}

export const bodyHold = new BodyHold();
