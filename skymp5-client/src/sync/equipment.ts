import {
  Actor,
  Ammo,
  FormType,
  Game,
  ObjectReference,
  Spell,
  Ui,
  setInventory,
  writeLogs,
  once,
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

const DUAL_LEFT_DELAY_MS = 400; // GREYMARCH: the copy's left hand is equipped this long after its gear (see applyEquipment)
let gmDualLogsLeft = 20; // GREYMARCH: dual-wield breadcrumbs in greymarch-logs.txt (test)
const gmDualLog = (t: string) => { if (gmDualLogsLeft-- > 0) { try { writeLogs("greymarch", t); } catch (e) { /* no log */ } } };

export const applyEquipment = (ac: Actor, eq: Equipment): boolean => {
  ac.removeAllItems(null, false, true);

  ac.unequipAll();

  ac.removeAllItems(null, false, true);

  const newInventory = removeUnnecessaryExtra(filterWorn(eq.inv), ac.getFormID() === 0x14);

  setInventory(ac.getFormID(), newInventory);

  // GREYMARCH: DUAL WIELD (2026-11-01, the owner: two Bound Swords, one in each hand, showed as one). The server sends the same weapon in both hands as
  // two entries, one worn right and one worn left ("58f5f x1 L, 58f5f x1 R" in the log), and setInventory left the copy one of it, in the right hand.
  // A weapon worn left is put in the left hand here: the copy is given a second one when the right hand holds the same, and it is equipped to the left.
  // TEST 2 (2026-11-01: the right sword showed, the left one was held but not seen; the log said the copy held 0 swords at this point, so setInventory
  // is not done yet here): the left hand is done DUAL_LEFT_DELAY_MS later, once the copy has its gear, and on its own: a second one is added if needed,
  // and it is equipped to the left hand only (unequipped first when it is there already, so its look starts fresh). The right hand is never touched.
  if (ac.getFormID() !== 0x14) {
    const actorId = ac.getFormID();
    const lefts = newInventory.entries
      .filter((e) => e.wornLeft)
      .map((e) => ({ baseId: e.baseId, bothHands: newInventory.entries.some((x) => x.baseId === e.baseId && x.worn) }));
    if (lefts.length) {
      const due = Date.now() + DUAL_LEFT_DELAY_MS;
      const step = () => {
        if (Date.now() < due) { once('update', step); return; }
        try {
          const a = Actor.from(Game.getFormEx(actorId));
          if (!a) return;
          for (const left of lefts) {
            const f = Game.getFormEx(left.baseId);
            if (!f || f.getType() !== FormType.Weapon) continue;
            const had = a.getItemCount(f);
            if (left.bothHands && had < 2) a.addItem(f, 2 - had, true);
            const l0 = a.getEquippedWeapon(true);
            if (l0 && l0.getFormID() === f.getFormID()) a.unequipItemEx(f, 2, false);
            a.equipItemEx(f, 2, false, false); // 2: the left hand only
            const r = a.getEquippedWeapon(false), l = a.getEquippedWeapon(true);
            gmDualLog("dual " + actorId.toString(16) + ": " + left.baseId.toString(16) + (left.bothHands ? " both hands" : " left") + ", had " + had + ", now " + a.getItemCount(f) + "; right " + (r ? r.getFormID().toString(16) : "none") + ", left " + (l ? l.getFormID().toString(16) : "none") + (l0 ? " (left was held: equipped again)" : ""));
          }
        } catch (e) { gmDualLog("dual failed: " + e); }
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
