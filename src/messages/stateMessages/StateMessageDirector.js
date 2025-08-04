import Builder from './Builder.js';
import { OperationType } from '../../../src/utils/protobuf/applyOperations.cjs'

class StateMessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof Builder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(address, writingKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_ADMIN)
            .withAddress(address)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddWriterMessage(address, writingKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_WRITER)
            .withAddress(address)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveWriterMessage(address, writingKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.REMOVE_WRITER)
            .withAddress(address)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddIndexerMessage(address) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_INDEXER)
            .withAddress(address)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveIndexerMessage(address) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.REMOVE_INDEXER)
            .withAddress(address)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAppendWhitelistMessage(address) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.APPEND_WHITELIST)
            .withAddress(address)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(address) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BAN_WRITER)
            .withAddress(address)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildPostTxMessage(
        validatorAddress,
        txHash,
        incomingAddress,
        incomingWriterKey,
        incomingNonce,
        contentHash,
        incomingSignature,
        externalBootstrap,
        msbBootstrap) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.TX)
            .withAddress(validatorAddress)
            .withTxHash(txHash)
            .withIncomingAddress(incomingAddress)
            .withIncomingWriterKey(incomingWriterKey)
            .withIncomingNonce(incomingNonce)
            .withContentHash(contentHash)
            .withIncomingSignature(incomingSignature)
            .withExternalBootstrap(externalBootstrap)
            .withMsbBootstrap(msbBootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }
}

export default StateMessageDirector;
