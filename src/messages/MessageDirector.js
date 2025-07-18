import Builder from './Builder.js';
import { OperationType } from '../../src/utils/protobuf/applyOperations.cjs'

class MessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof Builder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(adminEntry, writingKey, bootstrap, tracAddress) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_ADMIN)
            .withTracAddress(tracAddress)
            .withAdminEntry(adminEntry)
            .withWriterKey(writingKey)
            .withBootstrap(bootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddWriterMessage(writingKey, tracAddress) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_WRITER)
            .withTracAddress(tracAddress)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveWriterMessage(writingKey, tracAddres) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.REMOVE_WRITER)
            .withTracAddress(tracAddres)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddIndexerMessage(tracAddres) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_INDEXER)
            .withTracAddress(tracAddres)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveIndexerMessage(tracAddres) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        console.log("Building remove indexer message for address:", tracAddres);
        await this.#builder.forOperationType(OperationType.REMOVE_INDEXER)
            .withTracAddress(tracAddres)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAppendWhitelistMessage(tracAddres) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.APPEND_WHITELIST)
            .withTracAddress(tracAddres)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(tracAddres) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.BAN_WRITER)
            .withTracAddress(tracAddres)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

}

export default MessageDirector;
