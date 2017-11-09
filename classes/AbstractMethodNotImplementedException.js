class AbstractMethodNotImplementedException {
    constructor(methodName) {
        this.msg = `Error: abstract method ${methodName} not implemented.`;
    }
}

module.exports = AbstractMethodNotImplementedException;