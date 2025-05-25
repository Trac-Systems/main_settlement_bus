import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores2/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '49f142d53ecd19c0530eba029820561f8a001faa9eb55e6a82a1213c8f407451',
    channel: '00000000000000000000002trac20msb',
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    msb.interactiveMode();
});