import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '75cfdf69c717ae551ad53c370c64cbe957437488f00304a796295becd4c94eca',
    channel: '00bptracnetworkmainsettlementbus',
    tx : 'bptracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});