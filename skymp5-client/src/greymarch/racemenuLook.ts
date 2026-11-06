// @ts-nocheck
// RaceMenu's extra sliders (its .tri face morphs, sculpting, Body Scales, body morphs, overlays): SkyMP's appearance carries only the vanilla look and
// SkyMP never loads a save game, so RaceMenu's own per-character data was gone after every relog. The only full export RaceMenu has is its preset
// file (CharGen.SaveCharacterPreset -> Data/SKSE/Plugins/CharGen/Presets/<name>.jslot, read with SkyrimPlatform's readCharGenPreset). The game sends
// the RaceMenu-only sections to the server when the race menu closes (gamemode/src/racemenulook.js keeps them per character). After a relog it
// exports the look SkyMP just applied, puts the kept sections into that export and loads it back (CharGen.LoadCharacterPresetEx), so the vanilla
// parts always stay exactly what SkyMP applied. Pure functions only: the calls into the game are in bridge.ts (greymarchRaceMenuTick).

export const COPY_PRESET_NAME = "greymarch-copy"; // the scratch file for another player's copy (OTHERS SEE THEM)
export const PRESET_NAME = "greymarch-look"; // the one scratch file this uses (written before every load, so nothing stale is ever loaded)
export const APPLY_ALL = 15; // PresetInterface::kPresetApplyAll: the face (always) + overrides, body morphs, transforms, skin overrides

// The RaceMenu-only sections of a preset, in the order RaceMenu writes them. Empty sections are left out, so "nothing" is {}.
export function pickRaceMenuParts(preset: any): any {
    var out: any = {};
    if (!preset || typeof preset !== "object") return out;
    var m = preset.morphs && typeof preset.morphs === "object" ? preset.morphs : {};
    var custom = Array.isArray(m.custom) ? m.custom.filter(function (c: any) { return c && c.value !== 0; }) : [];
    var sculpt = Array.isArray(m.sculpt) ? m.sculpt : [];
    if (custom.length || sculpt.length) {
        out.morphs = {};
        if (custom.length) out.morphs.custom = custom;
        if (sculpt.length) { out.morphs.sculpt = sculpt; out.morphs.sculptDivisor = m.sculptDivisor; }
    }
    ["transforms", "bodyMorphs", "overrides", "skinOverrides"].forEach(function (k) {
        if (Array.isArray(preset[k]) && preset[k].length) out[k] = preset[k];
    });
    return out;
}

// A preset of the look the player has now, with its RaceMenu-only sections replaced by the kept ones (all of them: a section the kept look does not
// have is emptied, so a body reused from another character loses that character's sliders).
export function spliceRaceMenuParts(current: any, kept: any): any {
    var out: any = JSON.parse(JSON.stringify(current || {}));
    var k = kept && typeof kept === "object" ? kept : {};
    var km = k.morphs || {};
    out.morphs = out.morphs && typeof out.morphs === "object" ? out.morphs : {};
    out.morphs.custom = Array.isArray(km.custom) ? km.custom : [];
    out.morphs.sculpt = Array.isArray(km.sculpt) ? km.sculpt : [];
    if (km.sculptDivisor) out.morphs.sculptDivisor = km.sculptDivisor;
    ["transforms", "bodyMorphs", "overrides", "skinOverrides"].forEach(function (s) { out[s] = Array.isArray(k[s]) ? k[s] : []; });
    return out;
}

// Same RaceMenu parts? Key order ignored (RaceMenu writes keys sorted, the server in its own order), numbers to 4 decimals (RaceMenu writes floats).
export function sameRaceMenuParts(a: any, b: any): boolean {
    var norm = function (v: any): any {
        if (typeof v === "number") return Math.round(v * 10000) / 10000;
        if (Array.isArray(v)) return v.map(norm);
        if (v && typeof v === "object") { var o: any = {}; Object.keys(v).sort().forEach(function (k) { o[k] = norm(v[k]); }); return o; }
        return v;
    };
    return JSON.stringify(norm(pickRaceMenuParts(a))) === JSON.stringify(norm(pickRaceMenuParts(b)));
}

// DRESSED FOR A HOOD AND A MASK (2026-11-05, the owner: "make it so mask hides beards and hoods hides ears if they are big", the ears from a RaceMenu slider).
// A hood worn: RaceMenu's big-ear sliders (CME_ElfEar, NSK_ElfEarUpper, ece_EarLarge, from RaceMenu.bsa's head morphs) are put on at 0, so the ears stay
// under the hood; taken off, they come back. A mask worn: the beard is hidden (bridge.ts greymarchBeard). What counts as a hood or a mask is read from the
// names of what is worn on the head and face.
export const EAR_BIG = /(elf.?ears?|ears?.?large|ears?.?upper|ears?.?size|ears?.?tip)/i;
export const HOOD = /\b(hoods?|cowls?)\b/i;
export const MASK = /\b(masks?|masque|bandana|veil|balaclava|face ?wrap|face ?cover|morokei|konahrik|nahkriin|vokun|volsung|hevnoraak|otar|rahgot|krosis|miraak)\b/i;
// the worn slots looked at: 30 head, 31 hair, 41 long hair, 42 circlet, 43 ears, 44, 45, 46, 47, 52, 55, 56, 57 (where mods put masks and hoods); not the body
export const HEAD_SLOTS = [0x1, 0x2, 0x800, 0x1000, 0x2000, 0x4000, 0x8000, 0x10000, 0x20000, 0x400000, 0x2000000, 0x4000000, 0x8000000];
export function headwearOf(names: string[]): { hood: boolean, mask: boolean } {
    var hood = false, mask = false;
    (names || []).forEach(function (n: any) { var s = String(n || ""); if (HOOD.test(s)) hood = true; if (MASK.test(s)) mask = true; });
    return { hood: hood, mask: mask };
}
// the kept look with the big-ear sliders at 0 while a hood is worn (the same object when there is nothing to change)
export function dressLook(want: any, hooded: boolean): any {
    if (!hooded || !want || !want.morphs || !Array.isArray(want.morphs.custom)) return want;
    var changed = false;
    var custom = want.morphs.custom.map(function (c: any) {
        if (c && typeof c.name === "string" && EAR_BIG.test(c.name) && typeof c.value === "number" && c.value > 0) { changed = true; return Object.assign({}, c, { value: 0 }); }
        return c;
    });
    if (!changed) return want;
    var out: any = JSON.parse(JSON.stringify(want));
    out.morphs.custom = custom;
    return out;
}
// The race menu opened while the hood had the ears down: what it saves keeps the player's own big-ear sliders, unless they set one themselves in the menu
// (an ear slider still at 0 in the save is taken as untouched and the kept value goes back).
export function keepEarsUnderHood(saved: any, kept: any): any {
    var km = kept && kept.morphs && Array.isArray(kept.morphs.custom) ? kept.morphs.custom : [];
    var ears = km.filter(function (c: any) { return c && typeof c.name === "string" && EAR_BIG.test(c.name) && typeof c.value === "number" && c.value > 0; });
    if (!ears.length) return saved;
    var out: any = JSON.parse(JSON.stringify(saved || {}));
    out.morphs = out.morphs && typeof out.morphs === "object" ? out.morphs : {};
    var custom: any[] = Array.isArray(out.morphs.custom) ? out.morphs.custom : [];
    ears.forEach(function (k: any) {
        var cur = custom.filter(function (c: any) { return c && c.name === k.name; })[0];
        if (!cur) custom.push({ name: k.name, value: k.value });
        else if (!cur.value) cur.value = k.value;
    });
    out.morphs.custom = custom;
    return out;
}
