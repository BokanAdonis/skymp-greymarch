#pragma once
// GREYMARCH: KEY RELEASES WHILE A PAGE HAS THE KEYBOARD (2026-10-24). While the browser is focused, DInputHook gave the game none of the keyboard's buffered
// events. A key held when a page took the keyboard (W while walking, then Enter for the chat) and let go while the page had it was never released in the
// game: the character kept walking and the game's text boxes kept repeating the letter ("keys get stuck, a menu spams a letter").
// KeyReleaseFilter remembers which keys the game has seen go down. While a page is focused, it keeps only the releases of those keys (and forgets them);
// every press, and the release of a key the game never saw go down, still goes to the page only.
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace CEFUtils {

class KeyReleaseFilter
{
public:
  // `data` holds `count` entries `stride` bytes apart, each starting like DIDEVICEOBJECTDATA (dwOfs: the key, dwData: 0x80 when pressed).
  // Returns how many entries stay, packed at the front.
  template <class Entry>
  uint32_t Filter(Entry* data, uint32_t count, size_t stride, bool pageFocused)
  {
    if (!data)
      return pageFocused ? 0 : count;
    uint8_t* base = reinterpret_cast<uint8_t*>(data);
    uint32_t kept = 0;
    for (uint32_t i = 0; i < count; ++i) {
      Entry* e = reinterpret_cast<Entry*>(base + i * stride);
      const uint32_t key = static_cast<uint32_t>(e->dwOfs) & 0xff;
      const bool pressed = (e->dwData & 0x80) != 0;
      bool keep;
      if (!pageFocused) {
        down[key] = pressed;
        keep = true;
      } else {
        keep = !pressed && down[key];
        if (keep)
          down[key] = false;
      }
      if (keep) {
        if (kept != i)
          std::memmove(base + kept * stride, e, stride);
        ++kept;
      }
    }
    return kept;
  }

  bool IsDown(uint32_t key) const { return down[key & 0xff]; }

private:
  bool down[256] = {};
};

}
