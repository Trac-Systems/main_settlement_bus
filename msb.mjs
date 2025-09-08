import {MainSettlementBus} from './src/index.js';
import {startRpcServer} from './rpc/rpc_server.mjs';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '602d5443c19014e36a01254923afb1df56099d559f282761d70370a0da5d1d8a',
    channel: '0002tracnetworkmainsettlementbus',
    enable_role_requester: false,
    enable_auto_transaction_consent: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: true,
    enable_txlogs: true,
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    const runRpc = Pear.config.args.includes('--rpc')

    if (runRpc) {
        console.log('Starting RPC server...')
        startRpcServer(msb)
    } else {
        console.log('RPC server will not be started.')
    }

    msb.interactiveMode()
})

