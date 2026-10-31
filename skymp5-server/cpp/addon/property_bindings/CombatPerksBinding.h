#pragma once
#include "PropertyBinding.h"

// GREYMARCH: mp.set(actorId, "combatPerks", { sneak: true, jumpPower: false, blockStops: 40 }) sets the combat skill perks the gamemode
// grants this actor (COMBAT-OVERHAUL.md, Combat skills). sneak: the sneak attack bonus counts for their hits (rank 3). jumpPower: their
// power attack in a jump does x2 instead of the table's powerAttack (rank 5). blockStops: percent of a hit their WEAPON block stops,
// 0..100, instead of the table's weaponBlock (a shield block uses shieldStops / shieldBlock). A field left out: sneak true, jumpPower
// false, blockStops none (the table's). null or undefined clears it: the actor plays as before (an NPC). mp.get returns the object, or
// null when unset. Not saved: the gamemode sets it again.
class CombatPerksBinding : public PropertyBinding
{
public:
  std::string GetPropertyName() const override { return "combatPerks"; }
  Napi::Value Get(Napi::Env env, ScampServer& scampServer,
                  uint32_t formId) override;
  void Set(Napi::Env env, ScampServer& scampServer, uint32_t formId,
           Napi::Value newValue) override;
};
