import test from 'brittle';
import b4a from 'b4a';
import Autobase from 'autobase';
import remote from 'hypercore/lib/fully-remote-proof.js';
import {WalletProvider} from 'trac-wallet';

import {createConfig, ENV} from '../../../../../../src/config/env.js';
import {
    BATCH_SIZE,
    HTLC_MAX_SIGNERS,
    HTLC_METADATA_MAX_BYTE_LENGTH,
    MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE,
    NETWORK_CAPABILITIES,
    ResultCode,
    V1_PROTOCOL_PAYLOAD_MAX_SIZE,
} from '../../../../../../src/utils/constants.js';
import {addressToBuffer} from '../../../../../../src/core/state/utils/address.js';
import {uint64ToBuffer} from '../../../../../../src/utils/buffer.js';
import {applyStateMessageFactory} from '../../../../../../src/messages/state/applyStateMessageFactory.js';
import {networkMessageFactory} from '../../../../../../src/messages/network/v1/networkMessageFactory.js';
import {safeEncodeApplyOperation, safeDecodeApplyOperation} from '../../../../../../src/codecs/apply/applyOperationCodec.js';
import {encodeV1networkOperation, decodeV1networkOperation} from '../../../../../../src/codecs/network/v1/networkV1OperationCodec.js';
import StateValidationSchema from '../../../../../../src/core/state/validators/StateValidationSchema.js';
import V1BroadcastTransactionRequest from '../../../../../../src/core/network/protocols/validators/v1/validators/V1BroadcastTransactionRequest.js';
import V1BaseOperation from '../../../../../../src/core/network/protocols/validators/v1/validators/V1BaseOperation.js';
import {createStores, createBase} from '../../../../../helpers/autobaseTestHelpers.js';
import {createHtlcLockTransactionHash} from '../../../../../helpers/htlcLock.js';
import * as keyPairs from '../../../../../fixtures/apply.fixtures.js';
import {makeRouterContext} from '../../../utils/v1TestUtils.js';

async function maximumLock(config) {
    const wallets = await Promise.all(Array.from({length: HTLC_MAX_SIGNERS + 1}, (_, index) =>
        new WalletProvider(config).fromMnemonic({
            mnemonic: keyPairs[`testKeyPair${index + 1}`].mnemonic,
            derivationPath: config.derivationPath
        })));
    const maker = wallets[0];
    const validator = wallets[HTLC_MAX_SIGNERS];
    const cosigners = wallets.slice(1, HTLC_MAX_SIGNERS)
        .sort((left, right) => b4a.compare(left.publicKey, right.publicKey));
    const lock = {
        claimAddress: cosigners[0].address,
        refundAddress: maker.address,
        amount: b4a.alloc(16, 1),
        feeAmount: b4a.alloc(16, 1),
        feeRecipient: cosigners[1].address,
        hashLock: b4a.alloc(32, 0x33),
        refundEpoch: uint64ToBuffer(100),
        metadata: b4a.alloc(HTLC_METADATA_MAX_BYTE_LENGTH, 0xff),
        signerSet: [maker.publicKey, ...cosigners.map(wallet => wallet.publicKey)],
        threshold: HTLC_MAX_SIGNERS,
        nonce: b4a.alloc(32, 0x44)
    };
    const txv = b4a.alloc(32, 0x55);
    const tx = await createHtlcLockTransactionHash(config.networkId, addressToBuffer(maker.address, config.addressPrefix), {
        txv, ca: addressToBuffer(lock.claimAddress, config.addressPrefix),
        ra: addressToBuffer(lock.refundAddress, config.addressPrefix),
        am: lock.amount, fa: lock.feeAmount, fr: addressToBuffer(lock.feeRecipient, config.addressPrefix),
        hl: lock.hashLock, re: lock.refundEpoch, md: lock.metadata,
        ss: lock.signerSet, th: b4a.from([lock.threshold]), in: lock.nonce
    });
    lock.cosignerSignatures = cosigners.map(wallet => wallet.sign(tx));
    const partial = await applyStateMessageFactory(maker, config)
        .buildPartialHtlcLockOperationMessage(maker.address, txv, lock);
    const complete = await applyStateMessageFactory(validator, config)
        .buildCompleteHtlcLockOperationMessage(partial.address, partial.hlo);
    return {maker, validator, partial, complete};
}

