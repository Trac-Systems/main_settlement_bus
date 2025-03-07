import MainSettlementBus from './src/index.js';
import {store} from './src/index.js';
const opts = {
    bootstrap: '73d5b1fa25e495aa4782e4524c10ee60563b447498c071a27516ee282bcbbeba',
    channel: Buffer.alloc(32).fill('0002tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('02tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});