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

    fetch() {
        return new Promise((resolve, reject) => {
            if (this.dirty) {
                // if data is dirty
                this.update().then(val => {
                    this.data = val;
                    resolve(val);
                }).catch(err => {
                    reject(err);
                });
            } else {
                resolve(this.data);
            }
        });
    }
}