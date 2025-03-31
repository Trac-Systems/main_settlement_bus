import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'e442c6aadc8419c2439552ebecc79ffdc993dd816f9d2d6f562eef56e71ab9ba',
    channel: '00bptracnetworkmainsettlementbus',
    tx : 'bptracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});