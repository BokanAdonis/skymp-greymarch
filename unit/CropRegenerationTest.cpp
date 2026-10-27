#include "TestUtils.hpp"
#include <catch2/catch_all.hpp>
#include <chrono>

#include "CropRegeneration.h"
#include "GetBaseActorValues.h"
#include "libespm/Loader.h"

PartOne& GetPartOne();
extern espm::Loader l;

TEST_CASE("CropRegeneration function is working correctly",
          "[CropRegeneration]")
{
  float secondsAfterLastRegen = 1.0f;
  float attributeRate = 0.7f;
  float attributeRateMult = 100.0f;
  float oldAttributeValue = 0.6f;

  float validAttributeValueRegeneration = attributeRate / 100.0f *
    attributeRateMult / 100.0f * secondsAfterLastRegen;

  float newAttributeValue =
    oldAttributeValue + validAttributeValueRegeneration;

  REQUIRE(CropRegeneration(newAttributeValue, 1.0f, 0.7f, 100.0f, 0.6f,
                           false) == newAttributeValue);
}

TEST_CASE(
  "CropRegeneration returns oldAttributeValue if regeneration is not positive",
  "[CropRegeneration]")
{
  float oldAttributeValue = 0.6f;

  float newAttributeValue = oldAttributeValue + 0.007f;

  REQUIRE(CropRegeneration(newAttributeValue, 1.0f, 0.7f, -100.0f,
                           oldAttributeValue, false) == oldAttributeValue);
}

TEST_CASE(
  "CropRegeneration returns 1 if regeneration is enough to restore attribute",
  "[CropRegeneration]")
{
  REQUIRE(CropRegeneration(1.0f, 1.0f, 5.0f, 100.0f, 0.97f, false) == 1.0f);
}

TEST_CASE("CropRegeneration returns 1 if newAttributeValue is more then 1 "
          "when oldAttributeValue = 1",
          "[CropRegeneration]")
{
  REQUIRE(CropRegeneration(1.05f, 1.0f, 5.0f, 100.0f, 1.0f, false) == 1.0f);
}

TEST_CASE("CropRegeneration returns the correct value if newAttributeValue is "
          "too large but oldAttributeValue is equal to zero",
          "[CropRegeneration]")
{
  REQUIRE(CropRegeneration(1.0f, 1.0f, 5.0f, 100.0f, 0.0f, false) == 0.05f);
}

TEST_CASE("CropPeriodAfterLastRegen returns 0 if period < 0",
          "[CropRegeneration]")
{
  REQUIRE(CropPeriodAfterLastRegen(-1.0f) == 0.0f);
}

TEST_CASE(
  "CropPeriodAfterLastRegen returns defaultPeriod if period > maxValidPeriod",
  "[CropRegeneration]")
{
  float defaultPeriod = 1.0f;
  float maxValidPeriod = 2.0f;
  REQUIRE(CropPeriodAfterLastRegen(2.5f, maxValidPeriod, defaultPeriod) ==
          1.0f);
}

TEST_CASE("CropPeriodAfterLastRegen returns correct value if period is in "
          "0...maxValidPeriod interval",
          "[CropRegeneration]")
{
  float defaultPeriod = 1.0f;
  float maxValidPeriod = 2.0f;
  REQUIRE(CropPeriodAfterLastRegen(1.3f, maxValidPeriod, defaultPeriod) ==
          1.3f);
}

TEST_CASE("CropHealthRegeneration, CropMagickaRegeneration and "
          "CropStaminaRegeneration are working correctly, regeneration is not "
          "too fast",
          "[CropRegeneration]")
{

  using namespace std::chrono_literals;

  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  uint32_t baseId = ac.GetBaseId();
  auto appearance = ac.GetAppearance();
  uint32_t raceId = appearance ? appearance->raceId : 0;
  BaseActorValues baseValues =
    GetBaseActorValues(&p.worldState, baseId, raceId, {});

  ac.SetPercentages({ 0.0f, 0.0f, 0.0f });

  auto past = std::chrono::steady_clock::now();
  auto now = past + 1s;
  ac.SetLastAttributesPercentagesUpdate(past);
  std::chrono::duration<float> timeDuration = now - past;
  float time = timeDuration.count();

  float expectedHealth =
    baseValues.healRate * baseValues.healRateMult * time / 10000.0f;
  float expectedMagicka =
    baseValues.magickaRate * baseValues.magickaRateMult * time / 10000.0f;
  float expectedStamina =
    baseValues.staminaRate * baseValues.staminaRateMult * time / 10000.0f;

  REQUIRE_THAT(CropHealthRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedHealth, 0.000001f));
  REQUIRE_THAT(CropMagickaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedMagicka, 0.000001f));
  REQUIRE_THAT(CropStaminaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedStamina, 0.000001f));

  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}

