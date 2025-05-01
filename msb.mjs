import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'd7cce91547144be2e234992501b556dcd1591ab44313cf3036ddd3137afbc347',
    channel: '00axtracnetworkmainsettlementbus',
    enable_txlogs : true,
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});