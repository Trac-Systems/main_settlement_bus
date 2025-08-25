import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'b91686d0d28cb5f996e04325e7c2c62c85691f360b98c28adeab7542a01c967f',
    channel: 'bg0002tracnetworkmainsettlementbus',
    enable_role_requester: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: true,
    enable_txlogs: true,
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
