#include "TES5DamageFormula.h"

#include "GreymarchBalance.h"
#include "HitData.h"
#include "MpActor.h"
#include "SpellCastData.h"
#include "WorldState.h"
#include "libespm/espm.h"
#include <algorithm>
#include <cmath>

namespace internal {

bool IsUnarmedAttack(const uint32_t sourceFormId)
{
  return sourceFormId == 0x1f4;
}

class TES5DamageFormulaImpl
{
  using Effects = std::vector<espm::Effects::Effect>;

public:
  TES5DamageFormulaImpl(const MpActor& aggressor_, const MpActor& target_,
                        const HitData& hitData_);

  [[nodiscard]] float CalculateDamage() const;

private:
  const MpActor& aggressor;
  const MpActor& target;
  const HitData& hitData;
  WorldState* espmProvider;

private:
  [[nodiscard]] float GetBaseWeaponDamage() const;
  [[nodiscard]] float GetAmmoDamage() const;
  [[nodiscard]] float CalcWeaponRating() const;
  [[nodiscard]] float CalcArmorRatingComponent(
    const Inventory::Entry& opponentEquipmentEntry) const;
  [[nodiscard]] float CalcOpponentArmorRating() const;
  [[nodiscard]] float CalcMagicEffects(const Effects& effects) const;
  [[nodiscard]] float DetermineDamageFromSource(uint32_t source) const;
  [[nodiscard]] float CalcUnarmedDamage() const;
  [[nodiscard]] float CalcArmorDamagePenalty() const;
  [[nodiscard]] bool TargetHasShield() const;
};

TES5DamageFormulaImpl::TES5DamageFormulaImpl(const MpActor& aggressor_,
                                             const MpActor& target_,
                                             const HitData& hitData_)
  : aggressor(aggressor_)
  , target(target_)
  , hitData(hitData_)
  , espmProvider(aggressor.GetParent())
{
}

float TES5DamageFormulaImpl::GetBaseWeaponDamage() const
{
  // GREYMARCH: the live balance table (the F7 Balance tab) wins over the plugin
  const auto& balance = GreymarchBalance::Get().weaponDamage;
  if (auto it = balance.find(hitData.source); it != balance.end()) {
    return it->second;
  }
  const auto weapData =
    espm::GetData<espm::WEAP>(hitData.source, espmProvider);
  if (!weapData.weapData) {
    throw std::runtime_error(
      fmt::format("no weapData for {:#x}", hitData.source));
  }
  return weapData.weapData->damage;
}

// GREYMARCH: ARROWS COUNT (2026-10-29, the owner: balance arrow damage). A shot from a bow or crossbow
// adds the damage of the arrow or bolt the shooter has equipped, as the game does: the balance table's
// number for it (the F7 Balance tab's Arrows), else the plugin's. A bash with the bow adds nothing.
float TES5DamageFormulaImpl::GetAmmoDamage() const
{
  if (hitData.isBashAttack) {
    return 0.f;
  }
  const auto weapData =
    espm::GetData<espm::WEAP>(hitData.source, espmProvider);
  if (!weapData.weapDNAM ||
      (weapData.weapDNAM->animType != espm::WEAP::AnimType::Bow &&
       weapData.weapDNAM->animType != espm::WEAP::AnimType::Crossbow)) {
    return 0.f;
  }
  const auto& balance = GreymarchBalance::Get().ammoDamage;
  for (const auto& entry : aggressor.GetEquipment().inv.entries) {
    if (entry.GetWorn() == Inventory::Worn::None ||
        espm::GetRecordType(entry.baseId, espmProvider) !=
          espm::AMMO::kType) {
      continue;
    }
    if (auto it = balance.find(entry.baseId); it != balance.end()) {
      return it->second;
    }
    const auto ammoData = espm::GetData<espm::AMMO>(entry.baseId, espmProvider);
    return ammoData.hasDamage && std::isfinite(ammoData.damage) &&
        ammoData.damage > 0.f
      ? ammoData.damage
      : 0.f;
  }
  return 0.f;
}

float TES5DamageFormulaImpl::CalcWeaponRating() const
{
  // TODO(#457): take other components into account
  return GetBaseWeaponDamage() + GetAmmoDamage();
}

float TES5DamageFormulaImpl::CalcMagicEffects(const Effects& effects) const
{
  float armorRating = 0.f;
  for (const auto& effect : effects) {
    const auto actorValueType =
      espm::GetData<espm::MGEF>(effect.effectId, espmProvider).data.primaryAV;
    if (actorValueType == espm::ActorValue::DamageResist) {
      armorRating += effect.magnitude;
    }
  }
  return armorRating;
}

float TES5DamageFormulaImpl::CalcArmorRatingComponent(
  const Inventory::Entry& opponentEquipmentEntry) const
{
  if (opponentEquipmentEntry.GetWorn() != Inventory::Worn::None &&
      espm::GetRecordType(opponentEquipmentEntry.baseId, espmProvider) ==
        espm::ARMO::kType) {
    const auto armorData =
      espm::GetData<espm::ARMO>(opponentEquipmentEntry.baseId, espmProvider);
    // TODO(#458): take other components into account
    // GREYMARCH: the live balance table (the F7 Balance tab) wins over the plugin
    const auto& balance = GreymarchBalance::Get().armorRating;
    auto it = balance.find(opponentEquipmentEntry.baseId);
    float ac = it != balance.end()
      ? it->second
      : static_cast<float>(armorData.baseRatingX100) / 100;
    if (armorData.enchantmentFormId) {
      // TODO(#632) refactor this effect with actor effect system
      const auto enchantmentData =
        espm::GetData<espm::ENCH>(armorData.enchantmentFormId, espmProvider);
      ac += CalcMagicEffects(enchantmentData.effects);
    }

    return ac;
  }
  return 0;
}

float TES5DamageFormulaImpl::CalcOpponentArmorRating() const
{
  float combinedArmorRating = 0;
  auto eq = target.GetEquipment();
  for (auto& entry : eq.inv.entries) {
    combinedArmorRating += CalcArmorRatingComponent(entry);
  }
  return combinedArmorRating;
}

float TES5DamageFormulaImpl::CalcUnarmedDamage() const
{
  const uint32_t raceId = aggressor.GetRaceId();
  return espm::GetData<espm::RACE>(raceId, espmProvider).unarmedDamage;
}

float TES5DamageFormulaImpl::DetermineDamageFromSource(uint32_t source) const
{
  return IsUnarmedAttack(source) ? CalcUnarmedDamage() : CalcWeaponRating();
}

float TES5DamageFormulaImpl::CalcArmorDamagePenalty() const
{
  // TODO(#457): weapon rating is probably not only component of incomingDamage
  // Replace this with another issue reference upon investigation
  // GREYMARCH: the live balance table (the F7 Balance tab) wins over the game settings
  const auto& balance = GreymarchBalance::Get();
  const float maxArmorRating = balance.maxArmor.has_value()
    ? *balance.maxArmor
    : espm::GetData<espm::GMST>(espm::GMST::kFMaxArmorRating, espmProvider)
        .value;
  const float armorScalingFactor = balance.armorScaling.has_value()
    ? *balance.armorScaling
    : espm::GetData<espm::GMST>(espm::GMST::kFArmorScalingFactor,
                                espmProvider)
        .value;
  return 0.01f *
    (100.f -
     std::min<float>(CalcOpponentArmorRating() * armorScalingFactor,
                     maxArmorRating));
}

// GREYMARCH: whether the target wears a shield (a block with one can stop
// more than a block with a weapon)
bool TES5DamageFormulaImpl::TargetHasShield() const
{
  for (const auto& entry : target.GetEquipment().inv.entries) {
    if (entry.GetWorn() == Inventory::Worn::None ||
        espm::GetRecordType(entry.baseId, espmProvider) != espm::ARMO::kType) {
      continue;
    }
    if (espm::GetData<espm::ARMO>(entry.baseId, espmProvider).equipSlotId >
        0) {
      return true;
    }
  }
  return false;
}

float TES5DamageFormulaImpl::CalculateDamage() const
{
  const auto& balance = GreymarchBalance::Get();
  const float incomingDamage = DetermineDamageFromSource(hitData.source);

  // TODO(#461): add difficulty multiplier
  float damage = incomingDamage * CalcArmorDamagePenalty();

  if (hitData.isPowerAttack) {
    damage *= balance.powerAttack.value_or(2.f);
  }

  if (hitData.isHitBlocked) {
    // GREYMARCH: what gets through a block comes from the balance table,
    // apart for a shield and a weapon (0.1 = the old placeholder)
    const auto& through =
      TargetHasShield() ? balance.shieldBlock : balance.weaponBlock;
    damage *= through.value_or(0.1f);
  }

  if (hitData.isSneakAttack) {
    damage *= balance.sneak.value_or(1.3f);
  }

  // GREYMARCH: the attacker's own multiplier, set by the gamemode (a weapon
  // above their rank or not of their skill, the werewolf form, a Brawler's
  // fists): mp.set(actorId, "damageMult", x). 1 when nothing was set.
  damage *= aggressor.GetGreymarchDamageMult();

  return damage;
}

class TES5SpellDamageFormulaImpl
{
  using Effects = std::vector<espm::Effects::Effect>;

public:
  TES5SpellDamageFormulaImpl(const MpActor& aggressor_, const MpActor& target_,
                             const SpellCastData& spellCastData_);

  [[nodiscard]] float CalculateDamage() const;

private:
  const MpActor& aggressor;
  const MpActor& target;
  const SpellCastData& spellCastData;
  WorldState* espmProvider;

private:
  [[nodiscard]] float GetBaseSpellDamage() const;
  [[nodiscard]] float TargetResistance(espm::ActorValue av) const;
};

TES5SpellDamageFormulaImpl::TES5SpellDamageFormulaImpl(
  const MpActor& aggressor_, const MpActor& target_,
  const SpellCastData& spellCastData_)
  : aggressor(aggressor_)
  , target(target_)
  , spellCastData(spellCastData_)
  , espmProvider(aggressor.GetParent())
{
}

// GREYMARCH: the target's resistance to one actor value, in percent: the
// abilities of their race and of their base record (a Nord's frost, a Dunmer's
// fire, a Breton's magic) and the enchantments of what they wear. Effect and
// enchantment ids inside a record are local to its file and are converted.
float TES5SpellDamageFormulaImpl::TargetResistance(espm::ActorValue av) const
{
  if (av == espm::ActorValue::None) {
    return 0.f;
  }
  auto& browser = espmProvider->GetEspm().GetBrowser();
  float total = 0.f;

  auto effectIs = [&](uint32_t mgefId) {
    const auto mgefLookup = browser.LookupById(mgefId);
    return mgefLookup.rec && mgefLookup.rec->GetType() == espm::MGEF::kType &&
      espm::GetData<espm::MGEF>(mgefId, espmProvider).data.primaryAV == av;
  };

  auto addAbility = [&](uint32_t spellId) {
    const auto spellLookup = browser.LookupById(spellId);
    if (!spellLookup.rec || spellLookup.rec->GetType() != espm::SPEL::kType) {
      return;
    }
    const auto data = espm::GetData<espm::SPEL>(spellId, espmProvider);
    if (!data.spellItem ||
        data.spellItem->type != espm::SPEL::SpellType::Ability) {
      return;
    }
    for (const auto& effect : data.effects) {
      if (effect.effectItem &&
          effectIs(spellLookup.ToGlobalId(effect.effectFormId))) {
        total += effect.effectItem->magnitude;
      }
    }
  };

  const uint32_t raceId = target.GetRaceId();
  const auto raceLookup = browser.LookupById(raceId);
  if (raceLookup.rec && raceLookup.rec->GetType() == espm::RACE::kType) {
    for (auto raw : espm::GetData<espm::RACE>(raceId, espmProvider).spells) {
      addAbility(raceLookup.ToGlobalId(raw));
    }
  }

  const uint32_t baseId = target.GetBaseId();
  const auto npcLookup = browser.LookupById(baseId);
  if (npcLookup.rec && npcLookup.rec->GetType() == espm::NPC_::kType) {
    for (auto raw : espm::GetData<espm::NPC_>(baseId, espmProvider).spells) {
      addAbility(npcLookup.ToGlobalId(raw));
    }
  }

  for (const auto& entry : target.GetEquipment().inv.entries) {
    if (entry.GetWorn() == Inventory::Worn::None) {
      continue;
    }
    const auto armorLookup = browser.LookupById(entry.baseId);
    if (!armorLookup.rec || armorLookup.rec->GetType() != espm::ARMO::kType) {
      continue;
    }
    const auto armor = espm::GetData<espm::ARMO>(entry.baseId, espmProvider);
    if (!armor.enchantmentFormId) {
      continue;
    }
    const uint32_t enchId = armorLookup.ToGlobalId(armor.enchantmentFormId);
    const auto enchLookup = browser.LookupById(enchId);
    if (!enchLookup.rec || enchLookup.rec->GetType() != espm::ENCH::kType) {
      continue;
    }
    for (const auto& effect :
         espm::GetData<espm::ENCH>(enchId, espmProvider).effects) {
      if (effectIs(enchLookup.ToGlobalId(effect.effectId))) {
        total += effect.magnitude;
      }
    }
  }

  return total;
}

float TES5SpellDamageFormulaImpl::GetBaseSpellDamage() const
{
  auto& browser = espmProvider->GetEspm().GetBrowser();
  const auto spellLookup = browser.LookupById(spellCastData.spell);
  if (!spellLookup.rec || spellLookup.rec->GetType() != espm::SPEL::kType) {
    return 0.f;
  }

  const auto spellData =
    espm::GetData<espm::SPEL>(spellCastData.spell, espmProvider);

  // the most a resistance can take off, as in the game
  constexpr float kMaxResistPercent = 85.f;
  auto factor = [&](float percent) {
    return 1.f - std::clamp(percent, 0.f, kMaxResistPercent) / 100.f;
  };
  const float magicFactor =
    factor(TargetResistance(espm::ActorValue::MagicResist));

  float damage = 0.f;

  for (const auto& effect : spellData.effects) {

    if (!effect.effectItem || effect.effectFormId == 0) {
      continue;
    }

    // GREYMARCH: the effect id is local to the spell's file (a mod's own
    // effect, like Mysticism's, was looked up under the wrong id)
    const uint32_t mgefId = spellLookup.ToGlobalId(effect.effectFormId);
    const auto mgefLookup = browser.LookupById(mgefId);
    if (!mgefLookup.rec || mgefLookup.rec->GetType() != espm::MGEF::kType) {
      continue;
    }

    auto magicEffect = espm::GetData<espm::MGEF>(mgefId, espmProvider);

    // GREYMARCH: a hidden effect with conditions is a perk's extra (the
    // server cannot check its conditions). The vanilla Disintegrate perk
    // effect (200 Health, only with the perk on a nearly dead target) made
    // Sparks, Lightning Storm and Chain Lightning hit for 200 more every hit.
    // Visible damage effects with a condition (Mysticism's frost) still count.
    if (magicEffect.hasConditions &&
        magicEffect.data.IsFlagSet(espm::MGEF::Flags::HideInUI)) {
      continue;
    }

    const bool needAddDamage =
      magicEffect.data.IsFlagSet(espm::MGEF::Flags::Hostile) ||
      magicEffect.data.IsFlagSet(espm::MGEF::Flags::Detrimental);

    if (needAddDamage &&
        magicEffect.data.primaryAV == espm::ActorValue::Health) {
      // GREYMARCH: the target's resistance to this effect (fire, frost,
      // shock...) and their magic resistance, each at most 85%
      const auto resistAv = magicEffect.data.resistValue;
      const float elementFactor = resistAv == espm::ActorValue::MagicResist
        ? 1.f
        : factor(TargetResistance(resistAv));
      damage += effect.effectItem->magnitude * elementFactor * magicFactor;
    }
  }
  return damage;
}

float TES5SpellDamageFormulaImpl::CalculateDamage() const
{
  return GetBaseSpellDamage();
}

}

float TES5DamageFormula::CalculateDamage(const MpActor& aggressor,
                                         const MpActor& target,
                                         const HitData& hitData) const
{
  return internal::TES5DamageFormulaImpl(aggressor, target, hitData)
    .CalculateDamage();
}

float TES5DamageFormula::CalculateDamage(
  const MpActor& aggressor, const MpActor& target,
  const SpellCastData& spellCastData) const
{
  return internal::TES5SpellDamageFormulaImpl(aggressor, target, spellCastData)
    .CalculateDamage();
}
