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
 * Read the application view and writer clock at the same signed system checkpoint.
 * A view's signedLength alone cannot prove that a no-op was processed. These
 * checkpoints use the SystemView API of the pinned Autobase 7.20.1 dependency.
 *
 * @param {object} base
 * @param {function(object): Promise<*>} read Receives owned system/view checkouts and their system length.
 * @returns {Promise<*>} Callback result; checkouts are closed before returning.
 * @throws {EpochAppenderSelectionError} If the signed checkpoint is unavailable or has an unexpected view.
 */
export async function withSignedEpochView(base, read) {
    const source = base.system;
    const signedSystemLength = base.signedLength;
    if (!source || !signedSystemLength || !b4a.equals(source.core.key, base.core.key)) {
        throw new EpochAppenderSelectionError(
            EpochAppenderSelectionErrorCode.SIGNED_CHECKPOINT_UNAVAILABLE,
            'Signed Autobase system checkpoint is unavailable'
        );
    }
    // Construct the checkout explicitly so it can also be closed if ready() fails.
    const system = new SystemView(source.core.session(), { checkout: signedSystemLength });
    let view;
    let readError;
    try {
        await system.ready();
        const viewEntry = requireApplicationView(system.views);
        // Autobase moves the application history to a new core on membership changes.
        // Its live view retains that history; opening an old checkpoint key directly
        // can require blocks that this node no longer has. Pin the logical view to
        // the length authenticated by this signed system checkpoint.
        view = base.view.checkout(viewEntry.length);
        await view.ready();
        return await read({ system, view, length: signedSystemLength });
    } catch (error) {
        readError = error;
        throw error;
    } finally {
        await closeReadResources([view, system], readError);
    }
}

/**
 * Resolve voters from the current signed membership. A signed membership change
 * invalidates the old election context; a disconnected peer still remains a voter.
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppenderSelectionContext>}
 */
export async function readEpochAppenderSelectionContext(base, config) {
    return withSignedEpochView(base, async ({ system, view }) => {
        const { currentEpoch, parentEpochEntry } = await readParentEpoch(view);
        const members = await readMembership(system, view, config.addressPrefix);
        const bootstrap = toHex(base.key);
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
        const configHash = await readConsensusConfigHash(view);
        return {
            networkId: config.networkId,
            bootstrap,
            targetEpoch: (currentEpoch + 1n).toString(),
            parentHash,
            membershipContext,
            configHash,
            members,
            currentWriterKeys: system.indexers.map(({ key }) => toHex(key)).sort(),
        };
    });
}

/**
 * Recover a publication from the local writer log, including after restart.
 * Missing data remains UNKNOWN until signed epoch progress or a verified writer outcome.
 * A local append rejection does not prove cancellation.
 * @param {object} base
 * @param {import('./epochAppenderSelectionState.js').EpochAppendPublication|null} publication
 * @returns {Promise<import('./epochAppenderSelectionState.js').EpochAppendOutcomeResult>}
 */
export async function readEpochAppendOutcome(base, publication) {
    if (!publication || toHex(base.local.key) !== publication.writerKey) {
        return { status: EpochAppendOutcome.UNKNOWN };
    }
    return withSignedEpochView(base, async ({ system, view }) => {
        const epochEntry = await view.get(EntryType.EPOCH_CURRENT, { ...SIGNED_READ_OPTIONS });
        if (!epochEntry) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const currentEpoch = epochEntry.value.readBigUInt64BE(0);
        if (currentEpoch >= BigInt(publication.targetEpoch)) {
            return { status: EpochAppendOutcome.EPOCH_ADVANCED };
        }
        const publicationPosition = await findPublicationPosition(base.local, publication);
        if (publicationPosition === null) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        const writer = await system.get(base.local.key, { timeout: WRITER_READ_TIMEOUT_MS });
        if (!writer || writer.length < publicationPosition) {
            return { status: EpochAppendOutcome.UNKNOWN };
        }
        return { status: EpochAppendOutcome.REJECTED };
    });
}

function requireApplicationView(views) {
    if (views.length !== 1) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.SIGNED_VIEW_INVALID, 'Expected one MSB application view');
    }
    return views[0];
}

/** Close every owned resource, preserving the read failure if cleanup also fails. */
async function closeReadResources(resources, readError) {
    const results = await Promise.allSettled(resources.filter(Boolean).map(async resource => {
        await resource.close();
    }));
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (!failures.length) {
        return;
    }
    if (readError) {
        readError.cleanupErrors = failures;
        return;
    }
    throw failures[0];
}

async function readParentEpoch(view) {
    const epochEntry = await view.get(EntryType.EPOCH_CURRENT, { ...SIGNED_READ_OPTIONS });
    if (!epochEntry) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.EPOCH_NOT_INITIALIZED, 'Epoch is not initialized');
    }
    const currentEpoch = epochEntry.value.readBigUInt64BE(0);
    const parentEpochEntry = await view.get(EntryType.EPOCH + currentEpoch, { ...SIGNED_READ_OPTIONS });
    if (!parentEpochEntry) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.PARENT_MISSING, 'Signed epoch parent is missing');
    }
    return { currentEpoch, parentEpochEntry };
}

async function readMembership(system, view, addressPrefix) {
    const members = [];
    for (const { key } of system.indexers) {
        const writerKey = toHex(key);
        const addressEntry = await view.get(EntryType.WRITER_ADDRESS + writerKey, { ...SIGNED_READ_OPTIONS });
        const address = addressEntry && bufferToAddress(addressEntry.value, addressPrefix);
        if (!address) {
            throw new EpochAppenderSelectionError(
                EpochAppenderSelectionErrorCode.MEMBER_IDENTITY_MISSING,
                'Epoch indexer identity is missing',
                { details: { writerKey } }
            );
        }
        members.push({
            writerKey,
            publicKey: toHex(tracCryptoApi.address.decode(address)),
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

async function readConsensusConfigHash(view) {
    const pointer = await view.get(EntryType.CONSENSUS_CONFIG_CURRENT, { ...SIGNED_READ_OPTIONS });
    if (!pointer) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONFIG_MISSING, 'Signed consensus configuration is missing');
    }
    const configKey = EntryType.CONSENSUS_CONFIG_RECORD + pointer.value.readUInt32BE(0);
    const consensusConfig = await view.get(configKey, { ...SIGNED_READ_OPTIONS });
    if (!consensusConfig) {
        throw new EpochAppenderSelectionError(EpochAppenderSelectionErrorCode.CONFIG_MISSING, 'Signed consensus configuration is missing');
    }
    return toHex(await tracCryptoApi.hash.blake3(consensusConfig.value));
}

async function findPublicationPosition(writerCore, publication) {
    const end = writerCore.length;
    for (let index = publication.from; index < end; index++) {
        const message = await writerCore.get(index, { wait: false });
        const payload = message?.node?.value;
        if (!payload) {
            continue;
        }
        const payloadHash = toHex(await tracCryptoApi.hash.blake3(payload));
        if (payloadHash === publication.payloadHash) {
            return index + 1;
        }
    }
    return null;
}
