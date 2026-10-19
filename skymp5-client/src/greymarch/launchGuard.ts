// GREYMARCH: the game joins by itself only when the launcher's Play started it.
//
// Play puts the server's load order in place (plugins.txt, Creation Club files, sTestFile) and then writes the login the game connects with. A game
// started any other way (Vortex's Play, an SKSE shortcut, Steam) reads the plugin list as it found it, so it numbers the mods differently from the server:
// the modded armor others wear shows as nothing, and its own modded items come out wrong (2026-10-17). The login used to be good for 24 hours, so such a
// game joined anyway. Now the launcher writes WHEN it pressed Play (greymarchLaunchAt) and removes the login once Skyrim closes; a login older than
// FRESH_MS is not used, and with no login the connecting screen says to start the game with Play instead of offering SkyMP's own in-game login.
//
// A login written by an older launcher has no time: it is used as before (the auth service turns those launchers away once MIN_LAUNCHER_VERSION is set).
// Once this game has joined, it keeps using that login for every reconnect, whatever the file now says.

export const FRESH_MS = 20 * 60 * 1000; // Play to the main menu takes a few minutes at most, even on a slow PC with every mod
export const TITLE = "Start Skyrim with Play in the Greymarch launcher";
export const HINT = "This game was not started by the launcher, so its mods may not be in the server's order (modded items would show wrong or invisible). Close the game (Alt+F4) and press Play in the launcher.";

// "connect" | "stale" (a login from an earlier start) | "missing" (no login at all)
export function decide(data: any, now: number, joinedBefore: boolean): string {
    if (joinedBefore) return "connect";
    if (!data || typeof data !== "object" || !data.session) return "missing";
    if (!Object.prototype.hasOwnProperty.call(data, "greymarchLaunchAt")) return "connect";
    var at = Number(data.greymarchLaunchAt);
    if (!isFinite(at) || now - at > FRESH_MS || at - now > 60 * 1000) return "stale";
    return "connect";
}

export class LaunchGuard {
    joinedWith: any = null; // the login this game joined with
    refused = ""; // why it did not join: the connecting screen shows TITLE and HINT while this is set
}

export const launchGuard = new LaunchGuard();
