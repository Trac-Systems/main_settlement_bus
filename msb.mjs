import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '0b40fd2365b4e4f0b67d1dc2724108bddb7ea8f7be322202986fb7097e17f529',
    channel: '00axtracnetworkmainsettlementbus',
    disable_rate_limit : true,
    enable_txlogs : true
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});