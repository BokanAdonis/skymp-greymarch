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

// THE HEIGHT IN A KEPT LOOK (2026-11-07, the owner: heights not always right when someone's character is first drawn): RaceMenu's Height is a scale on the
// skeleton's NPC node under its key RSMPlugin (NiOverride value 20), third person; 1 when the look keeps none. The same reading as gamemode raceheights.js heightOf.
export const HEIGHT_NODE = "NPC";
export const HEIGHT_KEY = "RSMPlugin";
export function heightOfLook(look: any): number {
    var ts: any[] = look && Array.isArray(look.transforms) ? look.transforms : [];
    for (var i = 0; i < ts.length; i++) {
        var t = ts[i];
        if (!t || t.node !== HEIGHT_NODE || t.firstPerson) continue;
        var keys: any[] = Array.isArray(t.keys) ? t.keys : [];
        for (var j = 0; j < keys.length; j++) {
            if (!keys[j] || keys[j].name !== HEIGHT_KEY || !Array.isArray(keys[j].values)) continue;
            for (var v = 0; v < keys[j].values.length; v++) { var x = keys[j].values[v]; if (x && x.key === 20 && typeof x.data === "number" && x.data > 0) return x.data; }
        }
    }
    return 1;
}

// HEIGHT KEPT APART FROM THE PRESETS (2026-11-10, the owner: people not seeing players' proper height, players not seeing their own, one Height slider reset).
// A kept look is put on with a RaceMenu preset load, and that wrote the Height too (sometimes an older one), while the Height checks wrote the server's: the
// two took turns (a game's log: a copy at 0.979, then 0.306, then 0.979 ...). Now a preset load carries the body's Height as it is (keepHeight), and only the
// Height checks change it. heightInLook: the Height a look keeps, null when it keeps none (heightOfLook says 1 then).
export function heightInLook(look: any): number | null {
    var ts: any[] = look && Array.isArray(look.transforms) ? look.transforms : [];
    for (var i = 0; i < ts.length; i++) {
        var t = ts[i];
        if (!t || t.node !== HEIGHT_NODE || t.firstPerson) continue;
        var keys: any[] = Array.isArray(t.keys) ? t.keys : [];
        for (var j = 0; j < keys.length; j++) {
            if (!keys[j] || keys[j].name !== HEIGHT_KEY || !Array.isArray(keys[j].values)) continue;
            for (var v = 0; v < keys[j].values.length; v++) { var x = keys[j].values[v]; if (x && x.key === 20 && typeof x.data === "number" && x.data > 0) return x.data; }
        }
    }
    return null;
}
// the look without its Height (the NPC node's RSMPlugin keys, third and first person); a transform left with no keys goes
export function withoutHeight(look: any): any {
    if (!look || !Array.isArray(look.transforms)) return look;
    var out: any = JSON.parse(JSON.stringify(look));
    out.transforms = out.transforms.map(function (t: any) {
        if (!t || t.node !== HEIGHT_NODE || !Array.isArray(t.keys)) return t;
        var c: any = Object.assign({}, t);
        c.keys = t.keys.filter(function (k: any) { return !(k && k.name === HEIGHT_KEY); });
        return c;
    }).filter(function (t: any) { return !(t && t.node === HEIGHT_NODE && Array.isArray(t.keys) && t.keys.length === 0); });
    return out;
}
// the look with the Height entries of `body` (what the body has now) in place of its own: a preset load built from it leaves the Height as it is
export function keepHeight(look: any, body: any): any {
    var out: any = withoutHeight(look) || {};
    out = JSON.parse(JSON.stringify(out));
    var ts: any[] = body && Array.isArray(body.transforms) ? body.transforms : [];
    var mine: any[] = [];
    ts.forEach(function (t: any) {
        if (!t || t.node !== HEIGHT_NODE || !Array.isArray(t.keys)) return;
        var keys = t.keys.filter(function (k: any) { return k && k.name === HEIGHT_KEY; });
        if (keys.length) mine.push(Object.assign({}, t, { keys: JSON.parse(JSON.stringify(keys)) }));
    });
    out.transforms = (Array.isArray(out.transforms) ? out.transforms : []).concat(mine);
    return out;
}
// PRESETS CARRY THE SERVER'S HEIGHT (2026-11-11, the owner: heights not seen; the live log: a copy put at 0.714, then back at 1 a few seconds later when its
// preset was loaded, then put on again). The server's Height is the saved one now (HEIGHT HARD SAVED, gamemode racemenulook.js), so a preset built from the
// server's look carries it; only a look that keeps no Height takes the body's (keepHeight), so a preset load never changes it.
export function withServerHeight(look: any, body: any): any {
    return heightInLook(look) !== null ? look : keepHeight(look, body);
}
