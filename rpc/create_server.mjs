// rpc_server.mjs
import http from 'http'
import { applyCors } from './cors.mjs';
import { routes } from './routes';

export const createServer = (msbInstance) => {
  const server = http.createServer({}, async (req, res) => {
    
    // --- 1. Define safe 'respond' utility (Payload MUST be an object) ---
    const respond = (code, payload) => {
      // FIX: Prevent attempts to write headers if a response has already started
      if (res.headersSent) {
          console.warn(`Attempted to send response (Code: ${code}) after headers were already sent. payload:`, payload);
          return;
      }
      
      // Enforce JSON content type for all responses
      res.writeHead(code, { 'Content-Type': 'application/json' });
      
      // CRITICAL: Always JSON.stringify the input object
      res.end(JSON.stringify(payload)); 
    }

    // --- 2. Catch low-level request stream errors ---
    req.on('error', (err) => {
      console.error('Request stream error:', err);
      // Use the safe respond utility
      respond(500, { error: 'A stream-level request error occurred.' });
    });

    if (applyCors(req, res)) return;

    // Find the matching route
    let foundRoute = false;
    for (const route of routes) {
        // Simple path matching
        if (req.method === route.method && req.url.startsWith(route.path)) {
            foundRoute = true;
            try {
                // This try/catch covers synchronous errors and errors from awaited promises
                // within the route.handler function.
                await route.handler({ req, res, respond, msbInstance });
            } catch (error) {
                // Catch errors thrown directly from the handler (or its awaited parts)
                console.error(`Error on ${route.path}:`, error);
                
                // FIX: Pass an object payload
                respond(500, { error: 'An error occurred processing the request.' });
            }
            break;
        }
    }

    if (!foundRoute) {
        respond(404, { error: 'Not Found' });
    }
  });

  return server
}