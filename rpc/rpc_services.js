import { bufferToBigInt } from "../src/utils/amountSerialization.js";
import {
    normalizeDecodedPayloadForJson,
    normalizeTransactionOperation,
    normalizeTransferOperation
} from "../src/utils/normalizers.js";
import { get_confirmed_tx_info, get_unconfirmed_tx_info } from "../src/utils/cli.js";
import { OperationType } from "../src/utils/constants.js";
import b4a from "b4a";
import PartialTransaction from "../src/core/network/protocols/shared/validators/PartialTransaction.js";
import PartialTransfer from "../src/core/network/protocols/shared/validators/PartialTransfer.js";
import { ValidationError, BroadcastError, NotFoundError } from "./utils/helpers.js";

export async function getBalance(msbInstance, address, confirmed) {
    const state = msbInstance.state;
    const useUnconfirmed = confirmed === false;

    const nodeEntry = useUnconfirmed
        ? await state.getNodeEntryUnsigned(address)
        : await state.getNodeEntry(address);

    if (!nodeEntry) return undefined;

    return {
        address,
        balance: bufferToBigInt(nodeEntry.balance).toString(),
    };
}

export async function getTxv(msbInstance) {
    const txv = await msbInstance.state.getIndexerSequenceState();
    return txv.toString("hex");
}

export async function getFee(msbInstance) {
    const feeBuffer = msbInstance.state.getFee();
    return bufferToBigInt(feeBuffer).toString();
}

export async function getConfirmedLength(msbInstance) {
    return msbInstance.state.getSignedLength();
}

export async function getUnconfirmedLength(msbInstance) {
    return msbInstance.state.getUnsignedLength();
}

export async function broadcastTransaction(msbInstance, config, payload) {
    if (!payload) {
        throw new ValidationError("Transaction payload is required for broadcasting.");
    }

    let normalizedPayload;
    let isValid = false;
    let hash;

    const partialTransferValidator = new PartialTransfer(msbInstance.state, null, config);
    const partialTransactionValidator = new PartialTransaction(msbInstance.state, null, config);

    if (payload.type === OperationType.TRANSFER) {
        normalizedPayload = normalizeTransferOperation(payload, config);
        isValid = await partialTransferValidator.validate(normalizedPayload);
        hash = b4a.toString(normalizedPayload.tro.tx, "hex");
    } else if (payload.type === OperationType.TX) {
        normalizedPayload = normalizeTransactionOperation(payload, config);
        isValid = await partialTransactionValidator.validate(normalizedPayload);
        hash = b4a.toString(normalizedPayload.txo.tx, "hex");
    }

    if (!isValid) {
        throw new ValidationError("Invalid transaction payload.");
    }

    const success = await msbInstance.broadcastPartialTransaction(payload);

    if (!success) {
        throw new BroadcastError("Failed to broadcast transaction after multiple attempts.");
    }

    const signedLength = msbInstance.state.getSignedLength();
    const unsignedLength = msbInstance.state.getUnsignedLength();

    return { 
        message: "Transaction broadcasted successfully.", 
        signedLength, 
        unsignedLength, 
        tx: hash 
    };
}

export async function getTxHashes(msbInstance, start, end) {
    const hashes = await msbInstance.state.confirmedTransactionsBetween(start, end);
    return { hashes };
}

export async function getTxDetails(msbInstance, hash) {
    const rawPayload = await get_confirmed_tx_info(msbInstance.state, hash);
    if (!rawPayload) {
        throw new NotFoundError(`Transaction ${hash} not found.`);
    }

    return normalizeDecodedPayloadForJson(rawPayload.decoded, msbInstance.config);
}

export async function fetchBulkTxPayloads(msbInstance, hashes) {
    if (!Array.isArray(hashes) || hashes.length === 0) {
        throw new ValidationError("Missing hash list.");
    }

    if (hashes.length > 1500) {
        throw new ValidationError("Length of input tx hashes exceeded.");
    }

    const res = { results: [], missing: [] };

    const promises = hashes.map((hash) => get_confirmed_tx_info(msbInstance.state, hash));
    const results = await Promise.all(promises);

    results.forEach((result, index) => {
        const hash = hashes[index];
        if (!result) {
            res.missing.push(hash);
        } else {
            const decodedResult = normalizeDecodedPayloadForJson(result.decoded, msbInstance.config);
            res.results.push({ hash, payload: decodedResult });
        }
    });

    return res;
}

export async function getExtendedTxDetails(msbInstance, hash, confirmed) {
    const state = msbInstance.state;
    let rawPayload;

    if (confirmed) {
        rawPayload = await get_confirmed_tx_info(state, hash);
    } else {
        rawPayload = await get_unconfirmed_tx_info(state, hash);
    }

    if (!rawPayload) {
        throw new NotFoundError(`No payload found for tx hash: ${hash}`);
    }

    const normalizedPayload = normalizeDecodedPayloadForJson(rawPayload.decoded, msbInstance.config);
    const length = await state.getTransactionConfirmedLength(hash);

    if (length === null) {
        return {
            txDetails: normalizedPayload,
            confirmed_length: 0,
            fee: "0",
        };
    }

    const feeBuffer = state.getFee();
    return {
        txDetails: normalizedPayload,
        confirmed_length: length,
        fee: bufferToBigInt(feeBuffer).toString(),
    };
}