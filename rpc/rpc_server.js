import { createServer } from "./create_server.js";

// Called by msb.mjs file
export function startRpcServer(msbInstance, config) {
    const server = createServer(msbInstance, config)

    return server.listen(config.port, config.host, () => {
        console.log(`Running RPC with http at http://${config.host}:${config.port}`);
    });
}
