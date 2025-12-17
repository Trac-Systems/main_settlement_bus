import CompleteStateMessageDirector from './CompleteStateMessageDirector.js';
import CompleteStateMessageBuilder from './CompleteStateMessageBuilder.js';
import { safeEncodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import { blake3Hash } from '../../utils/crypto.js';

class CompleteStateMessageOperations {
    #config
    #wallet
    constructor(wallet, config) {
        this.#wallet = wallet
        this.#config = config
    }

    async assembleAddAdminMessage(writingKey, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);

            const payload = await director.buildAddAdminMessage(this.#wallet.address, writingKey, txValidity);
            return safeEncodeApplyOperation(payload);
        } catch (error) {
            throw new Error(`Failed to assemble admin message: ${error.message}`);
        }
    }

    async assembleDisableInitializationMessage(writingKey, txValidity) {
        const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
        const director = new CompleteStateMessageDirector(builder);

        const payload = await director.buildDisableInitializationMessage(this.#wallet.address, writingKey, txValidity);
        return safeEncodeApplyOperation(payload);
    }

    async assembleAddWriterMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);

            const payload = await director.buildAddWriterMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                incomingWritingKey,
                incomingNonce,
                incomingSignature
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble add writer message: ${error.message}`);
        }
    }

    async assembleRemoveWriterMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildRemoveWriterMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                incomingWritingKey,
                incomingNonce,
                incomingSignature
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble remove writer message: ${error.message}`);
        }
    }

    async assembleAdminRecoveryMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildAdminRecoveryMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                incomingWritingKey,
                incomingNonce,
                incomingSignature
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble remove writer message: ${error.message}`);
        }
    }

    async assembleAddIndexerMessage(incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildAddIndexerMessage(this.#wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble addIndexerMessage: ${error.message}`);
        }
    }



    async assembleRemoveIndexerMessage(incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);

            const payload = await director.buildRemoveIndexerMessage(this.#wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble removeIndexerMessage: ${error.message}`);
        }
    }

    async assembleAppendWhitelistMessages(txValidity, addressToWhitelist) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);

            const payload = await director.buildAppendWhitelistMessage(this.#wallet.address, addressToWhitelist, txValidity);
            
            return safeEncodeApplyOperation(payload);;
        } catch (error) {
            throw new Error(`Failed to assemble appendWhitelistMessages: ${error.message}`);
        }
    }

    async assembleBalanceInitializationMessages(txValidity, addressBalancePair) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const messages = [];

            for (const [recipientAddress, balanceBuffer] of addressBalancePair) {
                const payload = await director.buildBalanceInitializationMessage(
                    this.#wallet.address,
                    recipientAddress,
                    balanceBuffer,
                    txValidity
                );
                messages.push(safeEncodeApplyOperation(payload));
            }
            return messages;

        } catch (error) {
            throw new Error(`Failed to assemble balance initialization messages: ${error.message}`);
        }
    }

    async assembleBanWriterMessage(incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildBanWriterMessage(this.#wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble ban writer message: ${error.message}`);
        }
    }

    async assembleCompleteTransactionOperationMessage(
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
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);

            const payload = await director.buildTransactionOperationMessage(
                invokerAddress,
                txHash,
                txValidity,
                incomingWriterKey,
                incomingNonce,
                contentHash,
                incomingSignature,
                externalBootstrap,
                msbBootstrap,
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble transaction Operation: ${error.message}`);
        }
    }

    async assembleCompleteBootstrapDeployment(
        invokerAddress,
        transactionHash,
        txValidity,
        externalBootstrap,
        channel,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildBootstrapDeploymentMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                externalBootstrap,
                channel,
                incomingNonce,
                incomingSignature,
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble bootstrap deployment message: ${error.message}`);
        }
    }

    async assembleCompleteTransferOperationMessage(
        invokerAddress,
        transactionHash,
        txValidity,
        incomingNonce,
        recipientAddress,
        amount,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(this.#wallet, this.#config);
            const director = new CompleteStateMessageDirector(builder);


            const payload = await director.buildTransferOperationMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                incomingNonce,
                recipientAddress,
                amount,
                incomingSignature
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble transfer operation message: ${error.message}`);
        }
    }

}

export default CompleteStateMessageOperations;
