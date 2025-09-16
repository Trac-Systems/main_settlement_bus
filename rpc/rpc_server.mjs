// rpc_server.mjs
import https from 'https'
import fs from 'bare-fs'
import {decodeBase64Payload, isBase64, sanitizeTransferPayload, validatePayloadStructure} from "./utils/helpers"

// SSL Certifications
const sslOptions = {
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
}

// Called by msb.mjs file
export function startRpcServer(msbInstance, port) {
    const server = https.createServer(sslOptions, async (req, res) => {
        if (req.url.startsWith('/balance/')) {
            try {
                const address = req.url.split('/')[2]

                if (!address) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Wallet address is required' }))
                    return
                }

                const commandString = `/get_node_info ${address}`
                const nodeInfo = await msbInstance.handleCommand(commandString)
                const balance = nodeInfo?.balance || 0

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ address, balance }))
            } catch (error) {
                console.error('Error on searching for balance:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'An error occurred processing the request.' }))
            }
        } else  if (req.url.startsWith('/txv')) {
            try {
                const commandString = '/get_txv'
                const txvRaw = await msbInstance.handleCommand(commandString)
                const txv = txvRaw.toString('hex')

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ txv }))
            } catch (error) {
                console.error('Error on retrieving TXV:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'An error occurred processing the request.' }))
            }
        } else  if (req.url.startsWith('/fee')) {
            try {
                const commandString = '/get_fee'
                const fee = await msbInstance.handleCommand(commandString)
                
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ fee }))
            } catch (error) {
                console.error('Error on retrieving fee:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'An error occurred processing the request.' }))
            }
        } else  if (req.url.startsWith('/confirmed-length')) {
            try {
                const commandString = '/confirmed_length'
                const confirmed_length = await msbInstance.handleCommand(commandString)
                
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ confirmed_length }))
            } catch (error) {
                console.error('Error on retrieving confirmed_length:', error)
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'An error occurred processing the request.' }))
            }
        } else if (req.url === '/broadcast-transaction' && req.method === 'POST') {
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

                    // VALIDATE IS BASE64
                    if (!isBase64(payload)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Payload must be a valid base64 string.' }));
                        return;
                    }

                    const decodedPayload = decodeBase64Payload(payload);
                    validatePayloadStructure(decodedPayload);
                    const sanitizedPayload = sanitizeTransferPayload(decodedPayload);
                    
                    // Pass the decoded object to handleCommand.
                    const result = await msbInstance.handleCommand('/broadcast_transaction', null, sanitizedPayload);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result }));
                } catch (error) {
                    console.error('Error on broadcasting transaction:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
        } else if (req.url.startsWith("/tx-hashes/")) {
            try {
                const startSignedLengthStr = req.url.split('/')[2];
                const endSignedLengthStr = req.url.split('/')[3];

                const startSignedLength = parseInt(startSignedLengthStr);
                const endSignedLength = parseInt(endSignedLengthStr);

                // 1. Check if the parsed values are valid numbers
                if (isNaN(startSignedLength) || isNaN(endSignedLength)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'startSignedLength and endSignedLength must be valid numbers.' }));
                    return;
                }

                // 2. Check for non-negative numbers
                // The requirement is "non-negative," which includes 0.
                if (startSignedLength < 0 || endSignedLength < 0) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'startSignedLength and endSignedLength must be non-negative.' }));
                    return;
                }

                // 3. endSignedLength must be >= startSignedLength
                if (endSignedLength < startSignedLength) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'endSignedLength must be greater than or equal to startSignedLength.' }));
                    return;
                }

                // 4. If startSeq > endSeq, return an empty array
                const startSeq = startSignedLength;
                const endSeq = endSignedLength - 1;
                if (startSeq > endSeq) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ txHashes: [] }));
                    return;
                }

                // 5. Get Confirmed length
                // endSignedLength cannot exceed the current signedLength
                const commandLengthString = '/confirmed_length'
                const currentSignedLength = await msbInstance.handleCommand(commandLengthString);
                console.log("currentSignedLength", currentSignedLength);

                if (endSignedLength > currentSignedLength) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `endSignedLength cannot exceed the current signedLength of ${currentSignedLength}.` }));
                    return;
                }

                // 6. Fetch txs hashes
                const commandString = `/get_txs_hashes ${startSignedLength} ${endSignedLength}`;
                const txHashes = await msbInstance.handleCommand(commandString);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ txHashes }));
                
            } catch (error) {
                console.error('Error on searching for tx hashes:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message || 'An error occurred processing the request.' }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
        }

        
    })

    server.listen(port, () => {
        console.log(`Running RPC with https at https://localhost:${port}`)
    })
}
