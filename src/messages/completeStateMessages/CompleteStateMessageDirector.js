import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/protobuf/applyOperations.cjs'

class CompleteStateMessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof StateBuilder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    async buildAddAdminMessage(invokerAddress, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_ADMIN)
            .withAddress(invokerAddress)
            .withWriterKey(writingKey)
            .withTxValidity(txValidity)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddWriterMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_WRITER)
            .withAddress(invokerAddress)
            .withTxHash(txHash)
            .withTxValidity(txValidity)
            .withIncomingWriterKey(incomingWritingKey)
            .withIncomingNonce(incomingNonce)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveWriterMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.REMOVE_WRITER)
            .withAddress(invokerAddress)
            .withTxHash(txHash)
            .withTxValidity(txValidity)
            .withIncomingWriterKey(incomingWritingKey)
            .withIncomingNonce(incomingNonce)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAdminRecoveryMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADMIN_RECOVERY)
            .withAddress(invokerAddress)
            .withTxHash(txHash)
            .withTxValidity(txValidity)
            .withIncomingWriterKey(incomingWritingKey)
            .withIncomingNonce(incomingNonce)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddIndexerMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_INDEXER)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveIndexerMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.REMOVE_INDEXER)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAppendWhitelistMessage(invokerAddress, incomingAddress ,txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.APPEND_WHITELIST)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(invokerAddress ,incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BAN_VALIDATOR)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
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
