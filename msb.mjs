import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '19a12e9bdaf1cd9ae8169fd87f3d6d63d441c046e37e2ac6c3c36bcb87c59019',
    channel: '0000tracnetworkmainsettlementbus',
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});