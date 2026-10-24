#include "savefile/SFStructure.h"

#include <algorithm>
#include <cstring>
#include <stdexcept>

SaveFile_::RefID SaveFile_::RefID::CreateRefId(SaveFile& parentSaveFile,
                                               uint32_t formId)
{
  RefID res;

  const auto countWas = parentSaveFile.formIDArrayCount;

  parentSaveFile.formIDArray.push_back(formId);
  parentSaveFile.formIDArrayCount = countWas + 1;

  // fix offset
  parentSaveFile.fileLocationTable.unknownTable3Offset += 4;

  // 255 => 00 00 FF
  // 256 => 00 01 00
  // 65536 => error
  const auto index =
    countWas + 1; // as uesp.net says, formIDArray index starts in 1
  if (index >= 65536)
    throw std::runtime_error("too many elements was in FormIDArray (" +
                             std::to_string(countWas) + ")");
  res.byte0 = 0;
  res.byte1 = (index / 256) % 256;
  res.byte2 = index % 256;

  return res;
}

SaveFile_::ChangeForm* SaveFile_::SaveFile::GetChangeFormByRefID(
  SaveFile_::RefID refID, const uint8_t& type)
{
  for (auto& form : this->changeForms) {
    if ((form.type & 0b00111111) == type &&
        form.formID == refID) /// Upper 2 bits represent the size of the data
                              /// lengths: zero them
      return &form;
  }
  return nullptr;
}

SaveFile_::GlobalVariables::GlobalVariable*
SaveFile_::SaveFile::GetGlobalvariableByRefID(SaveFile_::RefID& refID)
{
  GlobalData& gData = this->globalDataTable1[GLOBAL_VARIABLES_INDEX];

  if (gData.type != GLOBAL_VARIABLES_INDEX)
    return nullptr;

  GlobalVariables* globalsVar =
    reinterpret_cast<GlobalVariables*>(gData.data.get());

  if (!globalsVar)
    return nullptr;

  for (auto& gVar : globalsVar->globals) {
    if (gVar.formID == refID) {
      return &gVar;
    }
  }
  return nullptr;
}

int64_t SaveFile_::SaveFile::FindIndexInFormIdArray(uint32_t refID)
{
  for (uint32_t i = 0; i < this->formIDArray.size(); ++i) {
    if (this->formIDArray[i] == refID) {
      return i;
    }
  }
  return -1;
}

void SaveFile_::SaveFile::OverwritePluginInfo(
  std::vector<std::string>& newPluginNames)
{
  uint32_t oldSize = this->pluginInfoSize;

  // 0xFF (created) and 0xFE (light) are not indices in this list
  constexpr uint32_t kMaxPlugins = 0xFE;
  std::vector<uint32_t> newIndexByOld(this->pluginInfo.pluginsName.size(),
                                      kMaxPlugins);
  for (size_t i = 0; i < newIndexByOld.size(); ++i) {
    auto it = std::find(newPluginNames.begin(), newPluginNames.end(),
                        this->pluginInfo.pluginsName[i]);
    auto newIndex = static_cast<uint32_t>(it - newPluginNames.begin());
    if (it != newPluginNames.end() && newIndex < kMaxPlugins) {
      newIndexByOld[i] = newIndex;
    }
  }
  for (auto& formId : this->formIDArray) {
    const uint32_t oldIndex = formId >> 24;
    if (oldIndex >= newIndexByOld.size()) {
      continue;
    }
    const uint32_t newIndex = newIndexByOld[oldIndex];
    formId =
      newIndex == kMaxPlugins ? 0 : (newIndex << 24) | (formId & 0x00FFFFFF);
  }

  this->pluginInfoSize = 1;
  this->pluginInfo.numPlugins = 0;
  this->pluginInfo.pluginsName.clear();

  this->pluginInfo.numPlugins = static_cast<uint8_t>(newPluginNames.size());

  for (auto& plugin : newPluginNames) {
    this->pluginInfo.pluginsName.push_back(plugin);
    this->pluginInfoSize += uint32_t(2 + plugin.size());
  }

  uint32_t addSize = this->pluginInfoSize - oldSize;

  this->fileLocationTable.formIDArrayCountOffset += addSize;
  this->fileLocationTable.unknownTable3Offset += addSize;
  this->fileLocationTable.globalDataTable1Offset += addSize;
  this->fileLocationTable.globalDataTable2Offset += addSize;
  this->fileLocationTable.changeFormsOffset += addSize;
  this->fileLocationTable.globalDataTable3Offset += addSize;
}

size_t SaveFile_::ChangeForm::GetSizeInFile() const
{
  // the same choice as Reader::FillChangeForm and Writer::CreateSaveFile
  size_t lengthSize = 1;
  if (type > 0x7F) {
    lengthSize = 4;
  } else if (type > 0x3F) {
    lengthSize = 2;
  }
  return 3 + 4 + 1 + 1 + 2 * lengthSize + length1;
}

size_t SaveFile_::SaveFile::RemoveChangeFormsExceptPlayer()
{
  uint32_t removedBytes = 0;
  auto newEnd = std::remove_if(
    changeForms.begin(), changeForms.end(), [&](ChangeForm& form) {
      bool isPlayer = form.Is_ACHR_Type() && form.formID.IsPlayerID();
      bool isPlayerBase = form.Is_NPC_Type() && form.formID.IsPlayerBaseID();
      if (isPlayer || isPlayerBase) {
        return false;
      }
      removedBytes += static_cast<uint32_t>(form.GetSizeInFile());
      return true;
    });
  const auto removed = static_cast<size_t>(changeForms.end() - newEnd);
  changeForms.erase(newEnd, changeForms.end());

  // Change forms come right before globalDataTable3, then formIDArray, then
  // unknownTable3
  fileLocationTable.changeFormCount =
    static_cast<uint32_t>(changeForms.size());
  fileLocationTable.globalDataTable3Offset -= removedBytes;
  fileLocationTable.formIDArrayCountOffset -= removedBytes;
  fileLocationTable.unknownTable3Offset -= removedBytes;
  return removed;
}
