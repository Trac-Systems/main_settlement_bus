import StateBuilder from '../base/StateBuilder.js'
import { OperationType } from '../../utils/protobuf/applyOperations.cjs'

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
            .withOperationType(OperationType.ADD_ADMIN)
            .withAddress(invokerAddress)
            .withWriterKey(writingKey)
            .withTxValidity(txValidity)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildDisableInitializationMessage(invokerAddress, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .withOperationType(OperationType.DISABLE_INITIALIZATION)
            .withAddress(invokerAddress)
            .withWriterKey(writingKey)
            .withTxValidity(txValidity)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBalanceInitializationMessage(invokerAddress, recipientAddress, amount, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .withOperationType(OperationType.BALANCE_INITIALIZATION)
            .withAddress(invokerAddress)
            .withIncomingAddress(recipientAddress)
            .withAmount(amount)
            .withTxValidity(txValidity)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAppendWhitelistMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .withOperationType(OperationType.APPEND_WHITELIST)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
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
            .withOperationType(OperationType.ADD_WRITER)
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
            .withOperationType(OperationType.REMOVE_WRITER)
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
            .withOperationType(OperationType.ADMIN_RECOVERY)
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
            .withOperationType(OperationType.ADD_INDEXER)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveIndexerMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .withOperationType(OperationType.REMOVE_INDEXER)
            .withAddress(invokerAddress)
            .withTxValidity(txValidity)
            .withIncomingAddress(incomingAddress)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildBanWriterMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .withOperationType(OperationType.BAN_VALIDATOR)
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
            .withOperationType(OperationType.TX)
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
        channel,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .withOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .withAddress(invokerAddress)
            .withTxHash(transactionHash)
            .withTxValidity(txValidity)
            .withExternalBootstrap(externalBootstrap)
            .withChannel(channel)
            .withIncomingNonce(incomingNonce)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildTransferOperationMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        incomingNonce,
        recipientAddress,
        amount,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .withOperationType(OperationType.TRANSFER)
            .withAddress(invokerAddress)
            .withTxHash(transactionHash)
            .withTxValidity(txValidity)
            .withIncomingNonce(incomingNonce)
            .withIncomingAddress(recipientAddress)
            .withAmount(amount)
            .withIncomingSignature(incomingSignature)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

}

export default CompleteStateMessageDirector;
