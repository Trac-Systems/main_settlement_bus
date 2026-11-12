import ReadyResource from 'ready-resource';
import Autobase from 'autobase';
import Hyperbee from 'hyperbee';
import { ACK_INTERVAL, AUTOBASE_VALUE_ENCODING, EventType, HYPERBEE_KEY_ENCODING, HYPERBEE_VALUE_ENCODING, TRAC_NAMESPACE } from '../../utils/constants.js';
import { sleep } from '../../utils/helpers.js';
import StateValidationSchema from './validators/StateValidationSchema.js';
import PQueue from 'p-queue';
import { StateEventQueue } from './StateEventQueue.js';
import { ConfirmationWatch } from './ConfirmationWatch.js';
import { stateApi } from './api/StateApi.js';
import { sharedApply } from './contracts/SharedApply.js';
import { applyDispatcher } from './contracts/ApplyDispatcher.js';

import { handleApplyInitializeBalanceOperation } from './contracts/initialization/handleApplyInitializeBalanceOperation.js';
import { handleApplyDisableBalanceInitializationOperation } from './contracts/initialization/handleApplyDisableBalanceInitializationOperation.js';
import { handleApplyAddAdminOperation } from './contracts/admin/handleApplyAddAdminOperation.js';
import { handleApplyAppendWhitelistOperation } from './contracts/admin/handleApplyAppendWhitelistOperation.js';
import { handleApplyAddWriterOperation } from './contracts/membership/handleApplyAddWriterOperation.js';
import { handleApplyRemoveWriterOperation } from './contracts/membership/handleApplyRemoveWriterOperation.js';
import { handleApplyAdminRecoveryOperation } from './contracts/admin/handleApplyAdminRecoveryOperation.js';
import { handleApplyAddIndexerOperation } from './contracts/membership/handleApplyAddIndexerOperation.js';
import { handleApplyRemoveIndexerOperation } from './contracts/membership/handleApplyRemoveIndexerOperation.js';
import { handleApplyBanValidatorOperation } from './contracts/membership/handleApplyBanValidatorOperation.js';
import { handleApplyBootstrapDeploymentOperation } from './contracts/deployments/handleApplyBootstrapDeploymentOperation.js';
import { handleApplyTxOperation } from './contracts/transactions/handleApplyTxOperation.js';
import { handleApplyTransferOperation } from './contracts/transactions/handleApplyTransferOperation.js';
import { handleApplySetEpochOperation } from './contracts/consensus/handleApplySetEpochOperation.js';
import { handleApplySetGenesisEpoch } from './contracts/consensus/handleApplySetGenesisEpoch.js';
import { handleApplySetConsensusConfig } from './contracts/consensus/handleApplySetConsensusConfig.js';
import { handleApplyHtlcLockOperation } from './contracts/htlc/handleApplyHtlcLockOperation.js';
import { handleApplyHtlcClaimOperation } from './contracts/htlc/handleApplyHtlcClaimOperation.js';
import { handleApplyHtlcRefundOperation } from './contracts/htlc/handleApplyHtlcRefundOperation.js';

// TODO: _addWriter, _removeWriter, _transfer, _transferFeeTxOperation need to receive actor node entries as buffers.
const StateBase = [
    stateApi,
    sharedApply,
    handleApplyInitializeBalanceOperation,
    handleApplyDisableBalanceInitializationOperation,
    handleApplyAddAdminOperation,
    handleApplyAppendWhitelistOperation,
    handleApplyAddWriterOperation,
    handleApplyRemoveWriterOperation,
    handleApplyAdminRecoveryOperation,
    handleApplyAddIndexerOperation,
    handleApplyRemoveIndexerOperation,
    handleApplyBanValidatorOperation,
    handleApplyBootstrapDeploymentOperation,
    handleApplyTxOperation,
    handleApplyTransferOperation,
    handleApplySetEpochOperation,
    handleApplySetGenesisEpoch,
    handleApplySetConsensusConfig,
    handleApplyHtlcLockOperation,
    handleApplyHtlcClaimOperation,
    handleApplyHtlcRefundOperation,
    applyDispatcher,
].reduce((baseState, contract) => contract(baseState), ReadyResource);

class State extends StateBase {
    _writeQueue = new PQueue({ concurrency: 1 });
    _base;
    _bee;
    _store;
    _writingKey;
    _config
    _wallet
    _stateValidationSchema;
    _activeWriterCountCache = new Map();
    _stateEventQueue = new StateEventQueue();
    _viewUpdateListener;
    _confirmationWatch = null;

    /**
     * @param {Corestore} store
     * @param {IWallet} wallet
     * @param {Config} config
     **/
    constructor(store, wallet, config) {
        super();

        this._config = config
        this._wallet = wallet
        this._store = store;

        this._stateValidationSchema = new StateValidationSchema(config);
        this._viewUpdateListener = this.handleViewUpdate.bind(this);
        this._base = new Autobase(this._store, this._config.bootstrap, {
            ackInterval: ACK_INTERVAL,
            valueEncoding: AUTOBASE_VALUE_ENCODING,
            bigBatches: false,
            optimistic: false,
            fastForward: true,
            open: this._setupHyperbee.bind(this),
            apply: this.applyHandler,
        })
    }

    get base() {
        return this._base;
    }

    get writingKey() {
        return this._writingKey;
    }

    get stateValidationSchema() {
        return this._stateValidationSchema;
    }

    get applyHandler() {
        return this._apply.bind(this);
    }

    async _open() {
        console.log("State initialization...")
        await this._base.ready();
        this._writingKey = this._base.local.key;

        // Catch-up events describe state which is already available at startup.
        this._stateEventQueue.clear();
        this._base.on('update', this._viewUpdateListener);
        await this._listeners()
        this._confirmationWatch = new ConfirmationWatch(this._base, { timeout: this._config.confirmationStallTimeout });
        this._confirmationWatch.start();
    }

    async _close() {
        console.log("State: closing gracefully...");
        this._confirmationWatch?.stop();

        this._base.off('update', this._viewUpdateListener);
        this._stateEventQueue.clear();
        this.removeAllListeners();

        if (this._bee !== null) {
            await this._bee.close();
        }
        await sleep(100);

        [EventType.IS_INDEXER,
            EventType.IS_NON_INDEXER,
            EventType.WRITABLE,
            EventType.UNWRITABLE
        ].forEach(event => {
            this._base.removeAllListeners(event)
        })

        if (this._base !== null) {
            await this._base.close();
        }
        await sleep(100);
    }


    async _listeners() {
        this._base.on(EventType.IS_INDEXER, () => {
            console.log("Current node is an indexer");
        });

        this._base.on(EventType.IS_NON_INDEXER, async () => {
            // Prevent further actions if closing is in progress
            // The reason is that getNodeEntry is async and may cause issues if we will access state after closing
            console.log("Current node is not an indexer anymore");
        });

        this._base.on(EventType.WRITABLE, async () => {
            console.log("Current node is writable");
        });

        this._base.on(EventType.UNWRITABLE, async () => {
            console.log("Current node is unwritable");
        });
    }

    _emitEvent(event, ...args) {
        try {
            this.emit(event, ...args)
        } catch (_ignored) { }
    }

    _setupHyperbee(store) {
        this._bee = new Hyperbee(store.get(TRAC_NAMESPACE), {
            extension: false,
            keyEncoding: HYPERBEE_KEY_ENCODING,
            valueEncoding: HYPERBEE_VALUE_ENCODING,
        })
        return this._bee;
    }
}

export default State;
