import { createServer } from "./create_server.js";

// Called by msb.mjs file
export async function startRpcServer(msb, config) {
    console.log('Starting RPC server...');
    await msb.ready()
    const server = createServer(msb, config)

    return server.listen(config.port, config.host, () => {
        console.log(`Running RPC with http at http://${config.host}:${config.port}`);
    });
}
