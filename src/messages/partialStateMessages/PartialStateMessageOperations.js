import PartialStateMessageBuilder from './PartialStateMessageBuilder.js';
import PartialStateMessageDirector from './PartialStateMessageDirector.js';

class PartialStateMessageOperations {

    /**
     * Assembles a PARTIAL bootstrap deployment operation, which can be sent to a validator.
     * The validator can sign this operation to make it COMPLETE and broadcast it to the network.
     * Bootstrap deployment is required to register a subnetwork. The network will reject
     * TransactionOperation messages for external bootstraps that are not registered.
     * Do NOT attempt to register the MSB bootstrap key.
     *
     * @param {Object} wallet - Wallet of the requester/invoker node that broadcasts the operation
     * @param {String} externalBootstrap - Bootstrap key from the subnetwork to be registered.
     *                                    MUST be different from the MSB bootstrap key.
     *                                    BEFORE deploying ensure if the subnetwork bootstrap is not already deployed.
     * @param {String} txValidity - Transaction validity hash representing the current indexer combination.
     *                              The operation remains valid as long as indexer keys maintain their order.
     *                              Acts as protection against deferred execution attacks.
     * @returns {Promise<Object>} The assembled bootstrap deployment operation message
     * @throws {Error} If assembly of the bootstrap deployment operation message fails
     */
    static async assembleBootstrapDeploymentMessage(wallet, externalBootstrap, channel, txValidity) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildPartialBootstrapDeploymentMessage(
                wallet.address,
                externalBootstrap,
                channel,
                txValidity
            );
        } catch (error) {
            throw new Error(`Failed to assemble partial bootstrap deployment message: ${error.message}`);
        }
    }

    static async assembleAddWriterMessage(wallet, writingKey, txValidity) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildAddWriterMessage(wallet.address, writingKey, txValidity);
        } catch (error) {
            throw new Error(`Failed to assemble add writer message: ${error.message}`);
        }
    }

    static async assembleRemoveWriterMessage(wallet, writerKey, txValidity) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildRemoveWriterMessage(wallet.address, writerKey, txValidity);
        } catch (error) {
            throw new Error(`Failed to assemble remove writer message: ${error.message}`);
        }
    }

    static async assembleAdminRecoveryMessage(wallet, writingKey, txValidity) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildAdminRecoveryMessage(wallet.address, writingKey, txValidity);
        } catch (error) {
            throw new Error(`Failed to assemble admin recovery message: ${error.message}`);
        }
    }


    /**
     * Assembles a PARTIAL transaction operation, which can be sent to a validator, who can then
     * sign the transaction to make it COMPLETE.
     *
     * @param {Object} wallet - Wallet of the requester/invoker node that broadcasts the transaction
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
     * @returns {Promise<Object>} The assembled transaction operation message
     * @throws {Error} If assembly of the transaction operation message fails
     */
    static async assembleTransactionOperationMessage(wallet, incomingWritingKey, txValidity, contentHash, externalBootstrap, msbBootstrap) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildTransactionOperationMessage(
                wallet.address,
                incomingWritingKey,
                txValidity,
                contentHash,
                externalBootstrap,
                msbBootstrap
            );
        } catch (error) {
            throw new Error(`Failed to assemble transaction operation message: ${error.message}`);
        }
    }

    static async assembleTransferOperationMessage(wallet, recipientAddress, amount, txValidity) {
        try {
            const builder = new PartialStateMessageBuilder(wallet);
            const director = new PartialStateMessageDirector();
            director.builder = builder;
            return await director.buildTransferOperationMessage(
                wallet.address,
                recipientAddress,
                amount,
                txValidity
            );
        } catch (error) {
            throw new Error(`Failed to assemble transfer operation message: ${error.message}`);
        }

    }

}

export default PartialStateMessageOperations;
