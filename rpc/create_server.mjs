// rpc_server.mjs
import http from 'http'
import { applyCors } from './cors.mjs';
import { routes } from './router.mjs'; // Import the new routes array

export const createServer = (msbInstance) => {
  const server = http.createServer({}, async (req, res) => {
    if (applyCors(req, res)) return;

    const respond = (code, paylaod) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(paylaod));
    }

    // Find the matching route
    let foundRoute = false;
    for (const route of routes) {
        // Simple path matching
        if (req.method === route.method && req.url.startsWith(route.path)) {
            foundRoute = true;
            try {
                await route.handler({ req, res, respond, msbInstance });
            } catch {
                console.error(`Error on ${route.path}:`, error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'An error occurred processing the request.' }));
            }
            break;
        }
    }

    if (!foundRoute) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
  });

  return server
}