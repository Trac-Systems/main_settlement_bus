import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: '8259c834ef948d4ea1b36ea24165a5b91aeb295f1347f3efec6e6fb4e4ebc7cb',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});