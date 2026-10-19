import b4a from 'b4a';
import {WalletProvider} from 'trac-wallet';

import {applyStateMessageFactory} from '../../../../src/messages/state/applyStateMessageFactory.js';
import {safeEncodeApplyOperation, safeDecodeApplyOperation} from '../../../../src/codecs/apply/applyOperationCodec.js';
import {sanitizeDecodedPartialTransaction} from '../../../../src/core/network/protocols/v1/handlers/broadcastTransaction/BroadcastTransactionPayloadUtils.js';
import {AMOUNT_BYTE_LENGTH} from '../../../../src/utils/constants.js';
import {testKeyPair1, testKeyPair2} from '../../../fixtures/apply.fixtures.js';
import {config} from '../../../helpers/config.js';

export async function htlcOperationPipelineTests(t, validate, fixture, key) {
    const requester = await new WalletProvider(config).fromMnemonic({mnemonic: testKeyPair1.mnemonic, derivationPath: config.derivationPath});
    const validator = await new WalletProvider(config).fromMnemonic({mnemonic: testKeyPair2.mnemonic, derivationPath: config.derivationPath});
    const factory = applyStateMessageFactory(requester, config);
    let partial;
    if (key === 'hlo') {
        partial = await factory.buildPartialHtlcLockOperationMessage(requester.address, fixture.hlo.txv, {
            claimAddress: validator.address,
            refundAddress: requester.address,
            amount: fixture.hlo.am,
            feeAmount: b4a.alloc(AMOUNT_BYTE_LENGTH),
            hashLock: fixture.hlo.hl,
            refundEpoch: fixture.hlo.re,
            signerSet: [requester.publicKey],
            threshold: 1
        });
    } else if (key === 'hco') {
        partial = await factory.buildPartialHtlcClaimOperationMessage(requester.address, fixture.hco.txv, fixture.hco.li, fixture.hco.pi);
    } else {
        partial = await factory.buildPartialHtlcRefundOperationMessage(requester.address, fixture.hro.txv, fixture.hro.li);
    }
    t.is(validate(partial), true, 'builder produces a valid partial');
    const decoded = safeDecodeApplyOperation(safeEncodeApplyOperation(partial));
    t.ok(decoded, 'partial survives the codec');
    sanitizeDecodedPartialTransaction(decoded);
    t.is(validate(decoded), true, 'decoded and sanitized partial is valid');

    const completion = applyStateMessageFactory(validator, config);
    const body = decoded[key];
    let complete;
    if (key === 'hlo') complete = await completion.buildCompleteHtlcLockOperationMessage(decoded.address, body);
    else if (key === 'hco') complete = await completion.buildCompleteHtlcClaimOperationMessage(decoded.address, body.tx, body.txv, body.li, body.pi, body.in, body.is);
    else complete = await completion.buildCompleteHtlcRefundOperationMessage(decoded.address, body.tx, body.txv, body.li, body.in, body.is);
    t.is(validate(complete), true, 'builder produces a valid complete operation');
    t.is(validate(safeDecodeApplyOperation(safeEncodeApplyOperation(complete))), true, 'decoded complete is valid');
    for (const field of Object.keys(partial[key])) {
        t.alike(complete[key][field], partial[key][field], `${field} survives the full pipeline`);
    }
    for (const corrupt of [op => { delete op[key].is; }, op => { op[key].extra = true; }]) {
        const invalid = structuredClone(decoded);
        corrupt(invalid);
        sanitizeDecodedPartialTransaction(invalid);
        t.is(validate(invalid), false, 'sanitization does not repair malformed data');
    }
    if (key !== 'hco') {
        for (const field of ['va', 'vn', 'vs']) {
            const invalid = safeDecodeApplyOperation(safeEncodeApplyOperation(partial));
            invalid[key][field] = fixture[key][field];
            sanitizeDecodedPartialTransaction(invalid);
            t.is(validate(invalid), false, `sanitization preserves incomplete metadata: ${field}`);
        }
    }
}
