import CompleteStateMessageDirector from './CompleteStateMessageDirector.js';
import CompleteStateMessageBuilder from './CompleteStateMessageBuilder.js';
import { safeEncodeApplyOperation } from '../../utils/protobuf/operationHelpers.js';
import fileUtils from '../../../src/utils/fileUtils.js';

class CompleteStateMessageOperations {

    static async assembleAddAdminMessage(wallet, writingKey, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddAdminMessage(wallet.address, writingKey, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble admin message: ${error.message}`);
        }
    }

    static async assembleDisableInitializationMessage(wallet, writingKey, txValidity) {
        const builder = new CompleteStateMessageBuilder(wallet);
        const director = new CompleteStateMessageDirector();
        director.builder = builder;

        const payload = await director.buildDisableInitializationMessage(wallet.address, writingKey, txValidity);
        return safeEncodeApplyOperation(payload);
    }

    static async assembleAddWriterMessage(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

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

    static async assembleRemoveWriterMessage(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

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

    static async assembleAdminRecoveryMessage(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        incomingWritingKey,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

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

    static async assembleAddIndexerMessage(wallet, incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildAddIndexerMessage(wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble addIndexerMessage: ${error.message}`);
        }
    }



    static async assembleRemoveIndexerMessage(wallet, incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildRemoveIndexerMessage(wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble removeIndexerMessage: ${error.message}`);
        }
    }

    static async assembleAppendWhitelistMessages(wallet, txValidity) {
        try {

            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const messages = new Map();
            const addresses = await fileUtils.readPublicKeysFromFile();

            for (const addressToWhitelist of addresses) {
                const payload = await director.buildAppendWhitelistMessage(wallet.address, addressToWhitelist, txValidity);
                const encodedPayload = safeEncodeApplyOperation(payload);
                messages.set(addressToWhitelist, encodedPayload);
            }

            return messages;
        } catch (error) {
            throw new Error(`Failed to assemble appendWhitelistMessages: ${error.message}`);
        }
    }

    static async assembleBalanceInitializationMessages(wallet, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const messages = [];
            const { addressBalancePair, totalBalance, totalAddresses, addresses } = await fileUtils.readBalanceMigrationFile();

            for (const [recipientAddress, balanceBuffer] of addressBalancePair) {
                const payload = await director.buildBalanceInitializationMessage(
                    wallet.address,
                    recipientAddress,
                    balanceBuffer,
                    txValidity
                );
                messages.push(safeEncodeApplyOperation(payload));
            }
            return { messages, totalBalance, totalAddresses, addresses };

        } catch (error) {
            throw new Error(`Failed to assemble balance initialization messages: ${error.message}`);
        }
    }

    static async assembleBanWriterMessage(wallet, incomingAddress, txValidity) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildBanWriterMessage(wallet.address, incomingAddress, txValidity);
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble ban writer message: ${error.message}`);
        }
    }

    static async assembleCompleteTransactionOperationMessage(
        wallet,
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
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;
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

    static async assembleCompleteBootstrapDeployment(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        externalBootstrap,
        incomingNonce,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

            const payload = await director.buildBootstrapDeploymentMessage(
                invokerAddress,
                transactionHash,
                txValidity,
                externalBootstrap,
                incomingNonce,
                incomingSignature,
            );
            return safeEncodeApplyOperation(payload);

        } catch (error) {
            throw new Error(`Failed to assemble ban writer message: ${error.message}`);
        }
    }

    static async assembleCompleteTransferOperationMessage(
        wallet,
        invokerAddress,
        transactionHash,
        txValidity,
        incomingNonce,
        recipientAddress,
        amount,
        incomingSignature
    ) {
        try {
            const builder = new CompleteStateMessageBuilder(wallet);
            const director = new CompleteStateMessageDirector();
            director.builder = builder;

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
