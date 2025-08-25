import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'

// TODO: RENAME TO CompleteStateMessageDirector

class CompleteStateMessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof StateBuilder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(address, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_ADMIN)
            .withAddress(address)
            .withWriterKey(writingKey)
            .withTxValidity(txValidity)
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

    async buildAppendWhitelistMessage(address, incomingAddress ,txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.APPEND_WHITELIST)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(address) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BAN_VALIDATOR)
            .withAddress(address)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildTransactionOperationMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWriterKey,
        incomingNonce,
        contentHash,
        incomingSignature,
        externalBootstrap,
        msbBootstrap,
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.TX)
            .withAddress(invokerAddress)
            .withTxHash(txHash)
            .withTxValidity(txValidity)
            .withIncomingWriterKey(incomingWriterKey)
            .withIncomingNonce(incomingNonce)
            .withContentHash(contentHash)
            .withIncomingSignature(incomingSignature)
            .withExternalBootstrap(externalBootstrap)
            .withMsbBootstrap(msbBootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBootstrapDeploymentMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        externalBootstrap,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .withAddress(invokerAddress)
            .withTxHash(transactionHash)
            .withTxValidity(txValidity)
            .withExternalBootstrap(externalBootstrap)
            .withIncomingNonce(incomingNonce)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }
}

export default CompleteStateMessageDirector;
