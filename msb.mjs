import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'b727c335b04131d6e3d802d7a1f69ffb41eb2823995c99805d8d2dcf67dfb4f3',
    channel: 'bg0002tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });


    