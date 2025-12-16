import { MainSettlementBus } from './src/index.js';
import { startRpcServer } from './rpc/rpc_server.js';
import { createConfig, ENV } from './src/config/env.js';

const pearApp = typeof Pear !== 'undefined' ? (Pear.app ?? Pear.config) : undefined;
const runtimeArgs = typeof process !== 'undefined' ? process.argv.slice(2) : [];
const args = pearApp?.args ?? runtimeArgs;
const runRpc = args.includes('--rpc');

const rpc = {
    store_name: pearApp?.args?.[0] ?? runtimeArgs[0],
    enable_wallet: false,
    enable_interactive_mode: false
}

const options = args.includes('--rpc') ? rpc : {}

const msb = new MainSettlementBus(createConfig(ENV.MAINNET, options));

msb.ready().then(async () => {
    if (runRpc) {
        console.log('Starting RPC server...');
        const portIndex = args.indexOf('--port');
        const port = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1], 10) : 5000;
        const hostIndex = args.indexOf('--host');
        const host = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : 'localhost';
        startRpcServer(msb, host, port);
    } else {
        console.log('RPC server will not be started.');
        msb.interactiveMode();
    }
});
