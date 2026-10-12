#pragma once
#include "PropertyBinding.h"

// GREYMARCH: mp.set(actorId, "maxVitals", { health: 300, magicka: 100, stamina: 200 }) sets the maximums the SERVER uses for this actor
// (any of the three may be left out). mp.get returns what was set (null for a value that is not set). Each value is 1 to 1000.
class MaxVitalsBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "maxVitals"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};
