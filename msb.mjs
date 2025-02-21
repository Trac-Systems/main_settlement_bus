import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    channel: Buffer.alloc(32).fill('0000tracnetworkmainsettlementbus'),
    bootstrap: 'd5459acabab6cc4c91e7235f5d261614edb8d545b3e6015138dacabee04d6fa1'
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});