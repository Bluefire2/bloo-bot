const AbstractMethodNotImplementedException = require('./AbstractMethodNotImplementedException');

class Datum {
    constructor(data, updateFn) {
        this.dirty = false;
        this.data = data;


        this.update = updateFn;
    }

    modify() {
        this.dirty = true;
    }

    async fetch() {
        if (this.dirty) {
            // if data is dirty
            let val = await this.update()
            this.data = val;
            return val;
        } else {
            return this.data;
        }
    }
}