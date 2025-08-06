class Builder {

    constructor() {
        if (this.constructor === Builder) {
            throw new Error("Builder is an abstract class and cannot be instantiated directly.");
        }
    }

    reset() { throw new Error("Method 'reset()' must be implemented.");}
    forOperationType(operationType) {throw new Error("Method 'forOperationType()' must be implemented.");}
    withAddress(address) { throw new Error("Method 'withAddress()' must be implemented.");}
    withWriterKey(writerKey) { throw new Error("Method 'withWriterKey()' must be implemented.");}
    async buildValueAndSign() { throw new Error("Method 'buildValueAndSign()' must be implemented.");}
}

export default Builder;
