import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '0f4fa31072e9b9d55eae87981ee657cbf9c18c70207f80d7c917540938f8b59d',
    channel: '00axtracnetworkmainsettlementbus',
    enable_txlogs : true,
    disable_rate_limit : false
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});