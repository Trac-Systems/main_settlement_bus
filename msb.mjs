import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '07814eb54b2a3ebf61506f056fa1235d11431fcfb6505dccfa880146938093a6',
    channel: '00ogtracnetworkmainsettlementbus',
    tx : 'ogtracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    try { msb.interactiveMode(); } catch(e) { console.log('Interactive mode not running. Not necessarily an error.') }
});