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
