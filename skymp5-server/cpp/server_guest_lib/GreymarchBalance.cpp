#include "GreymarchBalance.h"
#include <cmath>
#include <stdexcept>
#include <string>

namespace {
GreymarchBalanceTable g_table;

std::optional<float> Number(const nlohmann::json& j, const char* key,
                            float min, float max)
{
  auto it = j.find(key);
  if (it == j.end() || !it->is_number()) {
    return std::nullopt;
  }
  const float v = it->get<float>();
  if (!std::isfinite(v) || v < min || v > max) {
    return std::nullopt;
  }
  return v;
}

void ReadMap(const nlohmann::json& j, const char* key, float max,
             std::unordered_map<uint32_t, float>& out)
{
  auto it = j.find(key);
  if (it == j.end() || !it->is_object()) {
    return;
  }
  for (auto& [k, v] : it->items()) {
    if (!v.is_number()) {
      continue;
    }
    const float f = v.get<float>();
    if (!std::isfinite(f) || f < 0.f || f > max) {
      continue;
    }
    try {
      const unsigned long long id = std::stoull(k);
      if (id > 0 && id <= 0xffffffffull) {
        out[static_cast<uint32_t>(id)] = f;
      }
    } catch (...) {
      // not a form id: skipped
    }
  }
}
}

GreymarchBalanceTable GreymarchBalanceTable::FromJson(const nlohmann::json& j)
{
  if (!j.is_object()) {
    throw std::runtime_error("the balance table must be a JSON object");
  }
  GreymarchBalanceTable t;
  ReadMap(j, "weapons", 10000.f, t.weaponDamage);
  ReadMap(j, "armor", 10000.f, t.armorRating);
  ReadMap(j, "ammo", 10000.f, t.ammoDamage);
  t.armorScaling = Number(j, "armorScaling", 0.f, 10.f);
  t.maxArmor = Number(j, "maxArmor", 0.f, 100.f);
  t.shieldBlock = Number(j, "shieldBlock", 0.f, 1.f);
  t.weaponBlock = Number(j, "weaponBlock", 0.f, 1.f);
  t.powerAttack = Number(j, "powerAttack", 0.f, 10.f);
  t.sneak = Number(j, "sneak", 0.f, 10.f);
  ReadMap(j, "spells", 100.f, t.spellMult);
  t.dualCast = Number(j, "dualCast", 1.f, 5.f);
  t.playerSpells = Number(j, "playerSpells", 0.f, 10.f);
  t.npcSpells = Number(j, "npcSpells", 0.f, 10.f);
  ReadMap(j, "shieldStops", 100.f, t.shieldStops);
  t.enchantArmorCap = Number(j, "enchantArmorCap", 0.f, 10000.f);
  t.pvpDamage = Number(j, "pvpDamage", 0.f, 10.f);
  t.pvpArmor = Number(j, "pvpArmor", 0.f, 1.f);
  t.pvpRankKeep = Number(j, "pvpRankKeep", 0.f, 1.f);
  return t;
}

const GreymarchBalanceTable& GreymarchBalance::Get()
{
  return g_table;
}

void GreymarchBalance::Set(GreymarchBalanceTable table)
{
  g_table = std::move(table);
}
