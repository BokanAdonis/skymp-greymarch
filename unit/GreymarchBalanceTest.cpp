// GREYMARCH: tests for the live balance table (GreymarchBalance.h) and the per-actor damage multiplier the gamemode sets.
#include "TestUtils.hpp"
#include <catch2/catch_all.hpp>
#include <chrono>

#include "ActionListener.h"
#include "GreymarchBalance.h"
#include "HitMessage.h"
#include "formulas/TES5DamageFormula.h"

PartOne& GetPartOne();
using namespace std::chrono_literals;

namespace {
constexpr uint32_t kIronDagger = 0x0001397E;

// puts the game files' table back when a test ends, even a failed one: the table is shared by every test after it
struct BalanceReset
{
  ~BalanceReset() { GreymarchBalance::Set({}); }
};

// one hit of the player on themselves with an iron dagger: how much of their health it took (0..1)
float OneHit(float damageMult = 1.f)
{
  PartOne& p = GetPartOne();
  // GetPartOne's own formula deals 25 every hit; this test is about the real one
  p.SetDamageFormula(std::make_unique<TES5DamageFormula>());
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);
  ac.SetGreymarchDamageMult(damageMult);

  RawMessageData rawMsgData;
  rawMsgData.userId = 0;
  HitMessage hitMsg;
  hitMsg.data.target = 0x14;
  hitMsg.data.aggressor = 0x14;
  hitMsg.data.source = kIronDagger;
  ac.AddItem(hitMsg.data.source, 1);
  // the server only lets a weapon hit land when the weapon is in the hand (OnHit checks the equipment)
  Inventory::ExtraData worn;
  worn.worn_ = true;
  Equipment eq;
  eq.inv.entries.push_back(Inventory::Entry(kIronDagger, 1, worn));
  ac.SetEquipment(eq);

  ac.SetLastHitTime(0xff000000, std::chrono::steady_clock::now() - 10s);
  p.Messages().clear();
  p.GetActionListener().OnHit(rawMsgData, hitMsg);

  const float lost = 1.f - ac.GetChangeForm().actorValues.healthPercentage;
  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
  return lost;
}
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

TEST_CASE("Greymarch: the balance table reads the spell part (multipliers, dual casting, players and NPCs) and refuses what is out of range",
          "[Greymarch]")
{
  auto t = GreymarchBalanceTable::FromJson(nlohmann::json::parse(
    R"({"spells":{"77774":2,"77773":0.5,"9":500,"y":1},"dualCast":3,"playerSpells":0.8,"npcSpells":20})"));
  REQUIRE(t.spellMult.size() == 2);
  REQUIRE(t.spellMult.at(77774) == 2.f);
  REQUIRE(t.spellMult.at(77773) == Catch::Approx(0.5f));
  REQUIRE(t.dualCast.value() == 3.f);
  REQUIRE(t.playerSpells.value() == Catch::Approx(0.8f));
  REQUIRE_FALSE(t.npcSpells.has_value()); // more than 10 times: refused
  auto none = GreymarchBalanceTable::FromJson(nlohmann::json::parse(R"({"dualCast":0.5})"));
  REQUIRE_FALSE(none.dualCast.has_value()); // below 1: refused
  REQUIRE(none.spellMult.empty());
}

TEST_CASE("Greymarch: a weapon's damage comes from the live table, and the attacker's multiplier scales it",
          "[Greymarch]")
{
  BalanceReset reset;
  GreymarchBalance::Set({});
  const float plain = OneHit();
  REQUIRE(plain > 0.f);

  GreymarchBalanceTable t;
  t.weaponDamage[kIronDagger] = 8.f; // the iron dagger does 4 in the game files
  GreymarchBalance::Set(t);
  REQUIRE_THAT(OneHit(), Catch::Matchers::WithinAbs(plain * 2.f, 0.002f));

  GreymarchBalance::Set({});
  REQUIRE_THAT(OneHit(0.5f), Catch::Matchers::WithinAbs(plain * 0.5f, 0.002f));
  REQUIRE_THAT(OneHit(), Catch::Matchers::WithinAbs(plain, 0.002f)); // an empty table plays like the game files
}
