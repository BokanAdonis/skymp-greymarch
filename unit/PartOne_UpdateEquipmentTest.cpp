#include "TestUtils.hpp"

TEST_CASE("UpdateEquipment", "[PartOne]")
{

  PartOne partOne;

  DoConnect(partOne, 0);
  partOne.CreateActor(0xff000ABC, { 1.f, 2.f, 3.f }, 180.f, 0x3c);
  partOne.SetUserActor(0, 0xff000ABC);
  DoMessage(partOne, 0, jEquipment);
  partOne.Messages().clear();

  DoConnect(partOne, 1);
  partOne.CreateActor(0xffABCABC, { 11.f, 22.f, 33.f }, 180.f, 0x3c);
  partOne.SetUserActor(1, 0xffABCABC);

  // createActor should contain equipment
  auto res = FindRefrMessageIdx<CreateActorMessage>(partOne, 0);
  REQUIRE(res.filteredMessages.size() == 1);
  REQUIRE(res.filteredMessages[0].equipment.has_value());
  REQUIRE(res.filteredMessages[0].equipment->ToJson().dump() ==
          jEquipment["data"].dump());

  partOne.Messages().clear();

  DoMessage(partOne, 0, jEquipment);

  REQUIRE(partOne.Messages().size() == 2);
  REQUIRE(std::find_if(partOne.Messages().begin(), partOne.Messages().end(),
                       [&](auto m) {
                         return m.j["t"] == MsgType::UpdateEquipment &&
                           m.j["idx"] == 0 && m.reliable && m.userId == 1 &&
                           m.j["data"] == jEquipment["data"];
                       }) != partOne.Messages().end());
  REQUIRE(std::find_if(partOne.Messages().begin(), partOne.Messages().end(),
                       [&](auto m) {
                         return m.j["t"] == MsgType::UpdateEquipment &&
                           m.j["idx"] == 0 && m.reliable && m.userId == 0 &&
                           m.j["data"] == jEquipment["data"];
                       }) != partOne.Messages().end());
}

// GREYMARCH: an item the server's inventory lacks is left out, the rest of the
// update (the other items, the hand spells) is kept and the others get what
// the server accepted. It used to refuse the whole update (2026-10-25: an Iron
// War Axe), and watchers' copies of the player then held no spell at all.
TEST_CASE("UpdateEquipment keeps the rest when one item is missing",
          "[PartOne]")
{
  PartOne partOne;

  DoConnect(partOne, 0);
  partOne.CreateActor(0xff000ABC, { 1.f, 2.f, 3.f }, 180.f, 0x3c);
  partOne.SetUserActor(0, 0xff000ABC);

  DoConnect(partOne, 1);
  partOne.CreateActor(0xffABCABC, { 11.f, 22.f, 33.f }, 180.f, 0x3c);
  partOne.SetUserActor(1, 0xffABCABC);

  auto& ac = partOne.worldState.GetFormAt<MpActor>(0xff000ABC);
  ac.AddItem(0x12eb7, 1);
  ac.AddSpell(0x40265a3);
  partOne.Messages().clear();

  const uint32_t kMissingAxe = 0x13790;
  auto j = jEquipment;
  j["data"]["inv"]["entries"] = nlohmann::json::array(
    { { { "baseId", 0x12eb7 }, { "count", 1 } },
      { { "baseId", kMissingAxe }, { "count", 1 }, { "worn", true } } });
  j["data"]["rightSpell"] = 0x40265a3;
  DoMessage(partOne, 0, j);

  // the server keeps the item it has and the spell, without the axe
  const auto& eq = ac.GetEquipment();
  REQUIRE(eq.inv.entries.size() == 1);
  REQUIRE(eq.inv.entries[0].baseId == 0x12eb7);
  REQUIRE(eq.rightSpell.value_or(0) == 0x40265a3);

  // both players get the accepted equipment, not the client's message
  for (Networking::UserId user : { 0, 1 }) {
    auto it = std::find_if(
      partOne.Messages().begin(), partOne.Messages().end(), [&](auto m) {
        return m.j["t"] == MsgType::UpdateEquipment && m.userId == user;
      });
    REQUIRE(it != partOne.Messages().end());
    REQUIRE(it->reliable);
    REQUIRE(it->j["data"]["inv"]["entries"].size() == 1);
    REQUIRE(it->j["data"]["inv"]["entries"][0]["baseId"] == 0x12eb7);
    REQUIRE(it->j["data"]["rightSpell"] == 0x40265a3);
  }

  // the player's game unequips the axe and gets the server's inventory
  REQUIRE(std::find_if(partOne.Messages().begin(), partOne.Messages().end(),
                       [&](auto m) {
                         return m.userId == 0 &&
                           m.j["t"] == MsgType::SpSnippet &&
                           m.j["function"] == "UnequipItem" &&
                           m.j["arguments"][0]["formId"] == kMissingAxe;
                       }) != partOne.Messages().end());
  REQUIRE(std::find_if(partOne.Messages().begin(), partOne.Messages().end(),
                       [&](auto m) {
                         return m.userId == 0 &&
                           m.j["t"] == MsgType::SetInventory;
                       }) != partOne.Messages().end());
}
