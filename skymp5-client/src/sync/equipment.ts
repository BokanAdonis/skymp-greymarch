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

export const applyEquipment = (ac: Actor, eq: Equipment): boolean => {
  ac.removeAllItems(null, false, true);

  ac.unequipAll();

  ac.removeAllItems(null, false, true);

  const newInventory = removeUnnecessaryExtra(filterWorn(eq.inv), ac.getFormID() === 0x14);

  setInventory(ac.getFormID(), newInventory);

  // GREYMARCH: DUAL WIELD (2026-11-01): a left-hand step here (equipping the copy's left-hand weapon again) made a bound sword invisible on the copy
  // (a bound weapon is seen through the glow it starts with); taken out. The copy keeps what setInventory gives it.

  // GREYMARCH: ANOTHER PLAYER'S BOUND BOW (2026-11-01, the owner: invisible for everyone else, while their Bound Sword showed): a bow with no arrows cannot
  // be drawn, and a bound weapon is only seen drawn. So a copy holding a bound bow is given Bound Arrows and they are equipped, a moment after its gear
  // (setInventory is not done at once). What the copy then holds goes to the log (test).
  if (ac.getFormID() !== 0x14) {
    const hasBoundBow = newInventory.entries.some((e) => {
      if (!e.worn) return false;
      const f = Game.getFormEx(e.baseId);
      const w = f ? Weapon.from(f) : null;
      return !!w && (w.getWeaponType() === 7 || w.getWeaponType() === 9) && /^bound\b/i.test(w.getName() || "");
    });
    if (hasBoundBow) {
      const actorId = ac.getFormID();
      const due = Date.now() + 500;
      const step = () => {
        if (Date.now() < due) { once('update', step); return; }
        try {
          const a = Actor.from(Game.getFormEx(actorId));
          const arrow = Game.getFormEx(0x10b0a7); // Skyrim.esm boundArrow
          if (!a || !arrow) return;
          const had = a.getItemCount(arrow);
          if (had < 10) a.addItem(arrow, 100 - had, true);
          a.equipItem(arrow, false, true);
          const w = a.getEquippedWeapon(false);
          writeLogs("greymarch", "copy bound bow " + actorId.toString(16) + ": arrows " + had + " -> " + a.getItemCount(arrow) + ", holds " + (w ? w.getFormID().toString(16) : "none") + (a.isWeaponDrawn() ? ", drawn" : ", not drawn"));
        } catch (e) { /* the copy keeps its gear */ }
      };
      once('update', step);
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
