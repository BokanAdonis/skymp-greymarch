#pragma once
#include <cstdint>
#include <nlohmann/json.hpp>
#include <optional>
#include <unordered_map>

// GREYMARCH: the balance table the gamemode sets live (balance.js, the F7 Balance tab):
//   mp.set(0, "greymarchBalance", "<json text>")
// The damage formula (TES5DamageFormula) reads it on every hit. Anything not in the table comes from the plugins, so an empty table plays
// exactly like the game files. Not saved: the gamemode sets it again when it starts.
//   weapons   { "<global form id>": damage }          armor  { "<global form id>": rating }
//   ammo      { "<global form id>": damage }   an arrow's or bolt's damage, added to a bow's or crossbow's (else the plugin's)
//   armorScaling  percent of a hit blocked per point of armor (the game's fArmorScalingFactor)
//   maxArmor      the most armor can block, in percent (the game's fMaxArmorRating)
//   shieldBlock / weaponBlock   what still gets through a block with a shield / with a weapon (0.35 = 65% stopped)
//   powerAttack / sneak         damage multipliers for a power attack and a sneak attack
//   spells    { "<global spell id>": multiplier }   a spell hit's damage times this (the F7 Spells balance tab: the number set / the game's, times the school's percent)
//   dualCast                    how much harder a dual cast spell hits (the game's 2.2)
//   playerSpells / npcSpells    a spell hit's damage times this when a player / an NPC cast it
struct GreymarchBalanceTable
{
  std::unordered_map<uint32_t, float> weaponDamage;
  std::unordered_map<uint32_t, float> armorRating;
  std::unordered_map<uint32_t, float> ammoDamage; // GREYMARCH: arrows and bolts
  std::optional<float> armorScaling;
  std::optional<float> maxArmor;
  std::optional<float> shieldBlock;
  std::optional<float> weaponBlock;
  std::optional<float> powerAttack;
  std::optional<float> sneak;
  std::unordered_map<uint32_t, float> spellMult;
  std::optional<float> dualCast;
  std::optional<float> playerSpells;
  std::optional<float> npcSpells;

  // Throws on text that is not a JSON object. Values out of range are left out (the plugin's value is used).
  static GreymarchBalanceTable FromJson(const nlohmann::json& j);
};

namespace GreymarchBalance {
const GreymarchBalanceTable& Get();
void Set(GreymarchBalanceTable table);
}
