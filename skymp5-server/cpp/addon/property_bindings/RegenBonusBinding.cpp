#include "RegenBonusBinding.h"
#include "NapiHelper.h"
#include <algorithm>
#include <cmath>

namespace {
float FromJs(const Napi::Object& obj, const char* key)
{
  Napi::Value v = obj.Get(key);
  if (v.IsUndefined() || v.IsNull()) {
    return 0.f;
  }
  float f = NapiHelper::ExtractFloat(v, key);
  if (!std::isfinite(f)) {
    return 0.f;
  }
  return std::clamp(f, 0.f, 500.f);
}
}

Napi::Value RegenBonusBinding::Get(Napi::Env env, ScampServer& scampServer,
                                   uint32_t formId)
{
  auto& partOne = scampServer.GetPartOne();
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);
  const auto& b = actor.GetRegenBonus();
  auto result = Napi::Object::New(env);
  result.Set("health", Napi::Number::New(env, b.health));
  result.Set("magicka", Napi::Number::New(env, b.magicka));
  result.Set("stamina", Napi::Number::New(env, b.stamina));
  return result;
}

void RegenBonusBinding::Set(Napi::Env env, ScampServer& scampServer,
                            uint32_t formId, Napi::Value newValue)
{
  auto& partOne = scampServer.GetPartOne();
  auto obj = NapiHelper::ExtractObject(newValue, "newRegenBonus");
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);

  MpActor::RegenBonus b;
  b.health = FromJs(obj, "health");
  b.magicka = FromJs(obj, "magicka");
  b.stamina = FromJs(obj, "stamina");
  actor.SetRegenBonus(b);
}
