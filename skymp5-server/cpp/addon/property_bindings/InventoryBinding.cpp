#include "InventoryBinding.h"
#include "NapiHelper.h"
#include "libespm/espm.h"

namespace {
// GREYMARCH: an NPC given a weapon by the gamemode holds it (2026-10-28, the
// owner: Skeleton archers came with their bow in the pack and fought with their
// fists). The server equips an NPC's best weapon when it is created and when a
// game takes it over, never when the gamemode fills its inventory afterwards
// (npcresolve.js armFor), and games see only what it wears. So when the
// gamemode sets the inventory of a living NPC that holds no weapon and now has
// one, its best weapon is equipped at once (MpActor::EquipBestWeapon). Players
// and NPCs already armed are left as they are.
bool HasWornWeapon(const Inventory& inv, WorldState* worldState)
{
  for (auto& entry : inv.entries) {
    if (entry.GetWorn() != Inventory::Worn::None &&
        espm::GetRecordType(entry.baseId, worldState) == espm::WEAP::kType) {
      return true;
    }
  }
  return false;
}

bool HasWeapon(const Inventory& inv, WorldState* worldState)
{
  for (auto& entry : inv.entries) {
    if (entry.count > 0 &&
        espm::GetRecordType(entry.baseId, worldState) == espm::WEAP::kType) {
      return true;
    }
  }
  return false;
}

void ArmIfUnarmedNpc(MpObjectReference& refr)
{
  auto actor = refr.AsActor();
  auto worldState = refr.GetParent();
  if (!actor || !worldState || !worldState->HasEspm() ||
      actor->IsCreatedAsPlayer() || actor->IsDead()) {
    return;
  }
  if (HasWornWeapon(actor->GetEquipment().inv, worldState) ||
      !HasWeapon(actor->GetInventory(), worldState)) {
    return;
  }
  actor->EquipBestWeapon();
}
}

Napi::Value InventoryBinding::Get(Napi::Env env, ScampServer& scampServer,
                                  uint32_t formId)
{
  auto& partOne = scampServer.GetPartOne();

  auto& refr = partOne->worldState.GetFormAt<MpObjectReference>(formId);
  return NapiHelper::ParseJson(env, refr.GetInventory().ToJson());
}

void InventoryBinding::Set(Napi::Env env, ScampServer& scampServer,
                           uint32_t formId, Napi::Value newValue)
{
  auto& partOne = scampServer.GetPartOne();

  auto& refr = partOne->worldState.GetFormAt<MpObjectReference>(formId);
  if (newValue.IsObject()) {
    auto inventoryDump = NapiHelper::Stringify(env, newValue);
    nlohmann::json j = nlohmann::json::parse(inventoryDump);
    auto inventory = Inventory::FromJson(j);
    refr.SetInventory(inventory);
    ArmIfUnarmedNpc(refr);
  } else {
    refr.SetInventory(Inventory());
  }
}
