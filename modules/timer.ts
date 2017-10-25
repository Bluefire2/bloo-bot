class Timer {
    initTimestamp: number;

    constructor() {
        this.initTimestamp = Date.now();
    }

    timeElapsed(): number {
        let currTimestamp = Date.now();
        return currTimestamp - this.initTimestamp;
    }

    reset(): void {
        this.initTimestamp = Date.now();
    }
}

module.exports = Timer;