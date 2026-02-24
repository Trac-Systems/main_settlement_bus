import { MainSettlementBus } from './src/index.js';
import { startRpcServer } from './rpc/rpc_server.js';
import { isRpcEnabled, resolveConfig } from './src/config/args.js';

const msb = new MainSettlementBus(resolveConfig());

msb.ready().then(async () => {
    if (isRpcEnabled()) {
        console.log('Starting RPC server...');
        startRpcServer(msb, config);
    } else {
        console.log('RPC server will not be started.');
        msb.interactiveMode();
    }
});
