import Builder from './Builder.js';
import { OperationType } from '../protobuf/applyOperations.cjs'

class MessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof Builder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(adminEntry, writingKey, bootstrap, tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_ADMIN)
            .withTracPubKey(tracPublicKey)
            .withAdminEntry(adminEntry)
            .withWriterKey(writingKey)
            .withBootstrap(bootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddWriterMessage(writingKey, tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_WRITER)
            .withTracPubKey(tracPublicKey)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveWriterMessage(writingKey, tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.REMOVE_WRITER)
            .withTracPubKey(tracPublicKey)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddIndexerMessage(tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.ADD_INDEXER)
            .withTracPubKey(tracPublicKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveIndexerMessage(tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.REMOVE_INDEXER)
            .withTracPubKey(tracPublicKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAppendWhitelistMessage(tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.APPEND_WHITELIST)
            .withTracPubKey(tracPublicKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(tracPublicKey) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder.forOperationType(OperationType.BAN_WRITER)
            .withTracPubKey(tracPublicKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

}

export default MessageDirector;
