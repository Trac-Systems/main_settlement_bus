import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '24fe13135fa09749ea2c046eb10f2e1008830dfd6e88f71fec27ff39c6fdf8bb',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});