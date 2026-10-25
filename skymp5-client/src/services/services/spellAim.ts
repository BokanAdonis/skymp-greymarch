// GREYMARCH: the aim a cast is replayed with in other players' games.
//
// The game reports a player's aim as offsets from their body: the AimPitchCurrent / AimHeadingCurrent animation variables
// (Actor::GetAimAngle = -AimPitchCurrent, GetAimHeading = heading - AimHeadingCurrent). In third person they follow the point under
// the crosshair, and when that point is very close (the player faces a wall) they swing far round, to behind and above the body.
// The caster's own spell still goes where they look (the game aims it from the hand at that point), but other games replay the
// cast from those numbers: a fire-and-forget spell is launched with aimAngle / aimHeading, and a held spell (Ice Prism, Frostbite)
// is aimed by the copy itself from the same animation variables. So watchers saw it leave backwards and upwards.
//
// Before a cast or the caster's animation variables are sent, an aim further than MAX_AIM_OFFSET from where the player looks
// (their own pitch and heading) is replaced by that look direction. A normal aim is sent untouched.

// positions in the floats SkyrimPlatform sends (AnimVariableMasterGraphIndexes.cpp, floatVarIndexes)
export const AIM_FLOAT_INDEX = { aimPitchCurrent: 13, aimHeadingCurrent: 14, magicAimOffsetHeading: 17, magicAimOffsetPitch: 18 };

export const MAX_AIM_OFFSET = 35 * Math.PI / 180;

const degToRad = (d: number) => d * Math.PI / 180;

// an angle in radians brought into -PI..PI
export function wrapAngle(a: number): number {
    let r = a % (2 * Math.PI);
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    return r;
}

// lookPitch / bodyHeading in radians (the caster's angle X and Z); aimAngle / aimHeading as the game reported them
export function sanitizeAim(aimAngle: number, aimHeading: number, lookPitch: number, bodyHeading: number): { aimAngle: number, aimHeading: number, fixed: boolean } {
    const ok = Number.isFinite(aimAngle) && Number.isFinite(aimHeading)
        && Math.abs(wrapAngle(aimAngle - lookPitch)) <= MAX_AIM_OFFSET
        && Math.abs(wrapAngle(aimHeading - bodyHeading)) <= MAX_AIM_OFFSET;
    if (ok) {
        return { aimAngle, aimHeading, fixed: false };
    }
    return { aimAngle: lookPitch, aimHeading: bodyHeading, fixed: true };
}

// the floats as bytes (little-endian float32, as getAnimationVariablesFromActor gives them): the aim offsets are set to "straight where
// the player looks" when they point further than MAX_AIM_OFFSET away (the magic arm offsets go back to neutral with them)
export function sanitizeAimFloats(floatBytes: number[], lookPitch: number): { bytes: number[], fixed: boolean, pitch: number, heading: number } {
    const i = AIM_FLOAT_INDEX;
    const count = Math.floor(floatBytes.length / 4);
    if (count <= i.aimHeadingCurrent) {
        return { bytes: floatBytes, fixed: false, pitch: NaN, heading: NaN };
    }
    const view = new DataView(new Uint8Array(floatBytes).buffer);
    const pitch = view.getFloat32(i.aimPitchCurrent * 4, true);
    const heading = view.getFloat32(i.aimHeadingCurrent * 4, true);
    const ok = Number.isFinite(pitch) && Number.isFinite(heading)
        && Math.abs(wrapAngle(-pitch - lookPitch)) <= MAX_AIM_OFFSET
        && Math.abs(wrapAngle(heading)) <= MAX_AIM_OFFSET;
    if (ok) {
        return { bytes: floatBytes, fixed: false, pitch, heading };
    }
    view.setFloat32(i.aimPitchCurrent * 4, -lookPitch, true);
    view.setFloat32(i.aimHeadingCurrent * 4, 0, true);
    for (const k of [i.magicAimOffsetHeading, i.magicAimOffsetPitch]) {
        if (k < count) view.setFloat32(k * 4, 0, true);
    }
    return { bytes: Array.from(new Uint8Array(view.buffer)), fixed: true, pitch, heading };
}

// the player's look direction in radians from their angles in degrees (Papyrus GetAngleX / GetAngleZ)
export function lookFromAngles(angleXDeg: number, angleZDeg: number): { lookPitch: number, bodyHeading: number } {
    return { lookPitch: degToRad(angleXDeg || 0), bodyHeading: degToRad(angleZDeg || 0) };
}
