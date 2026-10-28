// @ts-nocheck
// RaceMenu's extra sliders (its .tri face morphs, sculpting, Body Scales, body morphs, overlays): SkyMP's appearance carries only the vanilla look and
// SkyMP never loads a save game, so RaceMenu's own per-character data was gone after every relog. The only full export RaceMenu has is its preset
// file (CharGen.SaveCharacterPreset -> Data/SKSE/Plugins/CharGen/Presets/<name>.jslot, read with SkyrimPlatform's readCharGenPreset). The game sends
// the RaceMenu-only sections to the server when the race menu closes (gamemode/src/racemenulook.js keeps them per character). After a relog it
// exports the look SkyMP just applied, puts the kept sections into that export and loads it back (CharGen.LoadCharacterPresetEx), so the vanilla
// parts always stay exactly what SkyMP applied. Pure functions only: the calls into the game are in bridge.ts (greymarchRaceMenuTick).

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
