/**
 * Reads signed Autobase data for appender selection. The application view and writer clock come from
 * the same checkpoint. This allows the selector to check whether an operation was processed even when
 * it did not change the application view.
 */
import SystemView from 'autobase/lib/system.js';
import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { EntryType } from '../../../utils/constants.js';
import { toHex } from '../../../utils/buffer.js';
import { bufferToAddress } from '../../state/utils/address.js';
import { EpochAppendOutcome } from './epochAppenderSelectionState.js';
import {
    EpochAppenderSelectionError,
    EpochAppenderSelectionErrorCode,
} from './EpochAppenderSelectionError.js';

const SIGNED_READ_OPTIONS = Object.freeze({ wait: false, update: false });
const WRITER_READ_TIMEOUT_MS = 2000;
const MEMBERSHIP_HASH_DOMAIN = 'msb/epoch-append/membership/v2';

/**
 * Opens the application and system views at the same signed checkpoint. Closes them after the callback
 * finishes. The application length alone cannot show whether an operation was processed without
 * changing the view. Uses the installed Autobase SystemView API.
 *
 * @template T
 * @param {object} autobase Ready local Autobase instance.
 * @param {function({system: SystemView, view: object, length: number}): Promise<T>} readSignedCheckpoint Reads from the opened views and signed system length.
 * @returns {Promise<T>} Result returned by the callback after the views are closed.
 * @throws {EpochAppenderSelectionError} If the signed checkpoint is missing or invalid.
 */
export async function withSignedEpochView(autobase, readSignedCheckpoint) {
    const liveSystemView = autobase.system;
    const signedSystemLength = autobase.signedLength;
    if (!liveSystemView || !signedSystemLength || !b4a.equals(liveSystemView.core.key, autobase.core.key)) {
        throw new EpochAppenderSelectionError(
            EpochAppenderSelectionErrorCode.SIGNED_CHECKPOINT_UNAVAILABLE,
            'Signed Autobase system checkpoint is unavailable'
        );
    }
    // Construct the checkout explicitly so it can also be closed if ready() fails.
    const signedSystemView = new SystemView(liveSystemView.core.session(), { checkout: signedSystemLength });
    let signedApplicationView;
    let checkpointReadError;
    try {
        await signedSystemView.ready();
        const viewEntry = requireApplicationView(signedSystemView.views);
        // Autobase moves the application history to a new core on membership changes.
        // Its live view retains that history; opening an old checkpoint key directly
        // can require blocks that this node no longer has. Pin the logical view to
        // the length authenticated by this signed system checkpoint.
        signedApplicationView = autobase.view.checkout(viewEntry.length);
        await signedApplicationView.ready();
        return await readSignedCheckpoint({ system: signedSystemView, view: signedApplicationView, length: signedSystemLength });
    } catch (error) {
        checkpointReadError = error;
        throw error;
    } finally {
        await closeReadResources([signedApplicationView, signedSystemView], checkpointReadError);
    }
}

/**
 * Reads the epoch, consensus config and indexers from the same signed checkpoint. A membership change
 * invalidates the previous election. A lost connection does not.
 *
 * @param {object} autobase Ready local Autobase instance.
 * @param {object} config Network ID and wallet address prefix.
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionContext>}
 */
export async function readEpochAppenderSelectionContext(autobase, config) {
    return withSignedEpochView(autobase, async ({ system: signedSystemView, view: signedApplicationView }) => {
        const { currentEpoch, parentEpochEntry } = await readSignedParentEpoch(signedApplicationView);
        const members = await readSignedIndexerMembership(signedSystemView, signedApplicationView, config.addressPrefix);
        const bootstrap = toHex(autobase.key);
        const parentHash = toHex(parentEpochEntry.value);
        // Unrelated signed writes and core migrations must not restart an election.
        // Bind the hash to the signed voter identities, not to a core key or head length.
        const membershipData = b4a.from(JSON.stringify([
            MEMBERSHIP_HASH_DOMAIN,
            config.networkId,
            bootstrap,
            currentEpoch.toString(),
            parentHash,
            members,
        ]));
        const membershipContext = toHex(await tracCryptoApi.hash.blake3(membershipData));
        const configHash = await readConsensusConfigHash(signedApplicationView);
        return {
            networkId: config.networkId,
            bootstrap,
            targetEpoch: (currentEpoch + 1n).toString(),
            parentHash,
            membershipContext,
            configHash,
            members,
            currentWriterKeys: signedSystemView.indexers.map(({ key }) => toHex(key)).sort(),
        };
    });
}