// GREYMARCH: regeneration enchantments on worn armour and clothing
namespace {
const auto kRegenTestWorn = [] {
  Inventory::ExtraData extra;
  extra.worn_ = true;
  return extra;
}();

constexpr uint32_t kRingMagickaRate03 = 0x100E59; // EnchRingMagickaRate03
constexpr uint32_t kRingHealRate03 = 0x100E51;    // EnchRingHealRate03
constexpr uint32_t kRingStaminaRate03 = 0x100E55; // EnchRingStaminaRate03
constexpr auto kHealRateMult =
  espm::ActorValue::HealRateMult_or_CombatHealthRegenMultMod;
constexpr auto kMagickaRateMult =
  espm::ActorValue::MagickaRateMult_or_CombatHealthRegenMultPowerMod;
constexpr auto kStaminaRateMult = espm::ActorValue::StaminaRateMult;
}

TEST_CASE("WornRegenBonus counts the regeneration enchantment of what is "
          "worn, and only that",
          "[CropRegeneration]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  ac.SetEquipment(Equipment());
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) == 0.f);

  // carried, not worn: nothing
  Equipment carried;
  carried.inv.entries.push_back(Inventory::Entry(kRingMagickaRate03, 1));
  ac.SetEquipment(carried);
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) == 0.f);

  Equipment magicka;
  magicka.inv.entries.push_back(
    Inventory::Entry(kRingMagickaRate03, 1, kRegenTestWorn));
  ac.SetEquipment(magicka);
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) > 0.f);
  REQUIRE(WornRegenBonus(ac, kHealRateMult) == 0.f);
  REQUIRE(WornRegenBonus(ac, kStaminaRateMult) == 0.f);

  Equipment heal;
  heal.inv.entries.push_back(
    Inventory::Entry(kRingHealRate03, 1, kRegenTestWorn));
  ac.SetEquipment(heal);
  REQUIRE(WornRegenBonus(ac, kHealRateMult) > 0.f);
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) == 0.f);

  Equipment stamina;
  stamina.inv.entries.push_back(
    Inventory::Entry(kRingStaminaRate03, 1, kRegenTestWorn));
  ac.SetEquipment(stamina);
  REQUIRE(WornRegenBonus(ac, kStaminaRateMult) > 0.f);
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) == 0.f);

  // an iron dagger has no enchantment
  Equipment dagger;
  dagger.inv.entries.push_back(Inventory::Entry(0x1397E, 1, kRegenTestWorn));
  ac.SetEquipment(dagger);
  REQUIRE(WornRegenBonus(ac, kMagickaRateMult) == 0.f);

  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}

