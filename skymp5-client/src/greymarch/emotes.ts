// GREYMARCH: the emote wheel (G). Every emote is one of the game's OWN idles (Skyrim.esm IDLE records, all in Actors\Character\Behaviors\0_Master.hkx), so no animation
// mod, FNIS or Nemesis is needed by anyone. The list is the one the "Emote" mod (Nexus 17580) offers, read from its Emote.esp; that mod cannot work on SkyMP (its spells
// play the idle from a Papyrus OnEffectStart, and SkyMP blocks Papyrus events), so the bridge plays the same idles itself (greymarchEmoteTick in bridge.ts).
//   kind "once": plays and ends by itself.   "loop": lasts until the player moves, jumps, draws a weapon or picks Stop (IdleStop_Loose).
//   "walk": a carry or walk style the player keeps while moving; ends with Stop or a drawn weapon (OffsetStop, or IdleDrunkStop for the drunk walk).
// The other players see it because SkyMP sends the player's animation events (sync/animation.ts); the server only passes them on.
//   "face": not an animation but a face (the Face group: open the mouth, bare the teeth so a vampire's fangs show, snarl, smile ...), made with the game's own
//   Actor.setExpressionOverride (a mood and its strength, 0-100) and setExpressionPhoneme (a mouth shape, 0-1). SkyMP does not send faces, so the server passes it on
//   (gamemode faces.js, the same ids). A face stays while the player moves and does other emotes; picking it again or the middle of the wheel takes it off.

export type EmoteKind = "once" | "loop" | "walk" | "face";
export interface Face { mood?: number; strength?: number; phonemes?: number[][] } // phonemes: [index, 0-1] (0 Aah, 1 BigAah, 5 Eee ...)
export interface Emote { id: string; name: string; idle: number; kind: EmoteKind; stop?: number; face?: Face }
export interface EmoteGroup { id: string; name: string; items: Emote[] }

export const IDLE_STOP = 0x10d9ee;       // IdleStop_Loose (event IdleStop): ends a loop
export const OFFSET_STOP = 0x8c0a0;      // OffsetStop: ends a carry / arms crossed
export const DRUNK_STOP = 0xcefd1;       // IdleDrunkStop (event DrunkStop)

const e = (id: string, name: string, idle: number, kind: EmoteKind, stop?: number): Emote => (stop ? { id, name, idle, kind, stop } : { id, name, idle, kind });
const f = (id: string, name: string, face: Face): Emote => ({ id, name, idle: 0, kind: "face", face });
// the moods setExpressionOverride knows: 0 anger, 1 fear, 2 happy, 3 sad, 4 surprise, 6 disgust (the dialogue faces), 15 combat anger (teeth bared), 16 combat shout

