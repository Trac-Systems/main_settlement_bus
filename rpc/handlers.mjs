import {decodeBase64Payload, isBase64, sanitizeTransferPayload, validatePayloadStructure} from "./utils/helpers.mjs"
import { MAX_SIGNED_LENGTH } from "./constants.mjs";

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
    const adjustedEndLength = Math.min(endSignedLength, currentConfirmedLength);
    
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