TEST_CASE("A worn Fortify Magicka/Health/Stamina Regen enchantment lets the "
          "faster regeneration through the crop",
          "[CropRegeneration]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  uint32_t baseId = ac.GetBaseId();
  auto appearance = ac.GetAppearance();
  uint32_t raceId = appearance ? appearance->raceId : 0;
  BaseActorValues baseValues =
    GetBaseActorValues(&p.worldState, baseId, raceId, {});

  ac.SetPercentages({ 0.0f, 0.0f, 0.0f });
  ac.SetEquipment(Equipment());
  const float time = 1.0f;

  const float plainMagicka = CropMagickaRegeneration(1.0f, time, &ac);
  const float plainHealth = CropHealthRegeneration(1.0f, time, &ac);
  const float plainStamina = CropStaminaRegeneration(1.0f, time, &ac);

  Equipment eq;
  eq.inv.entries.push_back(
    Inventory::Entry(kRingMagickaRate03, 1, kRegenTestWorn));
  ac.SetEquipment(eq);
  const float magickaBonus = WornRegenBonus(ac, kMagickaRateMult);
  const float expectedMagicka = baseValues.magickaRate *
    (baseValues.magickaRateMult + magickaBonus) * time / 10000.0f;
  REQUIRE_THAT(CropMagickaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedMagicka, 0.000001f));
  REQUIRE(expectedMagicka > plainMagicka);

  // what the game regenerated with the ring is kept as it is, not pulled back
  REQUIRE_THAT(CropMagickaRegeneration(expectedMagicka * 0.99f, time, &ac),
               Catch::Matchers::WithinAbs(expectedMagicka * 0.99f, 0.000001f));
  // the ring still has a limit: more than it gives is cropped
  REQUIRE_THAT(CropMagickaRegeneration(expectedMagicka * 2.f, time, &ac),
               Catch::Matchers::WithinAbs(expectedMagicka, 0.000001f));

  Equipment heal;
  heal.inv.entries.push_back(
    Inventory::Entry(kRingHealRate03, 1, kRegenTestWorn));
  ac.SetEquipment(heal);
  const float expectedHealth = baseValues.healRate *
    (baseValues.healRateMult + WornRegenBonus(ac, kHealRateMult)) * time /
    10000.0f;
  REQUIRE_THAT(CropHealthRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedHealth, 0.000001f));
  REQUIRE(expectedHealth > plainHealth);

  Equipment stamina;
  stamina.inv.entries.push_back(
    Inventory::Entry(kRingStaminaRate03, 1, kRegenTestWorn));
  ac.SetEquipment(stamina);
  const float expectedStamina = baseValues.staminaRate *
    (baseValues.staminaRateMult + WornRegenBonus(ac, kStaminaRateMult)) *
    time / 10000.0f;
  REQUIRE_THAT(CropStaminaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedStamina, 0.000001f));
  REQUIRE(expectedStamina > plainStamina);

  ac.SetEquipment(Equipment());
  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}

TEST_CASE("The regeneration bonus the gamemode sets (a vampire rank's) lets "
          "the faster regeneration through the crop",
          "[CropRegeneration]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  uint32_t baseId = ac.GetBaseId();
  auto appearance = ac.GetAppearance();
  uint32_t raceId = appearance ? appearance->raceId : 0;
  BaseActorValues baseValues =
    GetBaseActorValues(&p.worldState, baseId, raceId, {});

  ac.SetPercentages({ 0.0f, 0.0f, 0.0f });
  ac.SetEquipment(Equipment());
  const float time = 1.0f;
  const float plainMagicka = CropMagickaRegeneration(1.0f, time, &ac);

  MpActor::RegenBonus bonus;
  bonus.magicka = 45.f;
  ac.SetRegenBonus(bonus);
  const float expectedMagicka = baseValues.magickaRate *
    (baseValues.magickaRateMult + 45.f) * time / 10000.0f;
  REQUIRE_THAT(CropMagickaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedMagicka, 0.000001f));
  REQUIRE(expectedMagicka > plainMagicka);
  // health and stamina are not touched by a magicka bonus
  const float expectedHealth =
    baseValues.healRate * baseValues.healRateMult * time / 10000.0f;
  REQUIRE_THAT(CropHealthRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(expectedHealth, 0.000001f));

  // with a worn Ring of Recovery too, both count
  Equipment eq;
  eq.inv.entries.push_back(
    Inventory::Entry(kRingMagickaRate03, 1, kRegenTestWorn));
  ac.SetEquipment(eq);
  const float both = baseValues.magickaRate *
    (baseValues.magickaRateMult + 45.f +
     WornRegenBonus(ac, kMagickaRateMult)) *
    time / 10000.0f;
  REQUIRE_THAT(CropMagickaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(both, 0.000001f));

  ac.SetRegenBonus(MpActor::RegenBonus());
  REQUIRE_THAT(CropMagickaRegeneration(1.0f, time, &ac),
               Catch::Matchers::WithinAbs(both - expectedMagicka + plainMagicka,
                                          0.000001f));

  ac.SetEquipment(Equipment());
  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}
