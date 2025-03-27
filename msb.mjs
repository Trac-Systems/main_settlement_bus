import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: 'fd4e1b1f08606a6a4f0ccfa064f153aa8ecd11ad82861b56ed5a33ac6b87a489',
    channel: Buffer.alloc(32).fill('00bptracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('bptracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});