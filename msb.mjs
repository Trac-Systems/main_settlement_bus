import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '9ceab0997e2c3772ccc1f20c700b22a2ccfb74f39e9f3fb18604133997221662',
    channel: 'bg0002tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });