// rpc_server.mjs
import https from 'https'
import fs from 'bare-fs'

// SSL Certifications
const sslOptions = {
    key: fs.readFileSync('./key.pem'),
    cert: fs.readFileSync('./cert.pem'),
}

// Called by msb.mjs file
export function startRpcServer(msbInstance) {
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
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not Found')
        }
    })

    const port = 3000
    server.listen(port, () => {
        console.log(`Running RPC with https at https://localhost:${port}`)
    })
}