/**
 * Checks signed epoch progress and looks for the payload in the local writer log, also after restart.
 * Another indexer may have advanced the epoch. UNKNOWN and local append errors do not prove rejection.
 *
 * @param {object} autobase Ready local Autobase instance.
 * @param {import('./epochAppenderSelectionState.js').EpochAppendPublication|null} publication Saved writer position, payload hash and target epoch.
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppendOutcomeResult>}
 * @throws {Error} If a required block or signed checkpoint cannot be read.
 */
export async function readEpochAppendOutcome(autobase, publication) {
    if (!publication || toHex(autobase.local.key) !== publication.writerKey) {
        return { status: EpochAppendOutcome.UNKNOWN };
    }
    return withSignedEpochView(autobase, async ({ system: signedSystemView, view: signedApplicationView }) => {
        const epochEntry = await signedApplicationView.get(EntryType.EPOCH_CURRENT, { ...SIGNED_READ_OPTIONS });
        if (!epochEntry) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const currentEpoch = epochEntry.value.readBigUInt64BE(0);
        if (currentEpoch >= BigInt(publication.targetEpoch)) {
            return { status: EpochAppendOutcome.EPOCH_ADVANCED };
        }
        const publicationPosition = await findAppendedWriterLength(autobase.local, publication);
        if (publicationPosition === null) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const signedWriterClock = await signedSystemView.get(autobase.local.key, { timeout: WRITER_READ_TIMEOUT_MS });
        if (!signedWriterClock || signedWriterClock.length < publicationPosition) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        return { status: EpochAppendOutcome.REJECTED };
    });
}

/**
 * Returns the MSB application view from the signed checkpoint. Exactly one view is expected.
 *
 * @param {Array<{key: Buffer, length: number}>} views Signed system view entries.
 * @returns {{key: Buffer, length: number}} Application view checkpoint.
 * @throws {EpochAppenderSelectionError} If the checkpoint does not contain exactly one application view.
 */
function requireApplicationView(views) {
    if (views.length !== 1) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SIGNED_VIEW_INVALID, 'Expected one MSB application view');
    }
    return views[0];
}

/**
 * Closes the opened views. If reading and closing both fail, adds the cleanup errors to the original
 * read error.
 *
 * @param {Array<object|undefined>} resources Views opened before the read finished or failed.
 * @param {Error|undefined} checkpointReadError Original read failure, if any.
 * @returns {Promise<void>}
 */
async function closeReadResources(resources, checkpointReadError) {
    const results = await Promise.allSettled(resources.filter(Boolean).map(async resource => {
        await resource.close();
    }));
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (!failures.length) {
        return;
    }
    if (checkpointReadError) {
        checkpointReadError.cleanupErrors = failures;
        return;
    }
    throw failures[0];
}

/**
 * Reads the signed epoch that the next proposal will use as its parent.
 *
 * @param {object} signedApplicationView Hyperbee view at the signed system checkpoint.
 * @returns {Promise<{currentEpoch: bigint, parentEpochEntry: {value: Buffer}}>}
 */
async function readSignedParentEpoch(signedApplicationView) {
    const epochEntry = await signedApplicationView.get(EntryType.EPOCH_CURRENT, { ...SIGNED_READ_OPTIONS });
    if (!epochEntry) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.EPOCH_NOT_INITIALIZED, 'Epoch is not initialized');
    }
    const currentEpoch = epochEntry.value.readBigUInt64BE(0);
    const parentEpochEntry = await signedApplicationView.get(EntryType.EPOCH + currentEpoch, { ...SIGNED_READ_OPTIONS });
    if (!parentEpochEntry) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PARENT_MISSING, 'Signed epoch parent is missing');
    }
    return { currentEpoch, parentEpochEntry };
}

/**
 * Finds the wallet public key for each signed indexer and sorts the members by writer key. All nodes
 * need the same order when calculating the membership hash.
 *
 * @param {SystemView} signedSystemView Signed system checkout.
 * @param {object} signedApplicationView Application view from the same checkpoint.
 * @param {string} addressPrefix Wallet address prefix for this network.
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionMember[]>}
 */
async function readSignedIndexerMembership(signedSystemView, signedApplicationView, addressPrefix) {
    const members = [];
    for (const { key } of signedSystemView.indexers) {
        const writerKey = toHex(key);
        const addressEntry = await signedApplicationView.get(EntryType.WRITER_ADDRESS + writerKey, { ...SIGNED_READ_OPTIONS });
        const indexerAddress = addressEntry && bufferToAddress(addressEntry.value, addressPrefix);
        if (!indexerAddress) {
            throw new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.MEMBER_IDENTITY_MISSING,
                'Epoch indexer identity is missing',
                { details: { writerKey } }
            );
        }
        members.push({
            writerKey,
            publicKey: toHex(tracCryptoApi.address.decode(indexerAddress)),
        });
    }
    members.sort((leftMember, rightMember) => {
        if (leftMember.writerKey === rightMember.writerKey) {
            return 0;
        }
        return leftMember.writerKey < rightMember.writerKey ? -1 : 1;
    });
    const uniquePublicKeys = new Set(members.map(member => member.publicKey));
    if (!members.length || uniquePublicKeys.size !== members.length) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.MEMBERSHIP_INVALID, 'Invalid epoch coordination membership');
    }
    return members;
}

/**
 * Reads the consensus config selected by the signed view and returns its hash.
 *
 * @param {object} signedApplicationView Application checkout at the signed checkpoint.
 * @returns {Promise<string>} BLAKE3 hash encoded as hex.
 */
async function readConsensusConfigHash(signedApplicationView) {
    const configPointer = await signedApplicationView.get(EntryType.CONSENSUS_CONFIG_CURRENT, { ...SIGNED_READ_OPTIONS });
    if (!configPointer) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONFIG_MISSING, 'Signed consensus configuration is missing');
    }
    const configKey = EntryType.CONSENSUS_CONFIG_RECORD + configPointer.value.readUInt32BE(0);
    const consensusConfigEntry = await signedApplicationView.get(configKey, { ...SIGNED_READ_OPTIONS });
    if (!consensusConfigEntry) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONFIG_MISSING, 'Signed consensus configuration is missing');
    }
    return toHex(await tracCryptoApi.hash.blake3(consensusConfigEntry.value));
}

/**
 * Searches the local writer log from the saved start position for the matching payload hash. Returns
 * the block index plus one because the writer clock stores a length.
 *
 * @param {object} writerCore Local Autobase writer core.
 * @param {import('./epochAppenderSelectionState.js').EpochAppendPublication} publication Saved writer position and payload hash for this append.
 * @returns {Promise<number|null>} Writer length including the operation, or null when not found.
 */
async function findAppendedWriterLength(writerCore, publication) {
    const writerLength = writerCore.length;
    for (let blockIndex = publication.from; blockIndex < writerLength; blockIndex++) {
        const writerMessage = await writerCore.get(blockIndex, { wait: false });
        const operationPayload = writerMessage?.node?.value;
        if (!operationPayload) {
            continue;
        }
        const payloadHash = toHex(await tracCryptoApi.hash.blake3(operationPayload));
        if (payloadHash === publication.payloadHash) {
            return blockIndex + 1;
        }
    }
    return null;
}
