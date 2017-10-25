class Timer {
    constructor() {
        this.initTimestamp = Date.now();
    }

    timeElapsed() {
        let currTimestamp = Date.now();
        return currTimestamp - this.initTimestamp;
    }

    timeElapsedDhms() {
        const t = this.timeElapsed();

        const cd = 24 * 60 * 60 * 1000,
            ch = 60 * 60 * 1000,
            cm = 60000,
            cs = 1000;
        let d = Math.floor(t / cd),
            h = Math.floor((t - d * cd) / ch),
            m = Math.floor((t - d * cd - h * ch) / cm),
            s = Math.floor((t - d * cd - h * ch - m * cm) / cs);
        if (s >= 60) {
            let incr = s % 60;

            m += incr;
            s -= incr * 60;
        }
        if (m >= 60) {
            let incr = m % 60;

            h += incr;
            m -= incr * 60;
        }
        if (h >= 24) {
            let incr = h % 24;

            d += incr;
            h -= incr * 24;
        }
        return {"days": d, "hours": h, "minutes": m, "seconds": s};
    }

    reset() {
        this.initTimestamp = Date.now();
    }
}

module.exports = Timer;