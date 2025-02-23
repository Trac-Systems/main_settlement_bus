import Corestore from 'corestore';
import MainSettlementBus from './src/index.js';

const store = new Corestore('stores/' + process.argv[2])

const opts = {
    bootstrap: '7ef1fab8ddff5fbfd9aac7c52a8543f81ec87060a4efe2f682adadfcecb9a7b5',
    channel: Buffer.alloc(32).fill('0000tracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('00tracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(store, opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});