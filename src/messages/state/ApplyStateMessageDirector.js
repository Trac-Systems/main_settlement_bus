import { OperationType } from '../../utils/constants.js';

class ApplyStateMessageDirector {
    #builder;

    constructor(builderInstance) {
        this.#builder = builderInstance;
    }

    async buildPartialAddWriterMessage(invokerAddress, writingKey, txValidity, output) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.ADD_WRITER)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setWriterKey(writingKey)
            .build();
        return this.#builder.getPayload();
    }

    async buildPartialRemoveWriterMessage(invokerAddress, writerKey, txValidity, output) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.REMOVE_WRITER)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setWriterKey(writerKey)
            .build();
        return this.#builder.getPayload();
    }

    async buildPartialAdminRecoveryMessage(invokerAddress, writingKey, txValidity, output) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.ADMIN_RECOVERY)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setWriterKey(writingKey)
            .build();
        return this.#builder.getPayload();
    }

    async buildPartialTransactionOperationMessage(
        invokerAddress,
        incomingWritingKey,
        txValidity,
        contentHash,
        externalBootstrap,
        msbBootstrap,
        output
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.TX)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setWriterKey(incomingWritingKey)
            .setContentHash(contentHash)
            .setExternalBootstrap(externalBootstrap)
            .setMsbBootstrap(msbBootstrap)
            .build();
        return this.#builder.getPayload();
    }

    async buildPartialBootstrapDeploymentMessage(invokerAddress, bootstrap, channel, txValidity, output) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setExternalBootstrap(bootstrap)
            .setChannel(channel)
            .build();
        return this.#builder.getPayload();
    }

    async buildPartialTransferOperationMessage(invokerAddress, recipientAddress, amount, txValidity, output) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('partial')
            .setOutput(output)
            .setOperationType(OperationType.TRANSFER)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setIncomingAddress(recipientAddress)
            .setAmount(amount)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteAddAdminMessage(invokerAddress, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.ADD_ADMIN)
            .setAddress(invokerAddress)
            .setWriterKey(writingKey)
            .setTxValidity(txValidity)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteDisableInitializationMessage(invokerAddress, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.DISABLE_INITIALIZATION)
            .setAddress(invokerAddress)
            .setWriterKey(writingKey)
            .setTxValidity(txValidity)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteBalanceInitializationMessage(invokerAddress, recipientAddress, amount, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.BALANCE_INITIALIZATION)
            .setAddress(invokerAddress)
            .setIncomingAddress(recipientAddress)
            .setAmount(amount)
            .setTxValidity(txValidity)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteAppendWhitelistMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.APPEND_WHITELIST)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setIncomingAddress(incomingAddress)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteAddWriterMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.ADD_WRITER)
            .setAddress(invokerAddress)
            .setTxHash(txHash)
            .setTxValidity(txValidity)
            .setIncomingWriterKey(incomingWritingKey)
            .setIncomingNonce(incomingNonce)
            .setIncomingSignature(incomingSignature)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteRemoveWriterMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.REMOVE_WRITER)
            .setAddress(invokerAddress)
            .setTxHash(txHash)
            .setTxValidity(txValidity)
            .setIncomingWriterKey(incomingWritingKey)
            .setIncomingNonce(incomingNonce)
            .setIncomingSignature(incomingSignature)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteAdminRecoveryMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.ADMIN_RECOVERY)
            .setAddress(invokerAddress)
            .setTxHash(txHash)
            .setTxValidity(txValidity)
            .setIncomingWriterKey(incomingWritingKey)
            .setIncomingNonce(incomingNonce)
            .setIncomingSignature(incomingSignature)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteAddIndexerMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.ADD_INDEXER)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setIncomingAddress(incomingAddress)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteRemoveIndexerMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.REMOVE_INDEXER)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setIncomingAddress(incomingAddress)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteBanWriterMessage(invokerAddress, incomingAddress, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.BAN_VALIDATOR)
            .setAddress(invokerAddress)
            .setTxValidity(txValidity)
            .setIncomingAddress(incomingAddress)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteTransactionOperationMessage(
        invokerAddress,
        txHash,
        txValidity,
        incomingWriterKey,
        incomingNonce,
        contentHash,
        incomingSignature,
        externalBootstrap,
        msbBootstrap
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.TX)
            .setAddress(invokerAddress)
            .setTxHash(txHash)
            .setTxValidity(txValidity)
            .setIncomingWriterKey(incomingWriterKey)
            .setIncomingNonce(incomingNonce)
            .setContentHash(contentHash)
            .setIncomingSignature(incomingSignature)
            .setExternalBootstrap(externalBootstrap)
            .setMsbBootstrap(msbBootstrap)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteBootstrapDeploymentMessage(
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
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .setAddress(invokerAddress)
            .setTxHash(transactionHash)
            .setTxValidity(txValidity)
            .setExternalBootstrap(externalBootstrap)
            .setChannel(channel)
            .setIncomingNonce(incomingNonce)
            .setIncomingSignature(incomingSignature)
            .build();
        return this.#builder.getPayload();
    }

    async buildCompleteTransferOperationMessage(
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
            .setPhase('complete')
            .setOutput('buffer')
            .setOperationType(OperationType.TRANSFER)
            .setAddress(invokerAddress)
            .setTxHash(transactionHash)
            .setTxValidity(txValidity)
            .setIncomingNonce(incomingNonce)
            .setIncomingAddress(recipientAddress)
            .setAmount(amount)
            .setIncomingSignature(incomingSignature)
            .build();
        return this.#builder.getPayload();
    }
}

export default ApplyStateMessageDirector;
