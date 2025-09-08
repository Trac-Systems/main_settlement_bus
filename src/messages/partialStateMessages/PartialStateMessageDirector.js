import StateBuilder from '../base/StateBuilder.js'
import {OperationType} from '../../utils/constants.js'
import address from "../../core/state/utils/address.js";

class PartialStateMessageDirector {
    #builder;

    set builder(builderInstance) {
        if (!(builderInstance instanceof StateBuilder)) {
            throw new Error('Director requires a Builder instance.');
        }
        this.#builder = builderInstance;
    }

    /**
     * Builds a PARTIAL bootstrap deployment operation message, which can be sent to a validator.
     * The validator can sign this operation to make it COMPLETE and broadcast it to the network.
     * Bootstrap deployment is required to register a subnetwork. The network will reject
     * TransactionOperation messages for external bootstraps that are not registered.
     * Do NOT attempt to register the MSB bootstrap key.
     *
     * @param {String} address - Trac address of the requester/invoker node that broadcasts the operation.
     * @param {String} bootstrap - Bootstrap key from the subnetwork to be registered.
     *                             MUST be different from the MSB bootstrap key.
     *                             BEFORE deploying, ensure the subnetwork bootstrap is not already deployed.
     * @param {String} txValidity - Transaction validity hash representing the current indexer combination.
     *                              The operation remains valid as long as indexer keys maintain their order.
     *                              Acts as protection against deferred execution attacks.
     * @returns {Promise<Object>} The built bootstrap deployment operation message.
     * @throws {Error} If the builder has not been set or message building fails.
     */
    async buildPartialBootstrapDeploymentMessage(address, bootstrap, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.BOOTSTRAP_DEPLOYMENT)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withExternalBootstrap(bootstrap)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAddWriterMessage(address, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADD_WRITER)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildRemoveWriterMessage(address, writerKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.REMOVE_WRITER)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withWriterKey(writerKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    async buildAdminRecoveryMessage(address, writingKey, txValidity) {
        if (!this.#builder) throw new Error('Builder has not been set.');

        await this.#builder
            .forOperationType(OperationType.ADMIN_RECOVERY)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withWriterKey(writingKey)
            .buildValueAndSign();

        return this.#builder.getPayload();
    }

    /**
     * Builds a transaction operation message for cross-network communication
     * @param {String} address - Trac address of the requester/invoker node that broadcasts the transaction
     * @param {String} incomingWritingKey - Writing key from the subnetwork, used for authentication of the requesting node
     * @param {String} txValidity - Transaction validity hash representing current indexer combination.
     *                              Transaction remains valid as long as indexer keys maintain their order.
     *                              Acts as protection against deferred execution attacks.
     * @param {String} contentHash - Hash of the contract content from the subnetwork,
     *                              ensures data integrity between networks
     * @param {String} externalBootstrap - Bootstrap key from the subnetwork,
     *                                    used for cross-network communication verification.
     *                                    MUST BE DIFFERENT from the MSB bootstrap key.
     *                                    transaction will be rejected if external bootstrap won't be
     *                                    deployed in the MSB (bootstrapDeploymentOperation).
     * @param {String} msbBootstrap - Main Settlement Bus bootstrap key,
     *                                used for internal network verification
     * @returns {Promise<Object>} The built transaction operation message
     * @throws {Error} If builder hasn't been set or if message building fails
     */
    async buildTransactionOperationMessage(
        address,
        incomingWritingKey,
        txValidity,
        contentHash,
        externalBootstrap,
        msbBootstrap,
    ) {
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.TX)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withWriterKey(incomingWritingKey)
            .withContentHash(contentHash)
            .withExternalBootstrap(externalBootstrap)
            .withMsbBootstrap(msbBootstrap)
            .buildValueAndSign();
        return this.#builder.getPayload();
    }
    async buildTransferOperationMessage(address, recipientAddress, amount, txValidity){
        if (!this.#builder) throw new Error('Builder has not been set.');
        await this.#builder
            .forOperationType(OperationType.TRANSFER)
            .withAddress(address)
            .withTxValidity(txValidity)
            .withIncomingAddress(recipientAddress)
            .withAmount(amount)
            .buildValueAndSign();
        return this.#builder.getPayload();
    }
}

export default PartialStateMessageDirector;
