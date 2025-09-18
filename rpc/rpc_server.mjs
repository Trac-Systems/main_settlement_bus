// rpc_server.mjs
import http from 'bare-http1'
import { applyCors } from './cors.mjs';
import { routes } from './router.mjs'; // Import the new routes array

// Called by msb.mjs file
export function startRpcServer(msbInstance, port) {
    const server = http.createServer(async (req, res) => {
        if (applyCors(req, res)) return;

        // Find the matching route
        let foundRoute = false;
        for (const route of routes) {
            // Simple path matching
            if (req.method === route.method && req.url.startsWith(route.path)) {
                foundRoute = true;
                await route.handler(req, res, msbInstance);
                break;
            }
        }

        if (!foundRoute) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    server.listen(port, () => {
        console.log(`Running RPC with https at https://localhost:${port}`);
    });
}
