import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    enableRoleRequester: true,
    enable_wallet: true,
    enableValidatorObserver: true,
    enable_interactive_mode: true,
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });
