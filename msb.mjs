import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '21c78df432315940e51c5b2000d13d73ee76e1dbf6d44454b5a0d0695c412e5b',
    channel: 'bg0002tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });