import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '5bab30f8d1839aece31f55d4ead3de108f86ba6b756bebea30e284eeb7d23f58',
    channel: Buffer.alloc(32).fill('0000tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('00tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});