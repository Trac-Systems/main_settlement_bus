import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '10c5ff8f16591b5884d4624c8f78624d38e143176093ac72451eede50727f5a2',
    channel: '00axtracnetworkmainsettlementbus',
    enable_txlogs : true,
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});