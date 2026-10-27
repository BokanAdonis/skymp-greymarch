#include "CropRegeneration.h"
#include "GetBaseActorValues.h"
#include "MathUtils.h"
#include "MpActor.h"
#include "MpChangeForms.h"
#include "WorldState.h"
#include "libespm/espm.h"
#include <algorithm>

namespace {

BaseActorValues GetValues(MpActor* actor)
{
  uint32_t baseId = actor->GetBaseId();
  auto appearance = actor->GetAppearance();
  uint32_t raceId = appearance ? appearance->raceId : 0;
  auto worldState = actor->GetParent();
  return GetBaseActorValues(worldState, baseId, raceId,
                            actor->GetTemplateChain());
}

}

// GREYMARCH: what the enchantments of the armour and clothing the actor wears
// add to one regeneration actor value (a robe or ring of Recovery: +N% on
// MagickaRateMult). The game regenerates that much faster; the crop below did
// not know and took the extra back every update, so the bar filled fast, then
// dropped. Only an item's own enchantment from the game files counts, and the
// worn items are the ones the server checked the player owns
// (OnUpdateEquipment), so a modified client cannot add any. Only boosts count:
// a penalty is left to the game (the crop is only a limit).
float WornRegenBonus(const MpActor& actor, espm::ActorValue av)
{
  WorldState* espmProvider = actor.GetParent();
  if (!espmProvider || av == espm::ActorValue::None) {
    return 0.f;
  }
  auto& browser = espmProvider->GetEspm().GetBrowser();
  float total = 0.f;

  for (const auto& entry : actor.GetEquipment().inv.entries) {
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
      if (effect.magnitude <= 0.f) {
        continue;
      }
      const uint32_t mgefId = enchLookup.ToGlobalId(effect.effectId);
      const auto mgefLookup = browser.LookupById(mgefId);
      if (!mgefLookup.rec || mgefLookup.rec->GetType() != espm::MGEF::kType) {
        continue;
      }
      if (espm::GetData<espm::MGEF>(mgefId, espmProvider).data.primaryAV ==
          av) {
        total += effect.magnitude;
      }
    }
  }

  return total;
}

float CropRegeneration(float newAttributeValue, float secondsAfterLastRegen,
                       float attributeRate, float attributeRateMult,
                       float oldAttributeValue, bool hasActiveMagicEffects)
{
  spdlog::trace(
    "[crop]: args=(newAttributeValue={}, secondsAfterLastRegen={}, "
    "attributerate={}, attributeRateMult={}, oldAttributeValue={}, "
    "hasActiveMagicEffects={})",
    newAttributeValue, secondsAfterLastRegen, attributeRate, attributeRateMult,
    oldAttributeValue, hasActiveMagicEffects);

  float validRegenerationPercentage =
    MathUtils::PercentToFloat(attributeRate) *
    MathUtils::PercentToFloat(attributeRateMult) * secondsAfterLastRegen;

  spdlog::trace("[crop]: validRegenerationPercentage={}",
                validRegenerationPercentage);

  validRegenerationPercentage =
    validRegenerationPercentage < 0.0f ? 0.0f : validRegenerationPercentage;
  float validAttributePercentage =
    oldAttributeValue + validRegenerationPercentage;

  spdlog::trace("[crop]: validAttributePercentage={}",
                validAttributePercentage);

  validAttributePercentage =
    validAttributePercentage > 1.0f ? 1.0f : validAttributePercentage;
  constexpr float kMaxOldPercentage = 1.f;

  spdlog::trace("[crop]: comparing received attribute value and valid one: "
                "newAttributeValue={}, validAttributePercentage={}",
                newAttributeValue, validAttributePercentage);

  if (newAttributeValue > validAttributePercentage) {
    return validAttributePercentage;
  }
  if (newAttributeValue < 0.0f) {
    return 0.0f;
  }
  // if (hasActiveMagicEffects &&
  //    !MathUtils::IsNearlyEqual(oldAttributeValue, kMaxOldPercentage)) {
  //  return validAttributePercentage;
  // }
  return newAttributeValue;
}

float CropHealthRegeneration(float newAttributeValue,
                             float secondsAfterLastRegen, MpActor* actor)
{
  const BaseActorValues baseValues = GetValues(actor);
  const ActorValues& actorValues = actor->GetActorValues();
  const float rate = std::max(baseValues.healRate, actorValues.healRate) +
    WornRegenBonus(*actor, espm::ActorValue::HealRate);
  const float rateMult =
    std::max(baseValues.healRateMult, actorValues.healRateMult) +
    WornRegenBonus(*actor,
                   espm::ActorValue::HealRateMult_or_CombatHealthRegenMultMod) +
    actor->GetRegenBonus().health;
  const float oldPercentage = actorValues.healthPercentage;
  const bool hasActiveMagicEffects = !actor->GetActiveMagicEffects().Empty();
  return CropRegeneration(newAttributeValue, secondsAfterLastRegen, rate,
                          rateMult, oldPercentage, hasActiveMagicEffects);
}

float CropMagickaRegeneration(float newAttributeValue,
                              float secondsAfterLastRegen, MpActor* actor)
{
  const BaseActorValues baseValues = GetValues(actor);
  const ActorValues& actorValues = actor->GetActorValues();
  const float rate =
    std::max(baseValues.magickaRate, actorValues.magickaRate) +
    WornRegenBonus(*actor, espm::ActorValue::MagickaRate);
  const float rateMult =
    std::max(baseValues.magickaRateMult, actorValues.magickaRateMult) +
    WornRegenBonus(*actor,
                   espm::ActorValue::
                     MagickaRateMult_or_CombatHealthRegenMultPowerMod) +
    actor->GetRegenBonus().magicka;
  const float oldPercentage = actorValues.magickaPercentage;
  const bool hasActiveMagicEffects = !actor->GetActiveMagicEffects().Empty();
  return CropRegeneration(newAttributeValue, secondsAfterLastRegen, rate,
                          rateMult, oldPercentage, hasActiveMagicEffects);
}

float CropStaminaRegeneration(float newAttributeValue,
                              float secondsAfterLastRegen, MpActor* actor)
{
  const BaseActorValues baseValues = GetValues(actor);
  const ActorValues& actorValues = actor->GetActorValues();
  const float rate = (actor->IsBlockActive()
                        ? actorValues.staminaRate
                        : std::max(baseValues.staminaRate,
                                   actorValues.staminaRate)) +
    WornRegenBonus(*actor, espm::ActorValue::StaminaRate);
  const float rateMult =
    std::max(baseValues.staminaRateMult, actorValues.staminaRateMult) +
    WornRegenBonus(*actor, espm::ActorValue::StaminaRateMult) +
    actor->GetRegenBonus().stamina;
  const float oldPercentage = actorValues.staminaPercentage;
  const bool hasActiveMagicEffects = !actor->GetActiveMagicEffects().Empty();
  return CropRegeneration(newAttributeValue, secondsAfterLastRegen, rate,
                          rateMult, oldPercentage, hasActiveMagicEffects);
}

float CropPeriodAfterLastRegen(float secondsAfterLastRegen,
                               float maxValidPeriod, float defaultPeriod)
{
  if (secondsAfterLastRegen < 0.0f) {
    return 0.0f;
  }
  if (secondsAfterLastRegen > maxValidPeriod) {
    return defaultPeriod;
  }
  return secondsAfterLastRegen;
}

float CropValue(float value, float min, float max)
{
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
