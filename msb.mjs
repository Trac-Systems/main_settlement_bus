import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '366788de30e7a66b9295f70932d6b3ac5cf9aac0e267c3d44f971c7aca9085ae',
    channel: 'ls02tracnetworkmainsettlementbus'
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });