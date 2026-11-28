import test from 'brittle';
import V1BroadcastTransactionResponse from '../../src/core/network/protocols/validators/v1/validators/V1BroadcastTransactionResponse.js';
import { encodeApplyOperation, unsafeDecodeApplyOperation } from '../../src/codecs/apply/applyOperationCodec.js';
import { $TNK } from '../../src/core/state/utils/balance.js';
import { networkMessageFactory } from '../../src/messages/network/v1/networkMessageFactory.js';
import { applyStateMessageFactory } from '../../src/messages/state/applyStateMessageFactory.js';
import { generateUUID } from '../../src/utils/helpers.js';
import { normalizeMessageByOperationType } from '../../src/utils/normalizers.js';
import { NETWORK_CAPABILITIES, NetworkOperationType, NetworkResultCode } from '../../src/utils/constants.js';
import { config } from '../helpers/config.js';
import { setupStateNetwork } from '../helpers/StateNetworkFactory.js';
import { buildAddWriterPayload } from '../unit/state/apply/addWriter/addWriterScenarioHelpers.js';
import { initializeBalances, whitelistAddress } from '../unit/state/apply/common/commonScenarioHelper.js';
import { waitFor } from './consensus/helpers/consensusNetwork.js';

test('requester verifies an ordinary validator publication before its writer manifest replicates', async t => {
    const network = await setupStateNetwork({
        nodes: 3, useStateBase: true, seedIndexers: false, stateOptions: { enableTxApplyLogs: false },
    });
    t.teardown(() => network.teardown(), { force: true });
    const [admin, validatorPeer, requester] = network.peers;
    const { state: publisherState } = validatorPeer;
    const { state: requesterState } = requester;
    await admin.state.append(null);
    await admin.state.append(encodeApplyOperation(await applyStateMessageFactory(admin.wallet, config)
        .buildCompleteAddAdminMessage(admin.wallet.address, admin.state.writingKey, await admin.state.getIndexerSequenceState())));
    await initializeBalances(network, [[validatorPeer.wallet.address, $TNK(10n)], [requester.wallet.address, $TNK(10n)]]);
    await whitelistAddress(network, validatorPeer.wallet.address);
    await admin.state.append(await buildAddWriterPayload(network, { readerPeer: validatorPeer }));
    await waitFor('the requester to see the signed writer role', async () => {
        await network.sync();
        return publisherState.isWritable() && (await requesterState.getNodeEntry(validatorPeer.wallet.address))?.isWriter;
    });
    t.ok(admin.state.isIndexer(), 'admin is the indexer');
    t.ok(await publisherState.allowedToValidate(validatorPeer.wallet.address), 'ordinary writer is eligible to validate');
    t.absent(requester.base.writable, 'requester is a reader');

    const publisherFactory = applyStateMessageFactory(validatorPeer.wallet, config);
    const buildRequest = async () => applyStateMessageFactory(requester.wallet, config).buildPartialBootstrapDeploymentMessage(
        requester.wallet.address, requester.state.writingKey, publisherState.writingKey,
        await requesterState.getIndexerSequenceState(), 'json'
    );
    const request = await buildRequest();
    const normalized = normalizeMessageByOperationType(request, config);
    const { tx, txv, bs, ic, in: nonce, is: signature } = normalized.bdo;
    const txHash = request.bdo.tx;
    const completeTx = encodeApplyOperation(await publisherFactory.buildCompleteBootstrapDeploymentMessage(
        normalized.address, tx, txv, bs, ic, nonce, signature
    ));
    const [{ proof, timestamp, proofError }] = await publisherState.appendWithProofOfPublication([completeTx], [txHash]);
    t.ok(proof, proofError ?? 'validator creates a proof');

    const writerCore = requester.base.store.get({ key: validatorPeer.base.local.key, active: false });
    t.teardown(() => writerCore.close(), { order: 1 });
    await writerCore.ready();
    t.absent(writerCore.manifest, 'requester has no replicated manifest for the validator');

    const response = await networkMessageFactory(validatorPeer.wallet, config).buildBroadcastTransactionResponse(
        generateUUID(), NETWORK_CAPABILITIES, NetworkResultCode.RESULT_CODE_OK, proof, timestamp.getTime()
    );
    const pending = {
        requestType: NetworkOperationType.BROADCAST_TRANSACTION_REQUEST,
        requestedTo: validatorPeer.wallet.publicKey.toString('hex'),
        requestTxData: encodeApplyOperation(normalized),
    };
    const validator = new V1BroadcastTransactionResponse(requesterState, config);
    const connection = { remotePublicKey: validatorPeer.wallet.publicKey };
    try {
        t.ok(await validator.validate(response, connection, pending), 'requester accepts the response');
    } catch (error) {
        t.fail(`${error.resultCode ?? NetworkResultCode.RESULT_CODE_UNEXPECTED_ERROR}: ${error.message}`);
    }
    t.absent(writerCore.manifest, 'proof verification leaves replicated writer state alone');

    const otherRequest = await buildRequest();
    await t.exception(() => validator.validate(response, connection, {
        ...pending,
        requestTxData: encodeApplyOperation(normalizeMessageByOperationType(otherRequest, config)),
    }), /Decoded transaction payload mismatch/);
    await t.exception(() => validator.validate(response, connection, {
        ...pending,
        requestedTo: admin.wallet.publicKey.toString('hex'),
    }), /Response sender mismatch/);

    let signedTx;
    await waitFor('the deployment to be signed on the requester', async () => {
        await network.sync();
        signedTx = await requesterState.getSigned(txHash);
        if (signedTx) return true;
        await network.adminBootstrap.base.append(null);
        return false;
    });
    t.alike(unsafeDecodeApplyOperation(signedTx), unsafeDecodeApplyOperation(completeTx), 'the exact deployment is signed');
});
