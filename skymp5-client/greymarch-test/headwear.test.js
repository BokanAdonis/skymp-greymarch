"use strict";
// A hood hides big elf ears, a mask hides the beard (2026-11-05, the owner): src/greymarch/racemenuLook.ts (what counts as a hood or a mask, the kept look
// with the big-ear sliders at 0) and bridge.ts / formView.ts (where they are used).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const load = (file) => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "exports", "module", js)(() => ({}), mod.exports, mod);
  return mod.exports;
};
const rm = load("racemenuLook.ts");
const bridgeSrc = fs.readFileSync(path.join(__dirname, "..", "src", "greymarch", "bridge.ts"), "utf8");
const viewSrc = fs.readFileSync(path.join(__dirname, "..", "src", "view", "formView.ts"), "utf8");

test("what counts as a hood or a mask, from the names of what is worn", () => {
  assert.deepStrictEqual(rm.headwearOf(["Hooded Robes", "Thieves Guild Hood"]), { hood: true, mask: false });
  assert.deepStrictEqual(rm.headwearOf(["Bog Blight Mask"]), { hood: false, mask: true });
  assert.deepStrictEqual(rm.headwearOf(["Morokei"]), { hood: false, mask: true }, "a dragon priest mask, named alone");
  assert.deepStrictEqual(rm.headwearOf(["Nightingale Hood", "Linwe's Cowl"]), { hood: true, mask: false });
  assert.deepStrictEqual(rm.headwearOf(["Iron Helmet", "Gold Ring"]), { hood: false, mask: false });
  assert.deepStrictEqual(rm.headwearOf([]), { hood: false, mask: false });
});

test("a hood puts the big-ear sliders at 0 (others stay); no hood leaves the look as it is", () => {
  const want = { morphs: { custom: [{ name: "CME_ElfEar", value: 0.8 }, { name: "NSK_ElfEarUpper", value: 0.5 }, { name: "ece_EarLarge", value: 1 }, { name: "ece_EarSmall", value: 0.3 }, { name: "NoseTip", value: 0.4 }, { name: "CME_ElfEar2", value: -0.2 }] } };
  assert.strictEqual(rm.dressLook(want, false), want);
  const d = rm.dressLook(want, true);
  assert.deepStrictEqual(d.morphs.custom.map((c) => c.value), [0, 0, 0, 0.3, 0.4, -0.2], "big ears down, small ears and the nose kept, a smaller ear kept");
  assert.strictEqual(want.morphs.custom[0].value, 0.8, "the kept look itself is not changed");
  const plain = { morphs: { custom: [{ name: "NoseTip", value: 0.4 }] } };
  assert.strictEqual(rm.dressLook(plain, true), plain, "no big ears: the same look");
  assert.strictEqual(rm.dressLook(null, true), null);
});

test("the race menu saved under a hood keeps the player's own big ears, unless they set one in the menu", () => {
  const kept = { morphs: { custom: [{ name: "CME_ElfEar", value: 0.8 }, { name: "ece_EarLarge", value: 0.6 }] } };
  const saved = { morphs: { custom: [{ name: "NoseTip", value: 0.2 }, { name: "ece_EarLarge", value: 0.3 }] } };
  const out = rm.keepEarsUnderHood(saved, kept);
  assert.deepStrictEqual(out.morphs.custom, [{ name: "NoseTip", value: 0.2 }, { name: "ece_EarLarge", value: 0.3 }, { name: "CME_ElfEar", value: 0.8 }]);
  assert.strictEqual(rm.keepEarsUnderHood(saved, { morphs: { custom: [] } }), saved, "nothing kept: as saved");
});

test("the bridge and the characters' views use it: the hood on the ears (own body and copies), the mask on the beard", () => {
  assert.match(bridgeSrc, /var want = rmMod\.dressLook\(rm\.want, this\.greymarchHeadwear\(player\)\.hood\)/);
  assert.match(bridgeSrc, /var cwant = rmMod\.dressLook\(c\.want, this\.greymarchHeadwear\(ac\)\.hood\)/);
  assert.match(bridgeSrc, /rmMod\.keepEarsUnderHood\(parts, rm\.want\)/);
  assert.match(bridgeSrc, /hp\.getType\(\) !== 4/, "the facial hair head parts");
  assert.match(bridgeSrc, /NetImmerse\.setNodeScale\(ac, s\.names\[k\], masked \? 0\.001 : 1, false\)/);
  assert.match(viewSrc, /__gmDressHead/);
  assert.ok(viewSrc.includes("gmDress(Actor.from(refr), model.appearance.headpartIds)"),"another player's beard: from the head parts their head is drawn with (2026-11-05)");
});
