import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: '85154864940d2470e54ad5729c4d33337e6f8bf2778ead87c241b047b6060b69',
    channel: 'bg0002tracnetworkmainsettlementbus',
    enableRoleRequester: false,
    enable_wallet: true,
    enableValidatorObserver: true,
    enable_interactive_mode: true,
    enable_txlogs: true,
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
    .catch(function () { });
