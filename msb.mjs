import { MainSettlementBus } from './src/index.js';
import { startRpcServer } from './rpc/rpc_server.js';
import { createConfig } from './src/config/env.js';
import { getArguments, resolveEnvironment } from './src/config/args.js';

const args = getArguments();
const runRpc = args.includes('--rpc');
const selectedEnv = resolveEnvironment(args);
const storeName = args[0]

const rpc = {
    storeName,
    enableWallet: false,
    enableInteractiveMode: false
}

const options = args.includes('--rpc') ? rpc : { storeName }
const config = createConfig(selectedEnv, options)
const msb = new MainSettlementBus(config);

msb.ready().then(async () => {
    if (runRpc) {
        console.log('Starting RPC server...');
        const portIndex = args.indexOf('--port');
        const port = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1], 10) : 5000;
        const hostIndex = args.indexOf('--host');
        const host = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : 'localhost';
        startRpcServer(msb, config, host, port);
    } else {
        console.log('RPC server will not be started.');
        msb.interactiveMode();
    }
});
