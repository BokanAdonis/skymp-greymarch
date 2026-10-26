#pragma once
#include "WorldState.h"
#include "libespm/ActorValue.h"
float CropRegeneration(float newAttributeValue, float secondsAfterLastRegen,
                       float attributeRate, float attributeRateMult,
                       float oldAttributeValue, bool hasActiveMagicEffects);

// GREYMARCH: the regeneration boost (percent) the enchantments of the actor's
// worn armour and clothing give one actor value, e.g. MagickaRateMult
float WornRegenBonus(const MpActor& actor, espm::ActorValue av);

float CropHealthRegeneration(float newAttributeValue,
                             float secondsAfterLastRegen, MpActor* actor);

float CropMagickaRegeneration(float newAttributeValue,
                              float secondsAfterLastRegen, MpActor* actor);

float CropStaminaRegeneration(float newAttributeValue,
                              float secondsAfterLastRegen, MpActor* actor);

float CropPeriodAfterLastRegen(float secondsAfterLastRegen,
                               float maxValidPeriod = 2.0f,
                               float defaultPeriod = 1.0f);

float CropValue(float value, float min = 0.f, float max = 1.0f);
