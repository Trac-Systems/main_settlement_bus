import {decodeBase64Payload, isBase64, sanitizeBulkPayloadsRequestBody, sanitizeTransferPayload, validatePayloadStructure} from "./utils/helpers.mjs"
import { MAX_SIGNED_LENGTH } from "./constants.mjs";

export async function handleBalance({ req, respond, msbInstance }) {
    const [path, queryString] = req.url.split("?");
    const parts = path.split("/").filter(Boolean);
    const address = parts[2];

    let confirmed = true; // default
    if (queryString) {
        const params = new URLSearchParams(queryString);
        if (params.has("confirmed")) {
            confirmed = params.get("confirmed") === "true";
        }
    }

    if (!address) {
        respond(400, { error: 'Wallet address is required' });
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
        try {
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
        } catch (error) {
            console.error('Error in handleBroadcastTransaction:', error);
            // Use 400 for client errors (like bad JSON), 500 for server/command errors
            const code = error instanceof SyntaxError ? 400 : 500;
            respond(code, { error: code === 400 ? 'Invalid JSON payload.' : 'An error occurred processing the transaction.' });
        }
    });

    req.on('error', (err) => {
        console.error('Stream error in handleBroadcastTransaction:', err);
        respond(500, { error: 'Request stream failed during body transfer.' });
    });
}

export async function handleTxHashes({ msbInstance, respond, req }) {
    const startSignedLengthStr = req.url.split('/')[3];
    const endSignedLengthStr = req.url.split('/')[4];

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
    const adjustedEndLength = Math.min(endSignedLength, currentConfirmedLength)
    
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
    const hash = req.url.split('/')[3];
    const commandString = `/get_tx_details ${hash}`;
    const txDetails = await msbInstance.handleCommand(commandString);
    respond(txDetails === null ? 404 : 200 , { txDetails });
}

export async function handleFetchBulkTxPayloads({ msbInstance, respond, req }) {
    let body = ''
    let bytesRead = 0;
    let limitBytes = 1_000_000;
    let headersSent = false; // Add a flag to prevent double response

    req.on('data', chunk => {
        if (headersSent) return; // Stop processing if response has started/errored

        bytesRead += chunk.length;
        if (bytesRead > limitBytes) { 
            respond(413, { error: 'Request body too large.' });
            headersSent = true; 
            req.destroy(); // Stop receiving data (GOOD PRACTICE)
            return;
        }
        body += chunk.toString();
    });

    req.on('end', async () => {
        if (headersSent) return; // Don't process if an error already occurred


        try {
            if (body === null || body === ''){
                return respond(400, { error: 'Missing payload.' });
            }

            const sanitizedPayload = sanitizeBulkPayloadsRequestBody(body);

            if (sanitizedPayload === null){
                return respond(400, { error: 'Invalid payload.' });
            }
            
            const { hashes } = sanitizedPayload;

            if (!Array.isArray(hashes) || hashes.length === 0) {
                return respond(400, { error: 'Missing hash list.' });
            }

            if (hashes.length > 1500) {
                return respond(413, { error: 'Too many hashes. Max 1500 allowed per request.' });
            }

            const uniqueHashes = [...new Set(hashes)];

            const commandResult = await msbInstance.handleCommand( `/get_tx_payloads_bulk`, null, uniqueHashes)

            const responseString = JSON.stringify(commandResult);
            if (Buffer.byteLength(responseString, 'utf8') > 2_000_000) {
                return respond(413, { error: 'Response too large. Reduce number of hashes.'});
            }

            return respond(200, commandResult);
        } catch (error) {
            console.error('Error in handleFetchBulkTxPayloads:', error);
            // Use 400 for JSON errors, 500 otherwise
            const code = error instanceof SyntaxError ? 400 : 500;
            respond(code, { error: code === 400 ? 'Invalid request body format.' : 'An internal error occurred.' });
        }
    })

    req.on('error', (err) => {
        console.error('Stream error in handleFetchBulkTxPayloads:', err);
        respond(500, { error: 'Request stream failed during body transfer.' });
    });
}