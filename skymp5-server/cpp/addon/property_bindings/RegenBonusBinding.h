#pragma once
#include "PropertyBinding.h"

// GREYMARCH: mp.set(actorId, "regenBonus", { health: 0, magicka: 45, stamina: 0 }) sets the regeneration the gamemode grants this actor, in
// percent added to HealRateMult / MagickaRateMult / StaminaRateMult (a vampire rank's magicka regeneration). The server's regeneration limit
// counts it, so the bar does not snap back when the player's game regenerates that much faster. A value left out is 0; each is 0 to 500.
// mp.get returns the three numbers.
class RegenBonusBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "regenBonus"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};
