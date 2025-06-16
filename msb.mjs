import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '9fc40653d4f66b8df83247c3ca85fb740857e33378bb2c9508576a0250c947df',
    channel: 'ls02tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });