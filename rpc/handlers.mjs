import {decodeBase64Payload, isBase64, sanitizeBulkPayloadsRequestBody, sanitizeTransferPayload, validatePayloadStructure} from "./utils/helpers.mjs"
import { MAX_SIGNED_LENGTH, SIGNED_LENGTH_OFFSET } from "./constants.mjs";

export async function handleBalance({ req, respond, msbInstance }) {
    const [path, queryString] = req.url.split("?");
    const parts = path.split("/").filter(Boolean);
    const address = parts[1];  

    let confirmed = true; // default
    if (queryString) {
        const params = new URLSearchParams(queryString);
        if (params.has("confirmed")) {
            confirmed = params.get("confirmed") === "true";
        }
    }

    if (!address) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Wallet address is required' }));
        return;
    }
    
    const commandString =`/get_balance ${address} ${confirmed}`;
    const nodeInfo = await msbInstance.handleCommand(commandString);
    const balance = nodeInfo?.balance || 0;
    respond(200, { address, balance });
}

export async function handleTxv({ msbInstance, respond }) {
    const commandString = '/get_txv';
    const txvRaw = await msbInstance.handleCommand(commandString);
    const txv = txvRaw.toString('hex');
    respond(200, { txv });
}

export async function handleFee({ msbInstance, respond }) {
    const commandString = '/get_fee';
    const fee = await msbInstance.handleCommand(commandString);
    respond(200, { fee });
}

export async function handleConfirmedLength({ msbInstance, respond }) {
    const commandString = '/confirmed_length';
    const confirmed_length = await msbInstance.handleCommand(commandString);
    respond(200, { confirmed_length });
}

export async function handleBroadcastTransaction({ msbInstance, respond, req }) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        const { payload } = JSON.parse(body);
        if (!payload) {
            return respond(400, { error: 'Payload is missing.' });
        }

        if (!isBase64(payload)) {
            return respond(400, { error: 'Payload must be a valid base64 string.' });
        }

        const decodedPayload = decodeBase64Payload(payload);
        validatePayloadStructure(decodedPayload);
        const sanitizedPayload = sanitizeTransferPayload(decodedPayload);
        const result = await msbInstance.handleCommand('/broadcast_transaction', null, sanitizedPayload);
        respond(200, { result });
    });
}

export async function handleTxHashes({ msbInstance, respond, req }) {
    const startSignedLengthStr = req.url.split('/')[2];
    const endSignedLengthStr = req.url.split('/')[3];

    const startSignedLength = parseInt(startSignedLengthStr);
    const endSignedLength = parseInt(endSignedLengthStr);

    // 1. Check if the parsed values are valid numbers
    if (isNaN(startSignedLength) || isNaN(endSignedLength)) {
        return respond(400, { error: 'Params must be integer' });
    }

    // 2. Check for non-negative numbers
    // The requirement is "non-negative," which includes 0.
    if (startSignedLength < 0 || endSignedLength < 0) {
        return respond(400, { error: 'Params must be non-negative' });
    }

    // 3. endSignedLength must be >= startSignedLength
    if (endSignedLength < startSignedLength) {
        return respond(400, { error: 'endSignedLength must be greater than or equal to startSignedLength.' });
    }

    if (endSignedLength - startSignedLength > MAX_SIGNED_LENGTH) {
        return respond(400, { error: `The max range for signedLength must be ${MAX_SIGNED_LENGTH}.` });
    }

    // 4. Get current confirmed length
    const currentConfirmedLength = await msbInstance.handleCommand('/confirmed_length');

    // 5. Adjust the end index to not exceed the confirmed length.
    const adjustedEndLength = Math.min(endSignedLength, currentConfirmedLength) + SIGNED_LENGTH_OFFSET // apply an offset to include in the end
    
    // 6. Fetch txs hashes for the adjusted range, assuming the command takes start and end index.
    const commandString = `/get_txs_hashes ${startSignedLength} ${adjustedEndLength}`;
    const { hashes } = await msbInstance.handleCommand(commandString);
    respond(200, { hashes });
}

export async function handleUnconfirmedLength({ msbInstance, respond }) {
    const commandString = '/unconfirmed_length';
    const unconfirmed_length = await msbInstance.handleCommand(commandString);
    respond(200, { unconfirmed_length });
}

export async function handleTransactionDetails({ msbInstance, respond, req }) {
    const hash = req.url.split('/')[2];
    const commandString = `/get_tx_details ${hash}`;
    const txDetails = await msbInstance.handleCommand(commandString);
    respond(200, { txDetails });
}

export async function handleFetchBulkTxPayloads(req, res, msbInstance) {
    try {
        const sanitizedPayload = await sanitizeBulkPayloadsRequestBody(req);

        if (sanitizedPayload === null){
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing payload.' }));
            return;
        }

        const { hashes } = sanitizedPayload;

        if (!Array.isArray(hashes) || hashes.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing hash list.' }));
            return;
        }

        if (hashes.length > 1500) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many hashes. Max 1500 allowed per request.' }));
            return;
        }

        const uniqueHashes = [...new Set(hashes)];

        const commandResult = await msbInstance.handleCommand( `/get_tx_payloads_bulk`, null, uniqueHashes)

        const responseString = JSON.stringify(commandResult);
        if (Buffer.byteLength(responseString, 'utf8') > 2_000_000) {
            const err = new Error('Response too large. Reduce number of hashes.');
            err.statusCode = 413;
            throw err;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseString);
    } catch (error) {
        console.error('Error on retrieving transaction payloads:', error);
        const status = error.statusCode || 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'An error occurred processing the request.' }));
    }
}

export async function handleFetchBulkTxPayloads(req, res, msbInstance) {
    try {
        const sanitizedPayload = await sanitizeBulkPayloadsRequestBody(req);

        if (sanitizedPayload === null){
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing payload.' }));
            return;
        }

        const { hashes } = sanitizedPayload;

        if (!Array.isArray(hashes) || hashes.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing hash list.' }));
            return;
        }

        if (hashes.length > 1500) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many hashes. Max 1500 allowed per request.' }));
            return;
        }

        const uniqueHashes = [...new Set(hashes)];

        const commandResult = await msbInstance.handleCommand( `/get_tx_payloads_bulk`, null, uniqueHashes)

        const responseString = JSON.stringify(commandResult);
        if (Buffer.byteLength(responseString, 'utf8') > 2_000_000) {
            const err = new Error('Response too large. Reduce number of hashes.');
            err.statusCode = 413;
            throw err;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseString);
    } catch (error) {
        console.error('Error on retrieving transaction payloads:', error);
        const status = error.statusCode || 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'An error occurred processing the request.' }));
    }
}