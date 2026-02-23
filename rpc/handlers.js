import { 
    decodeBase64Payload, 
    isBase64, 
    isValidTxHash, 
    sanitizeBulkPayloadsRequestBody, 
    sanitizeTransferPayload, 
    validatePayloadStructure,
    hasSpacesInUrl,
    BroadcastError, 
    ValidationError,
    NotFoundError
} from "./utils/helpers.js"
import { MAX_SIGNED_LENGTH, ZERO_WK } from "./constants.js";
import { buildRequestUrl } from "./utils/url.js";
import {
    getBalance,
    getTxv,
    getFee,
    getConfirmedLength,
    getUnconfirmedLength,
    broadcastTransaction,
    getTxHashes,
    getTxDetails,
    fetchBulkTxPayloads,
    getExtendedTxDetails,
} from "./rpc_services.js";
import { bufferToBigInt, licenseBufferToBigInt } from "../src/utils/amountSerialization.js";
import { isAddressValid } from "../src/core/state/utils/address.js";
import { getConfirmedParameter } from "./utils/confirmedParameter.js";

export async function handleHealth({ msbInstance, respond }) {
    try {
        const isReady = msbInstance && msbInstance.state;
        if (isReady) return respond(200, { ok: true });
        throw new Error("RPC_OFFLINE");
    } catch (error) {
        respond(503, { error: "Could not connect to RPC server" });
    }
}

export async function handleBalance({ req, respond, msbInstance }) {
    const url = buildRequestUrl(req);
    const parts = url.pathname.split("/").filter(Boolean);
    const address = parts[2];

    if (!address) {
        respond(400, { error: 'Wallet address is required' });
        return;
    }

    const hrp = msbInstance.config.addressPrefix;
    if (!isAddressValid(address, hrp)) {
        respond(400, { error: 'Invalid account address format' });
        return;
    }

    const nodeInfo = await getBalance(msbInstance, address, getConfirmedParameter(url) ?? false);
    const balance = nodeInfo?.balance || "0";

    respond(200, { address, balance });
}

export async function handleTxv({ msbInstance, respond }) {
    const txv = await getTxv(msbInstance);
    respond(200, { txv });
}

export async function handleFee({ msbInstance, respond }) {
    const fee = await getFee(msbInstance);
    respond(200, { fee });
}

export async function handleConfirmedLength({ msbInstance, respond }) {
    const confirmed_length = await getConfirmedLength(msbInstance);
    respond(200, { confirmed_length });
}

export async function handleBroadcastTransaction({ msbInstance, config, respond, req }) {
    let body = '';
    const MAX_BODY_SIZE = 2_000_000;
    let limitExceeded = false;

    req.on('data', chunk => {
        if (limitExceeded) return;
        body += chunk.toString();
        if (body.length > MAX_BODY_SIZE) {
            limitExceeded = true;
            respond(413, { error: 'Payload too large.' });
            req.resume();
        }
    });

    req.on('end', async () => {
        if (limitExceeded) return;

        try {
            if (!body) {
                throw new ValidationError("Invalid JSON payload.");
            }

            let parsedBody;
            try {
                parsedBody = JSON.parse(body);
            } catch (e) {
                throw new ValidationError("Invalid JSON payload.");
            }

            const { payload } = parsedBody;
            if (!payload) {
                throw new ValidationError("Payload is missing.");
            }

            if (!isBase64(payload)) {
                throw new ValidationError("Payload must be a valid base64 string.");
            }

            const decodedPayload = decodeBase64Payload(payload);
            validatePayloadStructure(decodedPayload);
            const sanitizedPayload = sanitizeTransferPayload(decodedPayload);

            const result = await broadcastTransaction(msbInstance, config, sanitizedPayload);
            respond(200, { result });

        } catch (error) {
            let code = 500;
            let errorMsg = 'An error occurred processing the transaction.';

            if (error instanceof ValidationError || error instanceof SyntaxError) {
                code = 400;
                errorMsg = error.message;
            } 
            else if (error instanceof BroadcastError) {
                code = 429;
                errorMsg = error.message;
            }

            if (code === 500) {
                console.error('Error in handleBroadcastTransaction:', error);
            }

            respond(code, { error: errorMsg });
        }
    });

    req.on('error', (err) => {
        if (!limitExceeded) {
            respond(500, { error: 'Request stream failed during body transfer.' });
        }
    });
}

export async function handleTxHashes({ msbInstance, respond, req }) {
    const url = buildRequestUrl(req);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const startSignedLengthStr = pathParts[2];
    const endSignedLengthStr = pathParts[3];

    const startSignedLength = parseInt(startSignedLengthStr);
    const endSignedLength = parseInt(endSignedLengthStr);

    if (isNaN(startSignedLength) || isNaN(endSignedLength)) {
        return respond(400, { error: 'Params must be integer' });
    }

    if (startSignedLength < 0 || endSignedLength < 0) {
        return respond(400, { error: 'Params must be non-negative' });
    }

    if (endSignedLength < startSignedLength) {
        return respond(400, { error: 'endSignedLength must be greater than or equal to startSignedLength.' });
    }

    if (endSignedLength - startSignedLength > MAX_SIGNED_LENGTH) {
        return respond(400, { error: `The max range for signedLength must be ${MAX_SIGNED_LENGTH}.` });
    }

    const currentConfirmedLength = await getConfirmedLength(msbInstance);
    const adjustedEndLength = Math.min(endSignedLength, currentConfirmedLength)

    const { hashes } = await getTxHashes(msbInstance, startSignedLength, adjustedEndLength);
    respond(200, { hashes });
}

