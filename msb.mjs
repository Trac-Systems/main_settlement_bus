import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '8ed1b9ca60667f242820907ca0ae7ffd94bf1c315d9c7c3917e2edad6f55324c',
    channel: Buffer.alloc(32).fill('0001tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('01tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});