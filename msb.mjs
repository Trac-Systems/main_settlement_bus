import MainSettlementBus from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'db83156cbf7d227ad08fc4117fc247f387c15311e3597d65c2a09a768e97d70a',
    channel: '00bptracnetworkmainsettlementbus',
    tx : 'bptracnetworkmainsettlementbustx'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});