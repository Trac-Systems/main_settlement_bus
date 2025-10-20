import {MainSettlementBus} from './src/index.js';

const isPear = typeof Pear !== 'undefined';
const args = isPear ? Pear.config.args : process.argv.slice(2);

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'd783e5d61aab13bb353c4910dabc08cc92f143c4aa07e156214188a4cca75a2e',
    channel: 'TESTNET0002tracnetworkmainsettlementbus',
    chain_id: 1,
    enable_role_requester: false,
    enable_auto_transaction_consent: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: false,
    enable_txlogs: true,
};

const rpc_opts = {
    ...opts,
    enable_txlogs: false,
}

const msb = new MainSettlementBus(args.includes('--rpc') ? rpc_opts : opts);

msb.ready().then(async () => {
    const runRpc = args.includes('--rpc');
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
    }
    msb.interactiveMode();
});