for (const environment of [ENV.MAINNET, ENV.TESTNET1]) {
    test(`HTLC transport limits - ${environment} maximum metadata and all authorizer signatures`, async t => {
        const config = createConfig(environment, {});
        const {maker, validator, partial, complete} = await maximumLock(config);
        const schema = new StateValidationSchema(config);
        t.is(partial.hlo.md.length, 1024, 'metadata reaches its protocol limit');
        t.is(partial.hlo.ss.length, 8, 'all eight signer slots are occupied');
        t.is(partial.hlo.cs.length, 7, 'seven cosigner signatures plus the maker signature');
        t.is(schema.validateHtlcLockOperation(partial), true);
        t.is(schema.validateHtlcLockOperation(complete), true);
        const data = safeEncodeApplyOperation(partial);
        const completeData = safeEncodeApplyOperation(complete);
        t.ok(data.length > 0 && data.length <= MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE, 'partial fits the 3072-byte data limit');

        // Exercise the largest allowed request ID and current advertised capabilities.
        const id = 'a'.repeat(64);
        const request = await networkMessageFactory(maker, config)
            .buildBroadcastTransactionRequest(id, data, NETWORK_CAPABILITIES);
        const encodedRequest = encodeV1networkOperation(request);
        t.ok(encodedRequest.length <= V1_PROTOCOL_PAYLOAD_MAX_SIZE, 'request envelope fits the 4096-byte router limit');
        const decodedRequest = decodeV1networkOperation(encodedRequest);
        t.is(await new V1BroadcastTransactionRequest(config).validate(decodedRequest, maker.publicKey), true,
            'the real request passes schema, payload size and signature validation');
        t.ok(b4a.equals(safeDecodeApplyOperation(decodedRequest.broadcast_transaction_request.data).hlo.md, partial.hlo.md));
        const {router, handlerStubs, connection} = makeRouterContext(t);
        await router.route(encodedRequest, connection);
        t.ok(handlerStubs.broadcastRequest.calledOnce, 'router accepts the serialized request');
        t.ok(connection.end.notCalled, 'router keeps the connection open');
        t.comment(`partial=${data.length}, complete=${completeData.length}, request=${encodedRequest.length} bytes`);

        // Responses carry a Hypercore publication proof, including an Autobase-wrapped
        // complete transaction. Its size also depends on the writer's log length.
        const [store] = await createStores(1, t);
        const base = createBase(store, null, t);
        await base.ready();
        let responseCount = 0;
        for (const targetLength of [1, 1023, 4095]) {
            const batchSize = Math.min(BATCH_SIZE, targetLength);
            const padding = targetLength - base.local.length - batchSize;
            if (padding > 0) await base.append(Array.from({length: padding}, () => b4a.from([1])));
            await base.append(Array.from({length: batchSize}, () => completeData));
            const snapshot = base.local.snapshot();
            await snapshot.ready();
            try {
                for (let index = snapshot.length - batchSize; index < snapshot.length; index++) {
                    const block = await snapshot.get(index, {raw: true});
                    t.ok(b4a.equals(await Autobase.decodeValue(block), completeData), 'proof includes the real Autobase encoding');
                    const proof = await remote.proof(snapshot, {index, block});
                    const verified = await remote.verify(store.storage, proof);
                    t.ok(verified, 'publication proof verifies');
                    t.ok(b4a.equals(await Autobase.decodeValue(verified.block.value), completeData));
                    const response = await networkMessageFactory(validator, config)
                        .buildBroadcastTransactionResponse(id, NETWORK_CAPABILITIES, ResultCode.OK, proof, Date.now());
                    const encodedResponse = encodeV1networkOperation(response);
                    t.ok(encodedResponse.length <= V1_PROTOCOL_PAYLOAD_MAX_SIZE,
                        `response at writer length ${snapshot.length}, index ${index} fits the 4096-byte router limit`);
                    const responseValidator = new V1BaseOperation(config);
                    const decodedResponse = decodeV1networkOperation(encodedResponse);
                    responseValidator.isPayloadSchemaValid(decodedResponse);
                    await responseValidator.validateSignature(decodedResponse, validator.publicKey);
                    await router.route(encodedResponse, connection);
                    t.ok(connection.end.notCalled, 'router accepts the response');
                    responseCount++;
                    t.comment(`writer length=${snapshot.length}, index=${index}, raw block=${block.length}, proof=${proof.length}, response=${encodedResponse.length} bytes`);
                }
            } finally {
                await snapshot.close();
            }
        }
        t.is(handlerStubs.broadcastResponse.callCount, responseCount, 'all proof responses reach the response handler');
    });
}
