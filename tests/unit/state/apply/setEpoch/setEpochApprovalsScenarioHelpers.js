import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import { createWallet, eventFlush } from '../../../../helpers/autobaseTestHelpers.js';
import {
    encodeApplyOperation,
    safeEncodeEpochProofV1
} from '../../../../../src/codecs/apply/applyOperationCodec.js';
import {
    encodeProofProposalApproval,
    safeDecodeProofProposalApproval
} from '../../../../../src/codecs/consensus/v1/consensusV1OperationCodec.js';
import { addressToBuffer } from '../../../../../src/core/state/utils/address.js';
import { EntryType } from '../../../../../src/utils/constants.js';
import { config } from '../../../../helpers/config.js';
import {
    decodeSetEpochPayload,
    getCurrentEpoch
} from './setEpochScenarioHelpers.js';

/**
 * Creates signer fixtures whose wallets produce real proposal/approval signatures.
 * The first actor is always the bootstrap proposer; the second is the existing peer.
 * Extra actors need only wallets because SET_EPOCH identifies committee members through
 * the writer-key registry supplied by applySetEpochWithIndexers below.
 */
export async function createApprovalActors(context, count) {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error('createApprovalActors requires at least one actor.');
    }

    const actors = [toActor(context.adminBootstrap)];
    if (count > 1 && context.peers[1]) actors.push(toActor(context.peers[1]));

    while (actors.length < count) {
        const wallet = await createWallet();
        const address = addressToBuffer(wallet.address, config.addressPrefix);
        const indexerKey = await tracCryptoApi.hash.blake3(address);
        actors.push({ wallet, indexerKey });
    }

    return actors.slice(0, count);
}

/**
 * Applies a SET_EPOCH payload with a deterministic committee snapshot. This keeps the
 * lightweight test network stable while exercising the real State.apply implementation,
 * real signatures, real VDF verification, and real Hyperbee writes.
 */
export async function applySetEpochWithIndexers(context, payload, indexerActors) {
    const base = context.adminBootstrap.base;
    const originalApply = base._handlers.apply;
    const indexerEntries = indexerActors.map(actor => ({
        key: b4a.from(actor.indexerKey),
        length: 0
    }));
    const registeredAddresses = new Map(indexerActors.map(actor => [
        EntryType.WRITER_ADDRESS + actor.indexerKey.toString('hex'),
        addressToBuffer(actor.wallet.address, config.addressPrefix)
    ]));

    base._handlers.apply = async function patchedApply(nodes, view, baseContext) {
        const system = baseContext.system;
        const originalIndexers = system.indexers;
        const originalBatch = view.batch;

        system.indexers = indexerEntries;
        view.batch = function patchedBatch(...args) {
            const batch = originalBatch.apply(this, args);
            const originalGet = batch.get.bind(batch);

            batch.get = async key => {
                const address = registeredAddresses.get(key);
                if (address) return { value: b4a.from(address) };
                return originalGet(key);
            };
            return batch;
        };

        try {
            return await originalApply.call(this, nodes, view, baseContext);
        } finally {
            view.batch = originalBatch;
            system.indexers = originalIndexers;
        }
    };

    try {
        await base.append(payload);
        await base.update();
        await eventFlush();
    } finally {
        base._handlers.apply = originalApply;
    }
}

export function duplicateFirstApproval(payload) {
    const operation = decodeSetEpochPayload(payload);
    operation.seo.app = [
        operation.seo.app[0],
        b4a.from(operation.seo.app[0])
    ];
    return encodeApplyOperation(operation);
}

export function tamperApprovalSignature(payload, approvalIndex = 0) {
    const operation = decodeSetEpochPayload(payload);
    const approval = safeDecodeProofProposalApproval(operation.seo.app[approvalIndex]);
    if (!approval) throw new Error(`Approval ${approvalIndex} could not be decoded.`);

    approval.approval_sig = b4a.alloc(64, 0x11);
    operation.seo.app[approvalIndex] = encodeProofProposalApproval(approval);
    return encodeApplyOperation(operation);
}

export async function assertEpochUnchangedAfterRejectedApprovals(t, base, payload, description) {
    const operation = decodeSetEpochPayload(payload);
    const encodedEpochProof = safeEncodeEpochProofV1({
        pd: operation.seo.pd,
        app: operation.seo.app
    });
    const epochProofHash = await tracCryptoApi.hash.blake3(encodedEpochProof);

    t.is(await getCurrentEpoch(base), 0n, `${description}: current epoch remains unchanged`);
    t.absent(
        await base.view.get(EntryType.EPOCH + '1'),
        `${description}: next-epoch forward record is absent`
    );
    t.absent(
        await base.view.get(EntryType.EPOCH_HASH + epochProofHash.toString('hex')),
        `${description}: submitted proof reverse record is absent`
    );
}

function toActor(peer) {
    return {
        wallet: peer.wallet,
        indexerKey: b4a.from(peer.base.local.key)
    };
}
