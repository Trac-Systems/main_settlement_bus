import { MainSettlementBus } from './src/index.js';
import { startRpcServer } from './rpc/rpc_server.js';
import { startInteractiveMode } from './cli/interactive.js';
import { isRpcEnabled, resolveConfig } from './src/config/args.js';

const config = resolveConfig()
const msb = new MainSettlementBus(config)

const start = async () => {
    if (isRpcEnabled()) {
        await msb.ready()
        startRpcServer(msb, config)
    } else {
        await startInteractiveMode(msb, config)
    }
}

start()