export const EMOTE_GROUPS: EmoteGroup[] = [
    { id: "greet", name: "Greet", items: [
        e("wave", "Wave", 0x3ea32, "once"), e("beckon", "Come here", 0xf6ccf, "once"), e("hey", "Hey, you", 0x6ff15, "loop"), e("welcome", "Welcome", 0xf4331, "once"),
        e("salute", "Salute", 0xf4333, "once"), e("attention", "Attention", 0xb240b, "once"), e("bow", "Bow", 0xd8735, "once"), e("surrender", "Surrender", 0x105d47, "once"),
    ] },
    { id: "face", name: "Face", items: [
        f("open", "Open mouth", { phonemes: [[1, 0.65]] }), f("fangs", "Bare fangs", { mood: 15, strength: 100, phonemes: [[5, 0.8], [1, 0.4]] }), f("snarl", "Snarl", { mood: 15, strength: 100 }),
        f("shout", "Roar", { mood: 16, strength: 100 }), f("smile", "Smile", { mood: 2, strength: 80 }), f("frown", "Angry", { mood: 0, strength: 80 }),
        f("sad", "Sad", { mood: 3, strength: 80 }), f("surprise", "Surprised", { mood: 4, strength: 80 }), f("fear", "Afraid", { mood: 1, strength: 80 }), f("disgust", "Disgusted", { mood: 6, strength: 80 }),
    ] },
    { id: "point", name: "Point & show", items: [
        e("pointclose", "Point here", 0xffa0c, "once"), e("pointmed", "Point there", 0xb8f1f, "once"), e("pointfar", "Point far", 0xb8f1e, "once"), e("lookfar", "Look far", 0x75c62, "once"),
        e("give", "Give", 0xb5e20, "once"), e("take", "Take", 0xb5e1f, "once"), e("examine", "Examine", 0x75c3d, "once"), e("showscroll", "Show a scroll", 0xf9ae7, "loop"),
    ] },
    { id: "mood", name: "Mood", items: [
        e("laugh", "Laugh", 0x75c5f, "once"), e("chuckle", "Chuckle", 0x103654, "once"), e("cheer", "Cheer", 0xf7c8c, "once"), e("exasperated", "Exasperated", 0x103655, "once"),
        e("yes", "Agree", 0x58b45, "loop"), e("no", "Disagree", 0x58b46, "loop"), e("cough", "Cough", 0xd8736, "once"), e("wipebrow", "Wipe brow", 0x977ec, "once"),
        e("nodoff", "Nod off", 0x977f1, "once"), e("nervous", "Nervous", 0x10acb1, "loop"), e("cower", "Cower", 0xefc68, "loop"),
    ] },
    { id: "revel", name: "Applaud & dance", items: [
        e("applaud", "Applaud", 0xd8731, "once"), e("applauddrunk", "Drunken applause", 0xd8732, "once"), e("applaudwild", "Wild applause", 0xd8733, "once"), e("applaudsarcastic", "Sarcastic applause", 0xe9312, "loop"),
        e("dance", "Dance", 0xf7c8a, "once"), e("dancemerry", "Merry dance", 0xf7c8b, "once"), e("danceshort", "Little dance", 0x103653, "once"), e("revel", "Revel", 0x97273, "loop"),
    ] },
    { id: "music", name: "Music & rites", items: [
        e("drum", "Drum", 0x96f8b, "loop"), e("flute", "Flute", 0x96f8c, "loop"), e("lute", "Lute", 0x96f8d, "loop"), e("hornimperial", "Imperial horn", 0xf6cce, "once"),
        e("hornnord", "Stormcloak horn", 0xf6ccd, "once"), e("bless", "Bless", 0xf4332, "once"), e("praise", "Praise", 0xf11e1, "loop"), e("skyyell", "Yell at the sky", 0xf11e3, "once"),
        e("pray", "Pray", 0x6f300, "loop"), e("teachword", "Teach a word", 0xf6ccc, "once"), e("magic", "Magic", 0x75cb8, "once"),
    ] },
    { id: "stand", name: "Stand & rest", items: [
        e("crossarms", "Cross arms", 0xff7f4, "walk", OFFSET_STOP), e("handsbehind", "Hands behind", 0xb240a, "loop"), e("loiter", "Lean right", 0xf64da, "loop"), e("loiterleft", "Lean left", 0xf64d8, "loop"),
        e("gravefront", "Mourn", 0x977ef, "loop"), e("gravebehind", "Mourn, hands behind", 0x977f0, "loop"), e("warmhands", "Warm hands", 0x2e52a, "loop"), e("warmarms", "Warm arms", 0x19793, "once"),
        e("lie", "Lie down", 0xec25a, "loop"), e("wounded1", "Wounded", 0xd873a, "loop"), e("wounded2", "Wounded, sitting", 0xb8f1a, "loop"), e("wounded3", "Wounded, lying", 0xb8f1b, "loop"),
    ] },
    { id: "work", name: "Work", items: [
        e("sweep", "Sweep", 0x640fe, "loop"), e("hoe", "Hoe the ground", 0x75cb4, "loop"), e("searchbody", "Search a body", 0xefc64, "loop"), e("searchchest", "Search a chest", 0x6ff14, "loop"),
        e("searchtable", "Search a table", 0x6ff0f, "loop"), e("browse", "Study", 0x977ed, "loop"), e("sell", "Sell", 0x89974, "loop"), e("picklock", "Pick a lock", 0xbb051, "once"),
        e("sconce", "Light a sconce", 0xa28c3, "once"), e("hitdoor", "Bang on a door", 0xabef2, "once"), e("extractor", "Dwemer extractor", 0xf3a95, "once"),
    ] },
    { id: "read", name: "Read & write", items: [
        e("readbook", "Read a book", 0xbb052, "loop"), e("turnpage", "Turn a page", 0x2ee6a, "once"), e("turnpages", "Leaf through", 0xbb053, "once"),
        e("readnote", "Read a note", 0x89975, "loop"), e("ledger", "Ledger", 0xeb5c4, "loop"), e("ledgerwrite", "Write in the ledger", 0xee3b6, "once"),
    ] },
    { id: "food", name: "Eat & drink", items: [
        e("drink", "Drink", 0xfd68b, "once"), e("mug", "Nurse a mug", 0x640fc, "loop"), e("potion", "Drink a potion", 0xd33b0, "once"), e("bread", "Eat bread", 0x64100, "loop"),
        e("goblet", "Raise a goblet", 0x103656, "loop"), e("drunk", "Drunk walk", 0xcefd0, "walk", DRUNK_STOP),
    ] },
    { id: "carry", name: "Carry", items: [
        e("pot", "Carry a pot", 0x101044, "walk", OFFSET_STOP), e("potserve", "Serve from the pot", 0x101045, "once"), e("tray", "Carry a tray", 0x107110, "walk", OFFSET_STOP),
        e("basket", "Carry a basket", 0x19925, "walk", OFFSET_STOP), e("scatter", "Scatter feed", 0xf1225, "loop"),
    ] },
    { id: "grim", name: "Grim", items: [
        e("beat", "Beat a prisoner", 0x105d46, "once"), e("cleansword", "Clean a sword", 0x3ea33, "once"), e("cutpalm", "Cut your palm", 0xaf886, "once"),
        e("stabground", "Stab the ground", 0xb8f22, "loop"), e("feast", "Feast, standing", 0xe8640, "once"), e("feastlow", "Feast, crouching", 0xe8641, "once"),
    ] },
];

export function emoteById(id: unknown): Emote | null {
    if (typeof id !== "string") return null;
    for (var g = 0; g < EMOTE_GROUPS.length; g++) for (var i = 0; i < EMOTE_GROUPS[g].items.length; i++) if (EMOTE_GROUPS[g].items[i].id === id) return EMOTE_GROUPS[g].items[i];
    return null;
}
// what the wheel page is sent (names and kinds only: the page never names an idle, it asks for an emote by its id)
export function emoteGroupsForPage(): any[] {
    return EMOTE_GROUPS.map(function (g) { return { id: g.id, name: g.name, items: g.items.map(function (x) { return { id: x.id, name: x.name, kind: x.kind }; }) }; });
}
