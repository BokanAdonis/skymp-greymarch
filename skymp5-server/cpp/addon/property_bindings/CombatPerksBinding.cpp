#include "CombatPerksBinding.h"
#include "NapiHelper.h"
#include <algorithm>
#include <cmath>

namespace {
bool BoolOr(const Napi::Object& obj, const char* key, bool fallback)
{
  Napi::Value v = obj.Get(key);
  if (v.IsUndefined() || v.IsNull()) {
    return fallback;
  }
  return NapiHelper::ExtractBoolean(v, key);
}
}

Napi::Value CombatPerksBinding::Get(Napi::Env env, ScampServer& scampServer,
                                    uint32_t formId)
{
  auto& partOne = scampServer.GetPartOne();
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);
  const auto& p = actor.GetCombatPerks();
  if (!p.isSet) {
    return env.Null();
  }
  auto result = Napi::Object::New(env);
  result.Set("sneak", Napi::Boolean::New(env, p.sneak));
  result.Set("jumpPower", Napi::Boolean::New(env, p.jumpPower));
  result.Set("beast", Napi::Boolean::New(env, p.beast));
  if (p.blockStops.has_value()) {
    result.Set("blockStops", Napi::Number::New(env, *p.blockStops));
  }
  if (p.shieldStops.has_value()) {
    result.Set("shieldStops", Napi::Number::New(env, *p.shieldStops));
  }
  return result;
}

void CombatPerksBinding::Set(Napi::Env env, ScampServer& scampServer,
                             uint32_t formId, Napi::Value newValue)
{
  auto& partOne = scampServer.GetPartOne();
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);

  MpActor::CombatPerks p;
  if (newValue.IsUndefined() || newValue.IsNull()) {
    actor.SetCombatPerks(p); // unset: as before
    return;
  }

  auto obj = NapiHelper::ExtractObject(newValue, "newCombatPerks");
  p.isSet = true;
  p.sneak = BoolOr(obj, "sneak", true);
  p.jumpPower = BoolOr(obj, "jumpPower", false);
  p.beast = BoolOr(obj, "beast", false);
  Napi::Value stops = obj.Get("blockStops");
  if (!stops.IsUndefined() && !stops.IsNull()) {
    const float f = NapiHelper::ExtractFloat(stops, "blockStops");
    if (std::isfinite(f)) {
      p.blockStops = std::clamp(f, 0.f, 100.f);
    }
  }
  Napi::Value shield = obj.Get("shieldStops");
  if (!shield.IsUndefined() && !shield.IsNull()) {
    const float f = NapiHelper::ExtractFloat(shield, "shieldStops");
    if (std::isfinite(f)) {
      p.shieldStops = std::clamp(f, 0.f, 100.f);
    }
  }
  actor.SetCombatPerks(p);
}
