import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '08175b63ca8968b49cd036e4526fb95b33adf41b375dbdc9e8d9e1b770a3662e',
    channel: Buffer.alloc(32).fill('0000tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('00tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});