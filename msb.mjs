import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: 'f4f0dd826c2c8a763f2435cc8dc1af6b5466c0087a34ee679bb91e16df431492',
    channel: Buffer.alloc(32).fill('0000tracnetworkmainsettlementbus')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});