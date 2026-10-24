#include "../skyrim-platform/src/tilted/hooks/KeyReleaseFilter.h"
#include <catch2/catch_all.hpp>

#include <cstdint>
#include <vector>

// While a page (chat, panels) has the keyboard, SkyrimPlatform's DInputHook gave the game no keyboard events at all, so a key held when the page took the
// keyboard and let go there stayed held in the game (the character walked on, text boxes repeated the letter). KeyReleaseFilter lets those releases through.

namespace {
struct Ev // laid out like DIDEVICEOBJECTDATA
{
  uint32_t dwOfs;
  uint32_t dwData;
  uint32_t dwTimeStamp;
  uint32_t dwSequence;
  uintptr_t uAppData;
};
constexpr uint32_t kW = 0x11, kE = 0x12, kEnter = 0x1c;
Ev Down(uint32_t k)
{
  return Ev{ k, 0x80, 0, 0, 0 };
}
Ev Up(uint32_t k)
{
  return Ev{ k, 0x00, 0, 0, 0 };
}
uint32_t Run(CEFUtils::KeyReleaseFilter& f, std::vector<Ev>& evs, bool focused)
{
  return f.Filter(evs.data(), static_cast<uint32_t>(evs.size()), sizeof(Ev),
                  focused);
}
}

TEST_CASE("Without a focused page every event reaches the game unchanged",
          "[KeyReleaseFilter]")
{
  CEFUtils::KeyReleaseFilter f;
  std::vector<Ev> evs = { Down(kW), Down(kE), Up(kE) };
  REQUIRE(Run(f, evs, false) == 3);
  REQUIRE(evs[0].dwOfs == kW);
  REQUIRE(evs[2].dwOfs == kE);
  REQUIRE(f.IsDown(kW));
  REQUIRE_FALSE(f.IsDown(kE));
}

TEST_CASE("A key held when a page took the keyboard is released in the game "
          "when it is let go; presses and other releases stay with the page",
          "[KeyReleaseFilter]")
{
  CEFUtils::KeyReleaseFilter f;
  std::vector<Ev> walking = { Down(kW), Down(kEnter) };
  REQUIRE(Run(f, walking, false) == 2); // walking, Enter opens the chat

  // the chat has the keyboard: Enter let go, letters typed, W let go
  std::vector<Ev> typing = { Up(kEnter), Down(kE), Up(kE), Up(kW) };
  const uint32_t kept = Run(f, typing, true);
  REQUIRE(kept == 2);
  REQUIRE(typing[0].dwOfs == kEnter); // the game saw Enter go down
  REQUIRE(typing[0].dwData == 0);
  REQUIRE(typing[1].dwOfs == kW);
  REQUIRE(typing[1].dwData == 0);
  REQUIRE_FALSE(f.IsDown(kW));
  REQUIRE_FALSE(f.IsDown(kEnter));

  // a second release of the same key while still focused is not passed again
  std::vector<Ev> again = { Up(kW) };
  REQUIRE(Run(f, again, true) == 0);
}

TEST_CASE("A peek-sized call without a buffer reports nothing while a page "
          "is focused",
          "[KeyReleaseFilter]")
{
  CEFUtils::KeyReleaseFilter f;
  REQUIRE(f.Filter(static_cast<Ev*>(nullptr), 5, sizeof(Ev), true) == 0);
  REQUIRE(f.Filter(static_cast<Ev*>(nullptr), 5, sizeof(Ev), false) == 5);
}
