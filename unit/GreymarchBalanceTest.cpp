// GREYMARCH: tests for the live balance table (GreymarchBalance.h) and the per-actor damage multiplier the gamemode sets.
#include "TestUtils.hpp"
#include <catch2/catch_all.hpp>
#include <chrono>

#include "GreymarchBalance.h"
#include "HitData.h"
#include "formulas/TES5DamageFormula.h"

PartOne& GetPartOne();

namespace {
constexpr uint32_t kIronDagger = 0x0001397E;

// the damage of one hit of the player on themselves with an iron dagger, by
// the real formula (the shared test PartOne has a fake formula that always
// deals 25, so a hit through OnHit never sees the table or the multiplier)
float OneHit(float damageMult = 1.f)
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);
  ac.SetEquipment(Equipment());
  ac.SetGreymarchDamageMult(damageMult);

  HitData hitData;
  hitData.target = 0x14;
  hitData.aggressor = 0x14;
  hitData.source = kIronDagger;
  const float damage = TES5DamageFormula{}.CalculateDamage(ac, ac, hitData);

  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
  return damage;
}

// the table is global: put it back even when a check fails, or the tests
// after this one see the changed damage
struct ResetBalanceAtEnd
{
  ~ResetBalanceAtEnd() { GreymarchBalance::Set({}); }
};
}

TEST_CASE("Greymarch: the balance table reads numbers and leaves out what is broken or out of range",
          "[Greymarch]")
{
  auto t = GreymarchBalanceTable::FromJson(nlohmann::json::parse(
    R"({"weapons":{"80254":12,"x":5,"5":-1},"armor":{"80255":30},"armorScaling":0.35,"shieldBlock":0.35,"weaponBlock":2,"sneak":"a"})"));
  REQUIRE(t.weaponDamage.size() == 1);
  REQUIRE(t.weaponDamage.at(80254) == 12.f);
  REQUIRE(t.armorRating.at(80255) == 30.f);
  REQUIRE(t.armorScaling.value() == Catch::Approx(0.35f));
  REQUIRE(t.shieldBlock.value() == Catch::Approx(0.35f));
  REQUIRE_FALSE(t.weaponBlock.has_value()); // more than 1 gets through: refused
  REQUIRE_FALSE(t.sneak.has_value());
  REQUIRE_THROWS(GreymarchBalanceTable::FromJson(nlohmann::json::parse("[1]")));
}

TEST_CASE("Greymarch: a weapon's damage comes from the live table, and the attacker's multiplier scales it",
          "[Greymarch]")
{
  ResetBalanceAtEnd reset;
  GreymarchBalance::Set({});
  const float plain = OneHit();
  REQUIRE(plain == 4.f); // the iron dagger in the game files

  GreymarchBalanceTable t;
  t.weaponDamage[kIronDagger] = 8.f; // the iron dagger does 4 in the game files
  GreymarchBalance::Set(t);
  REQUIRE_THAT(OneHit(), Catch::Matchers::WithinAbs(plain * 2.f, 0.002f));

  GreymarchBalance::Set({});
  REQUIRE_THAT(OneHit(0.5f), Catch::Matchers::WithinAbs(plain * 0.5f, 0.002f));
  REQUIRE_THAT(OneHit(), Catch::Matchers::WithinAbs(plain, 0.002f)); // an empty table plays like the game files
}
