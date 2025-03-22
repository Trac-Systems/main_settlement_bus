import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: '8e192d111aee4a29497f2967a4126fdabc2071dc7885a62a82bdfc97b4e4a2e3',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});