import { createServer } from "./create_server.mjs";

// Called by msb.mjs file
export function startRpcServer(msbInstance, port) {
    const server = createServer(msbInstance)

    return server.listen(port, () => {
        console.log(`Running RPC with https at https://localhost:${port}`);
    });
}
