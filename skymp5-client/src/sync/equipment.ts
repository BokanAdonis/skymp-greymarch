import {
  Actor,
  Ammo,
  FormType,
  Game,
  ObjectReference,
  Spell,
  Ui,
  setInventory,
  Weapon,
  once,
  callNative,
  writeLogs,
} from 'skyrimPlatform';

import { Entry, Inventory, getInventory } from './inventory';

export const enum SpellType {
  Left,
  Right,
  Voice,
  Instant,
}

export const getEquipedSpell = (
  refr: ObjectReference,
  spellType: SpellType,
): number => {
  const actor = Actor.from(refr);

  if (!actor) {
    return 0;
  }

  switch (spellType) {
    case SpellType.Left: {
      const spell = actor.getEquippedSpell(SpellType.Left);
      return spell ? spell.getFormID() : 0;
    }
    case SpellType.Right: {
      const spell = actor.getEquippedSpell(SpellType.Right);
      return spell ? spell.getFormID() : 0;
    }
    case SpellType.Voice: {
      const spell = actor.getEquippedSpell(SpellType.Voice);
      return spell ? spell.getFormID() : 0;
    }
    case SpellType.Instant: {
      const spell = actor.getEquippedSpell(SpellType.Instant);
      return spell ? spell.getFormID() : 0;
    }
    default: {
      return 0;
    }
  }
};

export interface Equipment {
  inv: Inventory;
  leftSpell?: number;
  rightSpell?: number;
  voiceSpell?: number;
  instantSpell?: number;
  numChanges: number;
}

const filterWorn = (inv: Inventory): Inventory => {
  return { entries: inv.entries.filter((x) => x.worn || x.wornLeft) };
};

const removeUnnecessaryExtra = (inv: Inventory, ignoreAmmo: boolean): Inventory => {
  return {
    entries: inv.entries.map((x) => {
      const r: Entry = JSON.parse(JSON.stringify(x));
      r.chargePercent = r.maxCharge;
      if (ignoreAmmo) {
        r.count = Ammo.from(Game.getFormEx(x.baseId)) ? r.count : 1;
      } else {
        // GREYMARCH (2026-11-01, the owner: two Bound Swords, one in each hand, showed as one): the same weapon in both hands is one entry worn in
        // both, and a count of 1 gave the copy only one of it
        r.count = Ammo.from(Game.getFormEx(x.baseId)) ? 1000 : x.worn && x.wornLeft ? 2 : 1;
      }
      delete r.name;
      return r;
    }),
  };
};

export const getEquipment = (ac: Actor, numChanges: number): Equipment => {
  return {
    inv: getInventory(ac),
    leftSpell: getEquipedSpell(ac, SpellType.Left),
    rightSpell: getEquipedSpell(ac, SpellType.Right),
    voiceSpell: getEquipedSpell(ac, SpellType.Voice),
    instantSpell: getEquipedSpell(ac, SpellType.Instant),
    numChanges,
  };
};

export const syncSpellEquipment = (
  ac: Actor,
  spellBaseId: number | undefined,
  spellType: SpellType,
) => {
  if (spellBaseId !== undefined && spellBaseId > 0) {
    ac.equipSpell(Spell.from(Game.getFormEx(spellBaseId)), spellType);
  } else {
    const equipedSpell = ac.getEquippedSpell(spellType);

    if (equipedSpell) {
      ac.unequipSpell(equipedSpell, spellType);
    }
  }
};

const BOUND_BOW_ART = 0xe3f0c; // GREYMARCH: Skyrim.esm BoundBowFX art (EnchBoundBowFX's enchant art: the bound bow's shape)
const gmBowArtOn = new Set<number>(); // GREYMARCH: copies the bound bow's art was put on

export const applyEquipment = (ac: Actor, eq: Equipment): boolean => {
  ac.removeAllItems(null, false, true);

  ac.unequipAll();

  ac.removeAllItems(null, false, true);

  const newInventory = removeUnnecessaryExtra(filterWorn(eq.inv), ac.getFormID() === 0x14);

  setInventory(ac.getFormID(), newInventory);

  // GREYMARCH: DUAL WIELD (2026-11-01): a left-hand step here (equipping the copy's left-hand weapon again) made a bound sword invisible on the copy
  // (a bound weapon is seen through the glow it starts with); taken out. The copy keeps what setInventory gives it.

  // GREYMARCH: ANOTHER PLAYER'S BOUND BOW (2026-11-01, the owner: invisible for everyone else, while their Bound Sword showed; the copy draws, an arrow is
  // seen nocked, but no bow). The bound bow's shape is the art of its enchantment's effect (EnchBoundBowFX: BoundBowFX art, Skyrim.esm 000E3F0C), which this
  // game plays on its own player's bow but never on a copy's. So it is put on the copy with our plugin (GreymarchCam.PlayArt, the game's own ApplyArtObject)
  // for the bound bow spell's two minutes, once; when the copy's gear has no bound bow any more it is taken off (Papyrus Extender's StopArtObject).
  if (ac.getFormID() !== 0x14) {
    const actorId = ac.getFormID();
    const hasBoundBow = newInventory.entries.some((e) => {
      if (!e.worn) return false;
      const f = Game.getFormEx(e.baseId);
      const w = f ? Weapon.from(f) : null;
      return !!w && (w.getWeaponType() === 7 || w.getWeaponType() === 9) && /^bound\b/i.test(w.getName() || "");
    });
    const art = Game.getFormEx(BOUND_BOW_ART);
    if (hasBoundBow && art && !gmBowArtOn.has(actorId)) {
      gmBowArtOn.add(actorId);
      const due = Date.now() + 300;
      const step = () => {
        if (Date.now() < due) { once('update', step); return; }
        try {
          const a = Actor.from(Game.getFormEx(actorId));
          const ok = a ? callNative("GreymarchCam", "PlayArt", undefined, a, art, 120) : false;
          writeLogs("greymarch", "copy bound bow " + actorId.toString(16) + ": its art " + (ok ? "played" : "refused") + (a && a.isWeaponDrawn() ? " (drawn)" : ""));
        } catch (e) { writeLogs("greymarch", "copy bound bow " + actorId.toString(16) + ": the art could not be played: " + e); }
      };
      once('update', step);
    } else if (!hasBoundBow && art && gmBowArtOn.has(actorId)) {
      gmBowArtOn.delete(actorId);
      try { callNative("PO3_SKSEFunctions", "StopArtObject", undefined, ac, art); } catch (e) { /* it ends by itself */ }
    }
  }

  syncSpellEquipment(ac, eq.leftSpell, SpellType.Left);
  syncSpellEquipment(ac, eq.rightSpell, SpellType.Right);
  syncSpellEquipment(ac, eq.voiceSpell, SpellType.Voice);
  syncSpellEquipment(ac, eq.instantSpell, SpellType.Instant);

  return true;
};

export const isBadMenuShown = (): boolean => {
  return (
    Ui.isMenuOpen('InventoryMenu') ||
    Ui.isMenuOpen('FavoritesMenu') ||
    Ui.isMenuOpen('MagicMenu') ||
    Ui.isMenuOpen('ContainerMenu') ||
    Ui.isMenuOpen('Crafting Menu') // Actually I don't think it causes crashes
  );
};
