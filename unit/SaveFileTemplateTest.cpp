#include "savefile/SFReader.h"
#include "savefile/SFStructure.h"
#include "savefile/SFWriter.h"
#include <catch2/catch_all.hpp>

#include <cstring>
#include <filesystem>
#include <fstream>
#include <iterator>

// SkyrimPlatform starts every game from assets/template.ess, a save from a
// played game (LoadGame.cpp). These tests check what LoadGame does to it.

namespace {
std::shared_ptr<SaveFile_::SaveFile> ReadTemplate()
{
  return SaveFile_::Reader(TEMPLATE_ESS_PATH).GetStructure();
}

std::vector<uint8_t> ReadBytes(const std::filesystem::path& p)
{
  std::ifstream f(p, std::ios::binary);
  return { std::istreambuf_iterator<char>(f),
           std::istreambuf_iterator<char>() };
}

uint32_t U32(const std::vector<uint8_t>& b, size_t at)
{
  REQUIRE(at + 4 <= b.size());
  uint32_t v;
  memcpy(&v, b.data() + at, 4);
  return v;
}

// Walks the written file with the offsets it carries (not with the library's
// reader, whose position asserts are off in Release)
void CheckOffsets(const std::vector<uint8_t>& b,
                  const SaveFile_::SaveFile& save)
{
  const auto& t = save.fileLocationTable;
  size_t at = t.changeFormsOffset;
  for (uint32_t i = 0; i < t.changeFormCount; ++i) {
    at += 3 + 4;
    REQUIRE(at + 2 <= b.size());
    const uint8_t type = b[at];
    at += 2;
    uint32_t length1;
    if (type > 0x7F) {
      length1 = U32(b, at);
      at += 8;
    } else if (type > 0x3F) {
      length1 = b[at] | (b[at + 1] << 8);
      at += 4;
    } else {
      length1 = b[at];
      at += 2;
    }
    at += length1;
  }
  REQUIRE(at == t.globalDataTable3Offset);
  REQUIRE(U32(b, t.formIDArrayCountOffset) == save.formIDArrayCount);
  REQUIRE(U32(b, t.unknownTable3Offset) == save.unknown3TableSize);
  REQUIRE(b.size() == t.unknownTable3Offset + 4 + save.unknown3TableSize);
}
}

TEST_CASE("The start save keeps only the player's change forms", "[SaveFile]")
{
  auto save = ReadTemplate();
  const auto countWas = save->changeForms.size();
  REQUIRE(countWas == 9525);

  const auto removed = save->RemoveChangeFormsExceptPlayer();
  REQUIRE(removed == countWas - 2);
  REQUIRE(save->fileLocationTable.changeFormCount == 2);

  auto path = std::filesystem::temp_directory_path() /
    "skymp-unit-template-filtered.ess";
  REQUIRE(SaveFile_::Writer(save).CreateSaveFile(path));
  const auto bytes = ReadBytes(path);
  CheckOffsets(bytes, *save);

  auto back = SaveFile_::Reader(path.string()).GetStructure();
  std::filesystem::remove(path);
  REQUIRE(back->fileLocationTable.changeFormCount == 2);
  REQUIRE(back->changeForms.size() == 2);
  REQUIRE(back->formIDArrayCount == save->formIDArrayCount);
  REQUIRE(back->formIDArray == save->formIDArray);

  bool hasPlayer = false, hasPlayerBase = false;
  for (auto& form : back->changeForms) {
    REQUIRE((form.type & 0x3F) != 0); // no REFR
    hasPlayer |= form.Is_ACHR_Type() && form.formID.IsPlayerID();
    hasPlayerBase |= form.Is_NPC_Type() && form.formID.IsPlayerBaseID();
  }
  REQUIRE(hasPlayer);
  REQUIRE(hasPlayerBase);

  // LoadGame edits the player's ACHR next; it must still be compressed
  auto player =
    back->GetChangeFormByRefID(SaveFile_::RefID(SaveFile_::RefID::Player),
                               uint8_t(SaveFile_::ChangeForm::Type::ACHR));
  REQUIRE(player);
  REQUIRE(player->length2 > 0);
  REQUIRE(player->data.size() == player->length1);
}

TEST_CASE("A new load order keeps every formIDArray entry on its plugin",
          "[SaveFile]")
{
  auto save = ReadTemplate();
  REQUIRE(save->pluginInfo.pluginsName ==
          std::vector<std::string>{ "Skyrim.esm", "Update.esm",
                                    "Dragonborn.esm", "Dawnguard.esm",
                                    "HearthFires.esm" });
  const auto before = save->formIDArray;

  std::vector<std::string> ours = { "Skyrim.esm",     "Update.esm",
                                    "Dawnguard.esm",  "HearthFires.esm",
                                    "Dragonborn.esm", "Greymarch.esp" };
  save->OverwritePluginInfo(ours);

  // template index -> our index; Skyrim and Update stay
  const uint32_t newIndex[] = { 0, 1, 4, 2, 3 };
  REQUIRE(save->formIDArray.size() == before.size());
  size_t movedToDragonborn = 0;
  for (size_t i = 0; i < before.size(); ++i) {
    const uint32_t oldIndex = before[i] >> 24;
    if (oldIndex >= 5) {
      REQUIRE(save->formIDArray[i] == before[i]); // created or light
      continue;
    }
    REQUIRE(save->formIDArray[i] ==
            ((newIndex[oldIndex] << 24) | (before[i] & 0xFFFFFF)));
    movedToDragonborn += oldIndex == 2;
  }
  REQUIRE(movedToDragonborn > 0);

  // a plugin missing from the new order: its entries point to nothing
  std::vector<std::string> noDragonborn = { "Skyrim.esm", "Update.esm",
                                            "Dawnguard.esm",
                                            "HearthFires.esm" };
  save->OverwritePluginInfo(noDragonborn);
  for (size_t i = 0; i < before.size(); ++i) {
    if ((before[i] >> 24) == 2) {
      REQUIRE(save->formIDArray[i] == 0);
    }
  }

  auto path = std::filesystem::temp_directory_path() /
    "skymp-unit-template-reordered.ess";
  REQUIRE(SaveFile_::Writer(save).CreateSaveFile(path));
  const auto bytes = ReadBytes(path);
  std::filesystem::remove(path);
  CheckOffsets(bytes, *save);
}

TEST_CASE("CreateRefId keeps the formIDArray and adds one entry", "[SaveFile]")
{
  auto save = ReadTemplate();
  const auto before = save->formIDArray;
  const auto offsetWas = save->fileLocationTable.unknownTable3Offset;

  auto refId = SaveFile_::RefID::CreateRefId(*save, 0x0003C0CA);

  REQUIRE(save->formIDArrayCount == before.size() + 1);
  REQUIRE(save->formIDArray.size() == before.size() + 1);
  REQUIRE(std::equal(before.begin(), before.end(), save->formIDArray.begin()));
  REQUIRE(save->formIDArray.back() == 0x0003C0CA);
  REQUIRE(save->fileLocationTable.unknownTable3Offset == offsetWas + 4);
  const uint32_t index = (refId.byte1 << 8) | refId.byte2;
  REQUIRE(refId.byte0 == 0);
  REQUIRE(index == before.size() + 1); // formIDArray indices start at 1
}
