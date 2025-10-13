import { v1Routes } from './v1.mjs';

// future version
// import { v2Routes } from './v2.mjs';

// Map each version to its route list
const routeMap = {
  v1: v1Routes,
  // for future versions use...
  // v2: v2Routes
};

// Dynamically collect supported versions from routeMap
const supportedVersions = Object.keys(routeMap);

// Helper to prefix all routes with version
function prefixRoutes(prefix, routes) {
  return routes.map(route => ({
    ...route,
    path: `/${prefix}${route.path}`,
  }));
}

// Create version-specific health check (e.g., /v1/health)
function createVersionHealthRoutes(versions) {
  return versions.map(v => ({
    method: 'GET',
    path: `/${v}/health`,
    handler: () => ({
      status: 'ok',
      version: v,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  }));
}

// Final route export
export const routes = [
  // Auto-generate /v1/health, /v2/health, etc.
  ...createVersionHealthRoutes(supportedVersions),

  // Prefix each version’s routes automatically
  ...supportedVersions.flatMap(v => prefixRoutes(v, routeMap[v])),
];
