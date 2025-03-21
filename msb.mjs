import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: '3ad0f48d685fdf10c551e596c48596a99ff373c65845d8827da8b7862a476979',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});