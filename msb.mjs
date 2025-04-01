import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '2cad3a1aeffd0db5eabc8169da8873800f4c2187299b06fffb4059caeddcdd21',
    channel: '00bptracnetworkmainsettlementbus',
    tx : 'bptracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});