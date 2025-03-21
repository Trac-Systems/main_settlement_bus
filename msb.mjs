import MainSettlementBus from './src/index.js';
const opts = {
    stores_directory : 'stores/',
    store_name : process.argv[2],
    bootstrap: 'a0b246a66f93d0fda58e661a51d0a17f4fa457aa03040dc26c1292c77f1853eb',
    channel: Buffer.alloc(32).fill('00botracnetworkmainsettlementbus'),
    tx : Buffer.alloc(32).fill('1botracnetworkmainsettlementbustx')
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});