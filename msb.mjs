import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '22d6f8899814e0a6c0c6509767c6d33e3c54c511d19fbe685d9d9876098bcf7f',
    channel: 'bg00bgtracnetworkmainsettlementbus',
    tx : 'bg00tracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    try { msb.interactiveMode(); } catch(e) { console.log('Interactive mode not running. Not necessarily an error.') }
});