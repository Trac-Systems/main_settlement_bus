import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '9612ff5717f29afa489bf83cd0b0a5764b2fd433af754d7b1495103b5495fa14',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});