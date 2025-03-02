import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: 'eae32401c5b821e6aef397725de0f3e0d5676f858525137337f67014e8ff1255',
    channel: Buffer.alloc(32).fill('0002tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('02tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});