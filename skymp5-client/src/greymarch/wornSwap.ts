// GREYMARCH: A WORN PIECE SWAPPED FOR THE SERVER'S COPY STAYS ON (2026-11-11, the owner: "My upgraded armor is still being taken off every time I log in").
// At login the game first puts on what the server's equipment names, then the server's whole inventory arrives (applyInventory). When the server's entry for
// a worn piece differs from the game's in anything but being worn (an upgraded piece's grade, an old name, a charge), the two do not match: the game's worn
// piece is taken out and the server's copy is added, NOT worn, so the armor came off and stayed off (the game then told the server it was unworn).
// Now such a swap of the same item keeps it on: the server's copy is added worn (or worn in the left hand) like the piece it replaces.

export interface SwapEntry { baseId: number; count: number; worn?: boolean; wornLeft?: boolean; [k: string]: any; }

// diff: what applyInventory will do (negative count: take out, positive: add). Returns the same list with the matching additions worn, and the pairs.
export const keepWornOnSwap = (diff: SwapEntry[]): { diff: SwapEntry[], pairs: Array<{ out: SwapEntry, in: SwapEntry }> } => {
    const pairs: Array<{ out: SwapEntry, in: SwapEntry }> = [];
    const used = new Set<SwapEntry>();
    const outList = diff.filter((e) => e.count < 0 && (e.worn || e.wornLeft));
    for (const out of outList) {
        const add = diff.find((e) => e.count > 0 && e.baseId === out.baseId && !e.worn && !e.wornLeft && !used.has(e));
        if (!add) continue;
        used.add(add);
        if (out.worn) add.worn = true;
        if (out.wornLeft) add.wornLeft = true;
        pairs.push({ out, in: add });
    }
    return { diff, pairs };
};

// a short description of how two copies of one item differ (for the log)
export const swapReason = (a: SwapEntry, b: SwapEntry): string => {
    const skip = new Set(["count", "worn", "wornLeft"]);
    const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)].filter((k) => !skip.has(k)));
    const parts: string[] = [];
    keys.forEach((k) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) parts.push(k + " " + JSON.stringify(a[k]) + " -> " + JSON.stringify(b[k])); });
    return parts.length ? parts.join(", ") : "no difference";
};
