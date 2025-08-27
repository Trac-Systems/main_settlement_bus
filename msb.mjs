import {MainSettlementBus} from './src/index.js';

const opts = {
    stores_directory : 'stores/',
    store_name : typeof process !== "undefined" ? process.argv[2] : Pear.config.args[0],
    bootstrap: 'b941797342a43c5a1d4696859db2a1d297181a2efc77edc48696fdb6ea3d4a41',
    channel: 'bg0002tracnetworkmainsettlementbus',
    enable_role_requester: false,
    enable_auto_transaction_consent: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: true,
    enable_txlogs: true,
};

const msb = new MainSettlementBus(opts);

msb.ready()
    .then(() => { msb.interactiveMode(); })
