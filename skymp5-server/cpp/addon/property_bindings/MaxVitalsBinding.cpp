#include "MaxVitalsBinding.h"
#include "NapiHelper.h"
#include <algorithm>
#include <cmath>

namespace {
Napi::Value ToJs(Napi::Env env, const std::optional<float>& v)
{
  return v.has_value() ? Napi::Number::New(env, *v) : env.Null();
}

std::optional<float> FromJs(const Napi::Object& obj, const char* key)
{
  Napi::Value v = obj.Get(key);
  if (v.IsUndefined() || v.IsNull()) {
    return std::nullopt;
  }
  float f = NapiHelper::ExtractFloat(v, key);
  if (std::isnan(f)) {
    return std::nullopt;
  }
  return std::min(1000.f, std::max(1.f, f));
}
}

Napi::Value MaxVitalsBinding::Get(Napi::Env env, ScampServer& scampServer,
                                  uint32_t formId)
{
  auto& partOne = scampServer.GetPartOne();
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);
  const auto& m = actor.GetMaxVitalsOverride();
  auto result = Napi::Object::New(env);
  result.Set("health", ToJs(env, m.health));
  result.Set("magicka", ToJs(env, m.magicka));
  result.Set("stamina", ToJs(env, m.stamina));
  return result;
}

void MaxVitalsBinding::Set(Napi::Env env, ScampServer& scampServer,
                           uint32_t formId, Napi::Value newValue)
{
  auto& partOne = scampServer.GetPartOne();
  auto obj = NapiHelper::ExtractObject(newValue, "newMaxVitals");
  auto& actor = partOne->worldState.GetFormAt<MpActor>(formId);

  MpActor::MaxVitalsOverride m;
  m.health = FromJs(obj, "health");
  m.magicka = FromJs(obj, "magicka");
  m.stamina = FromJs(obj, "stamina");
  actor.SetMaxVitalsOverride(m);
}