export async function handleUnconfirmedLength({ msbInstance, respond }) {
    const unconfirmed_length = await getUnconfirmedLength(msbInstance);
    respond(200, { unconfirmed_length });
}

export async function handleTransactionDetails({ msbInstance, respond, req }) {
    if (hasSpacesInUrl(req.url)) {
        return respond(400, { error: "Invalid transaction hash format" });
    }

    const url = buildRequestUrl(req);
    const parts = url.pathname.split('/').filter(Boolean);
    const rawHash = parts[parts.length - 1];

    if (!rawHash || rawHash === 'tx') {
        return respond(400, { error: "Transaction hash is required" });
    }

    const normalizedHash = rawHash.toLowerCase();
    if (!isValidTxHash(normalizedHash)) {
        return respond(400, { error: "Invalid transaction hash format" });
    }

    try {
        const txDetails = await getTxDetails(msbInstance, normalizedHash);
        respond(200, { txDetails });
    } catch (error) {
        let code = 500;
        let errorMsg = "Internal error";

        if (error instanceof NotFoundError) {
            code = 404;
            errorMsg = error.message;
        }

        respond(code, { [code === 404 ? 'txDetails' : 'error']: code === 404 ? null : errorMsg });
    }
}

export async function handleTransactionExtendedDetails({ msbInstance, respond, req }) {
    if (hasSpacesInUrl(req.url)) {
        return respond(400, { error: "Invalid transaction hash format" });
    }

    const url = buildRequestUrl(req);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const hashRaw = pathParts[pathParts.length - 1];

    if (!hashRaw || hashRaw === 'details' || hashRaw === 'tx') {
        return respond(400, { error: "Transaction hash is required" });
    }

    const hash = hashRaw.toLowerCase();
    if (!isValidTxHash(hash)) {
        return respond(400, { error: "Invalid transaction hash format" });
    }

    const confirmed = getConfirmedParameter(url);
    if (confirmed === null) {
        return respond(400, { error: 'Parameter "confirmed" must be exactly "true" or "false"' });
    }

    try {
        const details = await getExtendedTxDetails(msbInstance, hash, confirmed);
        respond(200, details);
    } catch (error) {
        let code = 500;
        let errorMsg = 'An error occurred processing the request.';

        if (error instanceof NotFoundError) {
            code = 404;
            errorMsg = error.message;
        }

        respond(code, { error: errorMsg });
    }
}

export async function handleFetchBulkTxPayloads({ msbInstance, respond, req }) {
    let body = ''
    let bytesRead = 0;
    let limitBytes = 1_000_000;
    let headersSent = false;

    req.on('data', chunk => {
        if (headersSent) return;
        bytesRead += chunk.length;
        if (bytesRead > limitBytes) {
            respond(413, { error: 'Request body too large.' });
            headersSent = true;
            req.destroy();
            return;
        }
        body += chunk.toString();
    });

    req.on('end', async () => {
        if (headersSent) return;

        try {
            if (!body) {
                throw new ValidationError("Missing payload.");
            }

            const sanitizedPayload = sanitizeBulkPayloadsRequestBody(body);
            if (!sanitizedPayload) {
                throw new ValidationError("Invalid payload.");
            }

            const { hashes } = sanitizedPayload;
            const uniqueHashes = [...new Set(hashes)];
            const commandResult = await fetchBulkTxPayloads(msbInstance, uniqueHashes);

            const responseString = JSON.stringify(commandResult);
            if (Buffer.byteLength(responseString, 'utf8') > 2_000_000) {
                return respond(413, { error: 'Response too large. Reduce number of hashes.' });
            }

            return respond(200, commandResult);
        } catch (error) {
            let code = 500;
            let errorMsg = 'An internal error occurred.';

            if (error instanceof ValidationError || error instanceof SyntaxError) {
                code = 400;
                errorMsg = error instanceof SyntaxError ? 'Invalid request body format.' : error.message;
            }

            respond(code, { error: errorMsg });
        }
    })

    req.on('error', (err) => {
        respond(500, { error: 'Request stream failed during body transfer.' });
    });
}

export async function handleAccountDetails({ msbInstance, respond, req }) {
    const url = buildRequestUrl(req);
    const address = url.pathname.split('/').filter(Boolean)[2];

    if (!address) {
        return respond(400, { error: "Account address is required" });
    }

    const confirmed = getConfirmedParameter(url);
    if (confirmed === null) {
        return respond(400, { error: 'Parameter "confirmed" must be exactly "true" or "false"' });
    }

    if (!isAddressValid(address, msbInstance.config.addressPrefix)) {
        return respond(400, { error: "Invalid account address format" });
    }

    const defaultAccountState = {
        address,
        writingKey: ZERO_WK.toString('hex'),
        isWhitelisted: false,
        isValidator: false,
        isIndexer: false,
        license: null,
        balance: '0',
        stakedBalance: '0',
    };

    const nodeEntry = confirmed
        ? await msbInstance.state.getNodeEntry(address)
        : await msbInstance.state.getNodeEntryUnsigned(address);
    if (!nodeEntry) {
        return respond(200, defaultAccountState);
    }

    const licenseValue = licenseBufferToBigInt(nodeEntry.license);

    return respond(200, {
        ...defaultAccountState,
        writingKey: nodeEntry.wk.toString('hex'),
        isWhitelisted: nodeEntry.isWhitelisted,
        isValidator: nodeEntry.isWriter,
        isIndexer: nodeEntry.isIndexer,
        license: licenseValue === 0n ? null : licenseValue.toString(),
        balance: bufferToBigInt(nodeEntry.balance).toString(),
        stakedBalance: bufferToBigInt(nodeEntry.stakedBalance).toString(),
    });
}