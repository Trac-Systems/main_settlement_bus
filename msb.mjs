import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: 'c7e599fcfd2f3d4cabef54c9261bad587b3dc3335c2cdd449f21137f5a3f5d68',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});