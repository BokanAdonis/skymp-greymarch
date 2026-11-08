#include "GreymarchBalanceBinding.h"
#include "GreymarchBalance.h"
#include "NapiHelper.h"
#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <spdlog/spdlog.h>

Napi::Value GreymarchBalanceBinding::Get(Napi::Env env, ScampServer&,
                                         uint32_t)
{
  const auto& t = GreymarchBalance::Get();
  auto result = Napi::Object::New(env);
  result.Set("weapons", Napi::Number::New(env, t.weaponDamage.size()));
  result.Set("armor", Napi::Number::New(env, t.armorRating.size()));
  // GREYMARCH: this build does the magic staffs' damage (OnStaffHit): the gamemode then leaves it to the server
  result.Set("staffs", Napi::Number::New(env, t.staffDamage.size()));
  return result;
}

void GreymarchBalanceBinding::Set(Napi::Env, ScampServer&, uint32_t,
                                  Napi::Value newValue)
{
  const std::string text =
    NapiHelper::ExtractString(newValue, "greymarchBalance");
  // a broken text throws here and the table in force stays as it was
  GreymarchBalance::Set(
    GreymarchBalanceTable::FromJson(nlohmann::json::parse(text)));
  const auto& t = GreymarchBalance::Get();
  spdlog::info("Greymarch balance table set: {} weapons, {} armor pieces",
               t.weaponDamage.size(), t.armorRating.size());
}

Napi::Value DamageMultBinding::Get(Napi::Env env, ScampServer& scampServer,
                                   uint32_t formId)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  return Napi::Number::New(env, actor.GetGreymarchDamageMult());
}

void DamageMultBinding::Set(Napi::Env, ScampServer& scampServer,
                            uint32_t formId, Napi::Value newValue)
{
  float mult = NapiHelper::ExtractFloat(newValue, "damageMult");
  if (!std::isfinite(mult)) {
    mult = 1.f;
  }
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  actor.SetGreymarchDamageMult(std::clamp(mult, 0.1f, 5.f));
}

Napi::Value FistMultBinding::Get(Napi::Env env, ScampServer& scampServer,
                                 uint32_t formId)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  return Napi::Number::New(env, actor.GetGreymarchFistMult());
}

void FistMultBinding::Set(Napi::Env, ScampServer& scampServer,
                          uint32_t formId, Napi::Value newValue)
{
  float mult = NapiHelper::ExtractFloat(newValue, "fistMult");
  if (!std::isfinite(mult)) {
    mult = 1.f;
  }
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  actor.SetGreymarchFistMult(std::clamp(mult, 0.1f, 5.f));
}

Napi::Value HitsToKillBinding::Get(Napi::Env env, ScampServer& scampServer,
                                   uint32_t formId)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  return Napi::Number::New(env, actor.GetGreymarchHitsToKill());
}

void HitsToKillBinding::Set(Napi::Env, ScampServer& scampServer,
                            uint32_t formId, Napi::Value newValue)
{
  float hits = NapiHelper::ExtractFloat(newValue, "hitsToKill");
  if (!std::isfinite(hits)) {
    hits = 0.f;
  }
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  actor.SetGreymarchHitsToKill(
    static_cast<int>(std::clamp(std::round(hits), 0.f, 50.f)));
}

Napi::Value GreymarchHiddenBinding::Get(Napi::Env env,
                                        ScampServer& scampServer,
                                        uint32_t formId)
{
  auto& ref =
    scampServer.GetPartOne()->worldState.GetFormAt<MpObjectReference>(formId);
  return Napi::Boolean::New(env, ref.IsGreymarchHidden());
}

void GreymarchHiddenBinding::Set(Napi::Env, ScampServer& scampServer,
                                 uint32_t formId, Napi::Value newValue)
{
  auto& ref =
    scampServer.GetPartOne()->worldState.GetFormAt<MpObjectReference>(formId);
  ref.SetGreymarchHidden(newValue.IsBoolean() &&
                         newValue.As<Napi::Boolean>().Value());
}

Napi::Value GreymarchSeesHiddenBinding::Get(Napi::Env env,
                                            ScampServer& scampServer,
                                            uint32_t formId)
{
  auto& ref =
    scampServer.GetPartOne()->worldState.GetFormAt<MpObjectReference>(formId);
  return Napi::Boolean::New(env, ref.IsGreymarchSeesHidden());
}

void GreymarchSeesHiddenBinding::Set(Napi::Env, ScampServer& scampServer,
                                     uint32_t formId, Napi::Value newValue)
{
  auto& ref =
    scampServer.GetPartOne()->worldState.GetFormAt<MpObjectReference>(formId);
  ref.SetGreymarchSeesHidden(newValue.IsBoolean() &&
                             newValue.As<Napi::Boolean>().Value());
}

Napi::Value UnharmedBinding::Get(Napi::Env env, ScampServer& scampServer,
                                 uint32_t formId)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  return Napi::Boolean::New(env, actor.IsGreymarchUnharmed());
}

void UnharmedBinding::Set(Napi::Env, ScampServer& scampServer,
                          uint32_t formId, Napi::Value newValue)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  actor.SetGreymarchUnharmed(newValue.IsBoolean() &&
                             newValue.As<Napi::Boolean>().Value());
}

Napi::Value TakenMultBinding::Get(Napi::Env env, ScampServer& scampServer,
                                  uint32_t formId)
{
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  auto result = Napi::Object::New(env);
  result.Set("mult", Napi::Number::New(env, actor.GetGreymarchTakenMult()));
  result.Set("silver",
             Napi::Number::New(env, actor.GetGreymarchSilverTakenMult()));
  return result;
}

void TakenMultBinding::Set(Napi::Env, ScampServer& scampServer,
                           uint32_t formId, Napi::Value newValue)
{
  auto clampMult = [](Napi::Value v) {
    float m = v.IsNumber() ? v.As<Napi::Number>().FloatValue() : 1.f;
    return std::isfinite(m) ? std::clamp(m, 0.f, 5.f) : 1.f;
  };
  float mult = 1.f, silver = 1.f;
  if (newValue.IsNumber()) {
    mult = silver = clampMult(newValue);
  } else if (newValue.IsObject()) {
    auto obj = newValue.As<Napi::Object>();
    mult = clampMult(obj.Get("mult"));
    silver = obj.Has("silver") ? clampMult(obj.Get("silver")) : mult;
  }
  auto& actor =
    scampServer.GetPartOne()->worldState.GetFormAt<MpActor>(formId);
  actor.SetGreymarchTakenMult(mult, silver);
}
