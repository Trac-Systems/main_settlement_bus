class StateBuilder {

    constructor() {
        if (this.constructor === StateBuilder) {
            throw new Error("Builder is an abstract class and cannot be instantiated directly.");
        }
    }
    reset() { throw new Error("Method 'reset()' must be implemented.");}
    forOperationType(operationType) {throw new Error("Method 'forOperationType()' must be implemented.");}
    withAddress(address) { throw new Error("Method 'withAddress()' must be implemented.");}
    withWriterKey(writerKey) { throw new Error("Method 'withWriterKey()' must be implemented.");}
    async buildValueAndSign() { throw new Error("Method 'buildValueAndSign()' must be implemented.");}
    withIncomingAddress(address) { throw new Error("Method 'withIncomingAddress()' must be implemented.");}
    withIncomingWriterKey(writerKey) { throw new Error("Method 'withIncomingWriterKey()' must be implemented.");}
    withIncomingNonce(nonce) { throw new Error("Method 'withIncomingNonce()' must be implemented.");}
    withContentHash(contentHash) { throw new Error("Method 'withContentHash()' must be implemented.");}
    withIncomingSignature(signature) { throw new Error("Method 'withIncomingSignature()' must be implemented.");}
    withExternalBootstrap(bootstrapKey) { throw new Error("Method 'withExternalBootstrap()' must be implemented.");}
    withMsbBootstrap(msbBootstrap) { throw new Error("Method 'withMsbBootstrap()' must be implemented.");}
    withTxHash(txHash) { throw new Error("Method 'withTxHash()' must be implemented.");}
}

export default StateBuilder;
