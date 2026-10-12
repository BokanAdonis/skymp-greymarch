// GREYMARCH: tests for the server hardening (stamina cropping, server-side maximums set by the gamemode).
#include "TestUtils.hpp"
#include <catch2/catch_all.hpp>
#include <chrono>

#include "ChangeValuesMessage.h"
#include "GetBaseActorValues.h"
#include "HitMessage.h"
#include "PacketParser.h"
#include "libespm/Loader.h"

PartOne& GetPartOne();
extern espm::Loader l;
using namespace std::chrono_literals;

namespace {
const auto kWornTrue = [] {
  Inventory::ExtraData extra;
  extra.worn_ = true;
  return extra;
}();
}

TEST_CASE("Greymarch: a client cannot report stamina higher than it could have regenerated",
          "[Greymarch]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  RawMessageData msgData;
  msgData.userId = 0;

  ActorValues actorValues;
  actorValues.healthPercentage = 1.f;
  actorValues.magickaPercentage = 1.f;
  actorValues.staminaPercentage = 0.f;
  ac.SetPercentages(actorValues);
  ac.SetLastAttributesPercentagesUpdate(std::chrono::steady_clock::now() - 1s);

  ChangeValuesMessage msg;
  msg.idx = std::nullopt;
  msg.data.stamina = 1.f; // "I regenerated everything in one second"
  p.GetActionListener().OnChangeValues(msgData, msg);

  auto changeForm = ac.GetChangeForm();
  REQUIRE(changeForm.actorValues.staminaPercentage < 0.5f);
  REQUIRE(changeForm.actorValues.staminaPercentage >= 0.f);

  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}

TEST_CASE("Greymarch: a maximum health set by the gamemode makes hits take proportionally less",
          "[Greymarch]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);

  // the same hit as in HitTest.cpp takes 25% of a normal character's health; with ten times the maximum it takes a tenth of that
  MpActor::MaxVitalsOverride m;
  m.health = 1000.f;
  ac.SetMaxVitalsOverride(m);

  RawMessageData rawMsgData;
  rawMsgData.userId = 0;
  HitMessage hitMsg;
  hitMsg.data.target = 0x14;
  hitMsg.data.aggressor = 0x14;
  hitMsg.data.source = 0x0001397E; // iron dagger
  ac.AddItem(hitMsg.data.source, 1);

  Equipment eq;
  eq.inv.entries.push_back(Inventory::Entry(80254, 1, kWornTrue));
  ac.SetEquipment(eq);

  ac.SetLastHitTime(0xff000000, std::chrono::steady_clock::now() - 10s);
  p.Messages().clear();
  p.GetActionListener().OnHit(rawMsgData, hitMsg);

  auto changeForm = ac.GetChangeForm();
  REQUIRE_THAT(changeForm.actorValues.healthPercentage,
               Catch::Matchers::WithinAbs(1.f - 0.025f, 0.001f));

  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}

TEST_CASE("Greymarch: without an override the race's health is used as before",
          "[Greymarch]")
{
  PartOne& p = GetPartOne();
  DoConnect(p, 0);
  p.CreateActor(0xff000000, { 0, 0, 0 }, 0, 0x3c);
  p.SetUserActor(0, 0xff000000);
  auto& ac = p.worldState.GetFormAt<MpActor>(0xff000000);
  REQUIRE_FALSE(ac.GetMaxVitalsOverride().health.has_value());
  REQUIRE_FALSE(ac.GetMaxVitalsOverride().stamina.has_value());
  p.DestroyActor(0xff000000);
  DoDisconnect(p, 0);
}
