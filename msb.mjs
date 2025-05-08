import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '0768953b234c79eccc6306fdcba2d7c1f0b05b9af6815a3502e96a83a8878ff7',
    channel: '00axtracnetworkmainsettlementbus',
    disable_rate_limit : true,
    enable_txlogs : true
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});