// rpc_server.mjs
import https from 'https'
import fs from 'bare-fs'
import b4a from 'b4a';

// SSL Certifications
const sslOptions = {
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
}

function decodePayload(base64) {
    let decodedPayloadString;
    try {
        decodedPayloadString = b4a.from(base64, 'base64').toString('utf-8');
    } catch (err) {
        throw new Error('Failed to decode base64 payload.');
    }

    
    try {
        return JSON.parse(decodedPayloadString);
    } catch (err) {
        throw new Error('Decoded payload is not valid JSON.');
    }
}

function isBase64(str) {
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    return base64Regex.test(str);
}

function validatePayloadStructure(payload) {
    // VALIDATE PAYLOAD
    if (
        typeof payload !== 'object' || payload === null || typeof payload.type !== 'number' || typeof payload.address !== 'string' || typeof payload.tro !== 'object'
    ) {
        throw new Error('Invalid payload structure.');
    }
}

function sanitizePayload(payload) {
  if (payload.address && typeof payload.address === 'string') {
    payload.address = payload.address.trim();
  }

  if (payload.tro && typeof payload.tro === 'object') {
    for (const [key, value] of Object.entries(payload.tro)) {
      if (typeof value === 'string') {
        let sanitized = value.trim();

        // normalize hex-like strings
        if (/^[0-9A-F]+$/i.test(sanitized)) {
          sanitized = sanitized.toLowerCase();
        }

        payload.tro[key] = sanitized;
      }
    }
  }

  return payload;
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

                    const decodedPayload = decodePayload(payload);
                    validatePayloadStructure(decodedPayload);
                    const sanitizedPayload = sanitizePayload(decodedPayload);
                    
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
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
        }

        
    })

    server.listen(port, () => {
        console.log(`Running RPC with https at https://localhost:${port}`)
    })
}
