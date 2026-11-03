#pragma once
#include "PropertyBinding.h"

// GREYMARCH: mp.set(0, "greymarchBalance", "<json text>") replaces the live balance table the damage formula reads (GreymarchBalance.h has
// the format; "{}" clears it, so the plugins decide again). The form id is not used. mp.get(0, "greymarchBalance") answers
// { weapons, armor } with how many records the table covers, so the gamemode can check it arrived.
class GreymarchBalanceBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "greymarchBalance"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};

// GREYMARCH: mp.set(actorId, "hitsToKill", 6) makes every hit that actor lands on a player take a sixth of their maximum health (0 to 50; 0 = off).
class HitsToKillBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "hitsToKill"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};

// GREYMARCH: mp.set(actorId, "unharmed", true) makes every weapon, fist or spell hit on that actor do nothing (the milk cows).
class UnharmedBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "unharmed"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};

// GREYMARCH: mp.set(actorId, "fistMult", 2.25) multiplies only that actor's fist hits, on top of damageMult (0.1 to 5; 1 = no change): the brass knuckles.
class FistMultBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "fistMult"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};

// GREYMARCH: mp.set(actorId, "damageMult", 0.88) multiplies every weapon or fist hit that actor lands (0.1 to 5; 1 = no change).
class DamageMultBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "damageMult"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};
