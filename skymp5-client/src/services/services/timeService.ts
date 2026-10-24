import { ClientListener, CombinedController, Sp } from "./clientListener";

// GREYMARCH: US Central time's offset from UTC at this moment: -5 (CDT) from the second Sunday of March, 2:00 standard time (08:00 UTC), to the
// first Sunday of November, 2:00 daylight time (07:00 UTC); -6 (CST) otherwise
const nthSunday = (y: number, m: number, n: number): number => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; };
export const centralOffsetHours = (ms: number): number => {
    const y = new Date(ms).getUTCFullYear();
    const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 8), end = Date.UTC(y, 10, nthSunday(y, 10, 1), 7);
    return ms >= start && ms < end ? -5 : -6;
};

export class TimeService extends ClientListener {
    constructor(private sp: Sp, private controller: CombinedController) {
        super();
        controller.on("update", () => this.onUpdate());
    }

    public getTime() {
        // GREYMARCH: the game's clock is US Central time (Chicago), daylight saving included, unless the settings file names an hoursOffset.
        // The server works out night the same way (gamemode gametime.js).
        const hoursOffsetSetting = this.sp.settings["skymp5-client"]["hoursOffset"];
        const now = Date.now();
        const hoursOffset = typeof hoursOffsetSetting === "number" ? hoursOffsetSetting : centralOffsetHours(now);
        const hoursOffsetMs = hoursOffset * 60 * 60 * 1000;

        const d = new Date(now + hoursOffsetMs);

        let newGameHourValue = 0;
        newGameHourValue += d.getUTCHours();
        newGameHourValue += d.getUTCMinutes() / 60;
        newGameHourValue += d.getUTCSeconds() / 60 / 60;
        newGameHourValue += d.getUTCMilliseconds() / 60 / 60 / 1000;
        return { newGameHourValue, date: d };
    }

    private every2seconds() {
        const gameHourId = 0x38;
        const gameMonthId = 0x36;
        const gameDayId = 0x37;
        const gameYearId = 0x35;
        const timeScaleId = 0x3a;

        const gameHour = this.sp.GlobalVariable.from(this.sp.Game.getFormEx(gameHourId));
        const gameDay = this.sp.GlobalVariable.from(this.sp.Game.getFormEx(gameDayId));
        const gameMonth = this.sp.GlobalVariable.from(this.sp.Game.getFormEx(gameMonthId));
        const gameYear = this.sp.GlobalVariable.from(this.sp.Game.getFormEx(gameYearId));
        const timeScale = this.sp.GlobalVariable.from(this.sp.Game.getFormEx(timeScaleId));

        if (!gameHour || !gameDay || !gameMonth || !gameYear || !timeScale) {
            return;
        }

        const { newGameHourValue, date } = this.getTime();

        const diff = Math.abs(gameHour.getValue() - newGameHourValue);

        if (diff >= 1 / 60) {
            gameHour.setValue(newGameHourValue);
            gameDay.setValue(date.getUTCDate());
            gameMonth.setValue(date.getUTCMonth());
            gameYear.setValue(date.getUTCFullYear() - 2020 + 199);
        }

        timeScale.setValue(gameHour.getValue() > newGameHourValue ? 0.6 : 1.2);
    }

    private onUpdate() {
        if (Date.now() - this.lastTimeUpd <= 2000) {
          return;
        }
        this.lastTimeUpd = Date.now();
        this.every2seconds();
    }

    private lastTimeUpd = 0;
}
