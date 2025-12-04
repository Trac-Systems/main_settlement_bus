import { MainSettlementBus } from './src/index.js';

const pearApp = typeof Pear !== 'undefined' ? (Pear.app ?? Pear.config) : undefined;
const runtimeArgs = typeof process !== 'undefined' ? process.argv.slice(2) : [];
const args = pearApp?.args ?? runtimeArgs;
const runRpc = args.includes('--rpc');

const opts = {
    stores_directory: 'stores/',
    store_name: pearApp?.args?.[0] ?? runtimeArgs[0],
    bootstrap: 'acbc3a4344d3a804101d40e53db1dda82b767646425af73599d4cd6577d69685',
    channel: '0000trac0network0msb0mainnet0000',
    enable_role_requester: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: false,
    enable_tx_apply_logs: false,
    enable_error_apply_logs: false,
};

const rpc_opts = {
    ...opts,
    enable_tx_apply_logs: false,
    enable_error_apply_logs: false,
    enable_wallet: false,
    enable_interactive_mode: false,
};

const msb = new MainSettlementBus(runRpc ? rpc_opts : opts);

msb.ready().then(async () => {
    if (runRpc) {
        console.log('Starting RPC server...');
        const portIndex = args.indexOf('--port');
        const port = (portIndex !== -1 && args[portIndex + 1]) ? parseInt(args[portIndex + 1], 10) : 5000;
        const hostIndex = args.indexOf('--host');
        const host = (hostIndex !== -1 && args[hostIndex + 1]) ? args[hostIndex + 1] : 'localhost';

        const {startRpcServer} = await import('./rpc/rpc_server.mjs');
        startRpcServer(msb, host, port);
    } else {
        console.log('RPC server will not be started.');
        msb.interactiveMode();
    }
});
