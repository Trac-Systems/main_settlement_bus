import {decodeBase64Payload, isBase64, sanitizeTransferPayload, validatePayloadStructure} from "./utils/helpers.mjs"

export async function handleBalance(req, res, msbInstance) {
    try {
        const address = req.url.split('/')[2];
        if (!address) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Wallet address is required' }));
            return;
        }
        const commandString = `/get_node_info ${address}`;
        const nodeInfo = await msbInstance.handleCommand(commandString);
        const balance = nodeInfo?.balance || 0;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ address, balance }));
    } catch (error) {
        console.error('Error on searching for balance:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'An error occurred processing the request.' }));
    }
}

export async function handleTxv(req, res, msbInstance) {
    try {
        const commandString = '/get_txv';
        const txvRaw = await msbInstance.handleCommand(commandString);
        const txv = txvRaw.toString('hex');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ txv }));
    } catch (error) {
        console.error('Error on retrieving TXV:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'An error occurred processing the request.' }));
    }
}

export async function handleFee(req, res, msbInstance) {
    try {
        const commandString = '/get_fee';
        const fee = await msbInstance.handleCommand(commandString);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fee }));
    } catch (error) {
        console.error('Error on retrieving fee:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'An error occurred processing the request.' }));
    }
}

export async function handleConfirmedLength(req, res, msbInstance) {
    try {
        const commandString = '/confirmed_length';
        const confirmed_length = await msbInstance.handleCommand(commandString);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ confirmed_length }));
    } catch (error) {
        console.error('Error on retrieving confirmed_length:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'An error occurred processing the request.' }));
    }
}

export async function handleBroadcastTransaction(req, res, msbInstance) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        try {
            const { payload } = JSON.parse(body);
            if (!payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload is missing.' }));
                return;
            }

            if (!isBase64(payload)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload must be a valid base64 string.' }));
                return;
            }

            const decodedPayload = decodeBase64Payload(payload);
            validatePayloadStructure(decodedPayload);
            const sanitizedPayload = sanitizeTransferPayload(decodedPayload);
            const result = await msbInstance.handleCommand('/broadcast_transaction', null, sanitizedPayload);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
        } catch (error) {
            console.error('Error on broadcasting transaction:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

export async function handleTxHashes(req, res, msbInstance) {
    try {
        const startSignedLengthStr = req.url.split('/')[2];
        const endSignedLengthStr = req.url.split('/')[3];

        const startSignedLength = parseInt(startSignedLengthStr);
        const endSignedLength = parseInt(endSignedLengthStr);

        // 1. Check if the parsed values are valid numbers
        if (isNaN(startSignedLength) || isNaN(endSignedLength)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Params must be integer' }));
            return;
        }

        // 2. Check for non-negative numbers
        // The requirement is "non-negative," which includes 0.
        if (startSignedLength < 0 || endSignedLength < 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Params must be non-negative' }));
            return;
        }

        // 3. endSignedLength must be >= startSignedLength
        if (endSignedLength < startSignedLength) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'endSignedLength must be greater than or equal to startSignedLength.' }));
            return;
        }

        // 4. Get current confirmed length
        const currentConfirmedLength = await msbInstance.handleCommand('/confirmed_length');

        // 5. Adjust the end index to not exceed the confirmed length.
        const adjustedEndLength = Math.min(endSignedLength, currentConfirmedLength);
        
        // 6. Fetch txs hashes for the adjusted range, assuming the command takes start and end index.
        const commandString = `/get_txs_hashes ${startSignedLength} ${adjustedEndLength}`;
        const { hashes } = await msbInstance.handleCommand(commandString);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ hashes }));
        
    } catch (error) {
        console.error('Error on searching for tx hashes:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'An error occurred processing the request.' }));
    }
}