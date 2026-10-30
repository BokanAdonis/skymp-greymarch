#pragma once
#include "RecordHeader.h"

#pragma pack(push, 1)

namespace espm {

class AMMO final : public RecordHeader
{
public:
  static constexpr auto kType = "AMMO";

  struct Data
  {
    float weight = 0.f;
    float damage = 0.f; // GREYMARCH: what the arrow or bolt adds to the bow's damage (DATA + 0x8)
    bool hasDamage = false;
  };

  Data GetData(CompressedFieldsCache& compressedFieldsCache) const;
};

static_assert(sizeof(AMMO) == sizeof(RecordHeader));

}

#pragma pack(pop)
