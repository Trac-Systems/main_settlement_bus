import { createServer } from "./create_server.mjs";

// Called by msb.mjs file
export function startRpcServer(msbInstance, host, port) {
    const server = createServer(msbInstance)

    return server.listen(port, host, () => {
        console.log(`Running RPC with https at https://${host}:${port}`);
    });
}
