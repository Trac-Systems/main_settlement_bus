import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '64bd0a01c03f46432dd15a60a2d7150c787042b13e3c42c97da5fe02d0295b7f',
    channel: '0000tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});