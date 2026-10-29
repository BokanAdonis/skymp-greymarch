import { ClientListener, CombinedController, Sp } from "./clientListener";

// TODO: move to the server/gamemode
export class SweetTaffySweetCantDropService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
    }

    public canDropOrPutItem(itemId: number): boolean {
        const item = this.sp.Game.getFormEx(itemId);
        if (item !== null) {
            // GREYMARCH: no plugin of ours has the SweetCantDrop keyword, and hasKeyword(null) said yes: every put into a container and every drop was
            // held back and the item came back (the owner, 2026-10-28). No keyword: nothing is kept from being dropped or put away.
            const keyword = this.sp.Keyword.getKeyword(this.cantDropKeyword);
            if (keyword && item.hasKeyword(keyword)) {
                return false;
            }
        }
        return true;
    }

    private cantDropKeyword = "SweetCantDrop";
}
