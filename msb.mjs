import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '4577ebf1e84c06d48b2caa33fe54ae58be3a79cb30810129d58b725fae412e37',
    channel: '00tracnetworkmainsettlementbusr1'
};

const msb = new MainSettlementBus(opts);

msb.ready().then(() => {
    console.log('MSB is ready.');
    msb.interactiveMode();
});