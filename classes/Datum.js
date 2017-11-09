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
        if(this.dirty) {
            this.update().then(val => {this.data = val}).catch(err => {throw err});
        }

        return this.data
    }
}