import { test } from 'brittle';
import b4a from 'b4a';

import { config } from '../../../helpers/config.js';
import { randomAddress } from '../../state/stateTestUtils.js';
import { errorMessageIncludes } from '../../../helpers/regexHelper.js';
import { OperationType } from '../../../../src/utils/constants.js';
import {
    normalizeBootstrapDeploymentOperation,
    normalizeDecodedPayloadForJson,
    normalizeHtlcClaimOperation,
    normalizeHtlcLockOperation,
    normalizeHtlcRefundOperation,
    normalizeMessageByOperationType,
    normalizeRoleAccessOperation,
    normalizeTransactionOperation,
    normalizeTransferOperation
} from '../../../../src/utils/normalizers.js';
import { addressToBuffer } from '../../../../src/core/state/utils/address.js';
import { bigIntTo16ByteBuffer } from '../../../../src/utils/amountSerialization.js';
import StateValidationSchema from '../../../../src/core/state/validators/StateValidationSchema.js';

const hex = (value, bytes) => value.repeat(bytes);
const toBuffer = value => b4a.from(value, 'hex');

test('operation normalization does not admit checksum-invalid address fields', t => {
    const invalid = 'trac1wyu9uw02wmefzt63c36wa0fgc2xn99x5hw46w4frl7jd6mqw2f5q57tt90';
    const valid = randomAddress(config.addressPrefix);
    const transfer = normalizeTransferOperation({
        type: OperationType.TRANSFER,
        address: invalid,
        tro: {
            tx: hex('11', 32), txv: hex('22', 32), in: hex('33', 32),
            to: invalid, am: hex('44', 16), is: hex('55', 64)
        }
    }, config);
    t.is(transfer.address.length, 0);
    t.is(transfer.tro.to.length, 0);

    const lock = normalizeHtlcLockOperation({
        type: OperationType.HTLC_LOCK,
        address: valid,
        hlo: {
            tx: hex('11', 32), txv: hex('22', 32), ca: invalid, ra: invalid,
            am: hex('33', 16), fa: hex('44', 16), hl: hex('55', 32),
            re: hex('66', 8), ss: [hex('77', 32)], th: hex('01', 1),
            cs: [], in: hex('88', 32), is: hex('99', 64), fr: invalid
        }
    }, config);
    t.ok(b4a.equals(lock.address, b4a.from(valid, 'ascii')));
    t.is(lock.hlo.ca.length, 0);
    t.is(lock.hlo.ra.length, 0);
    t.is(lock.hlo.fr.length, 0);
});

test('normalizeTransferOperation normalizes hex strings and addresses', t => {
    const sender = randomAddress(config.addressPrefix);
    const recipient = randomAddress(config.addressPrefix);
    const tx = hex('11', 32);
    const txv = hex('22', 32);
    const nonce = hex('33', 32);
    const amount = hex('44', 16);
    const signature = hex('55', 64);

    const payload = {
        type: OperationType.TRANSFER,
        address: sender,
        tro: {
            tx,
            txv,
            in: nonce,
            to: recipient,
            am: amount,
            is: signature
        }
    };

    const normalized = normalizeTransferOperation(payload, config);

    t.is(normalized.type, OperationType.TRANSFER);
    t.ok(b4a.equals(normalized.address, addressToBuffer(sender, config.addressPrefix)));
    t.ok(b4a.equals(normalized.tro.tx, toBuffer(tx)));
    t.ok(b4a.equals(normalized.tro.txv, toBuffer(txv)));
    t.ok(b4a.equals(normalized.tro.in, toBuffer(nonce)));
    t.ok(b4a.equals(normalized.tro.to, addressToBuffer(recipient, config.addressPrefix)));
    t.ok(b4a.equals(normalized.tro.am, toBuffer(amount)));
    t.ok(b4a.equals(normalized.tro.is, toBuffer(signature)));
});

test('normalizeTransferOperation accepts buffer inputs', t => {
    const sender = randomAddress(config.addressPrefix);
    const recipient = randomAddress(config.addressPrefix);
    const tx = toBuffer(hex('aa', 32));
    const txv = toBuffer(hex('bb', 32));
    const nonce = toBuffer(hex('cc', 32));
    const amount = toBuffer(hex('dd', 16));
    const signature = toBuffer(hex('ee', 64));

    const payload = {
        type: OperationType.TRANSFER,
        address: sender,
        tro: {
            tx,
            txv,
            in: nonce,
            to: recipient,
            am: amount,
            is: signature
        }
    };

    const normalized = normalizeTransferOperation(payload, config);
    t.ok(b4a.equals(normalized.tro.tx, tx));
    t.ok(b4a.equals(normalized.tro.txv, txv));
    t.ok(b4a.equals(normalized.tro.in, nonce));
    t.ok(b4a.equals(normalized.tro.am, amount));
    t.ok(b4a.equals(normalized.tro.is, signature));
});

test('normalizeTransferOperation throws on missing payload fields', t => {
    t.exception(
        () => normalizeTransferOperation({ type: OperationType.TRANSFER }, config),
        errorMessageIncludes('Invalid payload for transfer operation normalization.')
    );

    t.exception(
        () => normalizeTransferOperation({ type: OperationType.TX, address: 'x', tro: {} }, config),
        errorMessageIncludes('Missing required fields in transfer operation payload.')
    );

    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.TRANSFER,
        address: sender,
        tro: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            in: hex('33', 32),
            to: randomAddress(config.addressPrefix),
            am: hex('44', 16)
        }
    };
    t.exception(
        () => normalizeTransferOperation(payload, config),
        errorMessageIncludes('Missing required fields in transfer operation payload.')
    );
});

test('normalizeTransferOperation throws on invalid hex string', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.TRANSFER,
        address: sender,
        tro: {
            tx: 'zz',
            txv: hex('22', 32),
            in: hex('33', 32),
            to: randomAddress(config.addressPrefix),
            am: hex('44', 16),
            is: hex('55', 64)
        }
    };
    t.exception(
        () => normalizeTransferOperation(payload, config),
        errorMessageIncludes('Invalid hex string')
    );
});

test('normalizeTransactionOperation normalizes hex strings and addresses', t => {
    const sender = randomAddress(config.addressPrefix);
    const tx = hex('11', 32);
    const txv = hex('22', 32);
    const writerKey = hex('33', 32);
    const contentHash = hex('44', 32);
    const bootstrap = hex('55', 32);
    const msbBootstrap = hex('66', 32);
    const nonce = hex('77', 32);
    const signature = hex('88', 64);

    const payload = {
        type: OperationType.TX,
        address: sender,
        txo: {
            tx,
            txv,
            iw: writerKey,
            ch: contentHash,
            bs: bootstrap,
            mbs: msbBootstrap,
            in: nonce,
            is: signature
        }
    };

    const normalized = normalizeTransactionOperation(payload, config);
    t.is(normalized.type, OperationType.TX);
    t.ok(b4a.equals(normalized.address, addressToBuffer(sender, config.addressPrefix)));
    t.ok(b4a.equals(normalized.txo.tx, toBuffer(tx)));
    t.ok(b4a.equals(normalized.txo.txv, toBuffer(txv)));
    t.ok(b4a.equals(normalized.txo.iw, toBuffer(writerKey)));
    t.ok(b4a.equals(normalized.txo.ch, toBuffer(contentHash)));
    t.ok(b4a.equals(normalized.txo.bs, toBuffer(bootstrap)));
    t.ok(b4a.equals(normalized.txo.mbs, toBuffer(msbBootstrap)));
    t.ok(b4a.equals(normalized.txo.in, toBuffer(nonce)));
    t.ok(b4a.equals(normalized.txo.is, toBuffer(signature)));
});

test('normalizeTransactionOperation accepts buffer inputs', t => {
    const sender = randomAddress(config.addressPrefix);
    const tx = toBuffer(hex('aa', 32));
    const txv = toBuffer(hex('bb', 32));
    const writerKey = toBuffer(hex('cc', 32));
    const contentHash = toBuffer(hex('dd', 32));
    const bootstrap = toBuffer(hex('ee', 32));
    const msbBootstrap = toBuffer(hex('ff', 32));
    const nonce = toBuffer(hex('12', 32));
    const signature = toBuffer(hex('34', 64));

    const payload = {
        type: OperationType.TX,
        address: sender,
        txo: {
            tx,
            txv,
            iw: writerKey,
            ch: contentHash,
            bs: bootstrap,
            mbs: msbBootstrap,
            in: nonce,
            is: signature
        }
    };

    const normalized = normalizeTransactionOperation(payload, config);
    t.ok(b4a.equals(normalized.txo.tx, tx));
    t.ok(b4a.equals(normalized.txo.txv, txv));
    t.ok(b4a.equals(normalized.txo.iw, writerKey));
    t.ok(b4a.equals(normalized.txo.ch, contentHash));
    t.ok(b4a.equals(normalized.txo.bs, bootstrap));
    t.ok(b4a.equals(normalized.txo.mbs, msbBootstrap));
    t.ok(b4a.equals(normalized.txo.in, nonce));
    t.ok(b4a.equals(normalized.txo.is, signature));
});

test('normalizeTransactionOperation throws on missing payload fields', t => {
    t.exception(
        () => normalizeTransactionOperation({ type: OperationType.TX }, config),
        errorMessageIncludes('Invalid payload for transaction operation normalization.')
    );

    t.exception(
        () => normalizeTransactionOperation({ type: OperationType.TRANSFER, address: 'x', txo: {} }, config),
        errorMessageIncludes('Missing required fields in transaction operation payload.')
    );

    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.TX,
        address: sender,
        txo: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            iw: hex('33', 32),
            ch: hex('44', 32),
            bs: hex('55', 32),
            mbs: hex('66', 32),
            in: hex('77', 32)
        }
    };
    t.exception(
        () => normalizeTransactionOperation(payload, config),
        errorMessageIncludes('Missing required fields in transaction operation payload.')
    );
});

test('normalizeTransactionOperation throws on invalid hex string', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.TX,
        address: sender,
        txo: {
            tx: 'zz',
            txv: hex('22', 32),
            iw: hex('33', 32),
            ch: hex('44', 32),
            bs: hex('55', 32),
            mbs: hex('66', 32),
            in: hex('77', 32),
            is: hex('88', 64)
        }
    };
    t.exception(
        () => normalizeTransactionOperation(payload, config),
        errorMessageIncludes('Invalid hex string')
    );
});

test('normalizeRoleAccessOperation normalizes hex strings and addresses', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.ADD_WRITER,
        address: sender,
        rao: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            iw: hex('33', 32),
            in: hex('44', 32),
            is: hex('55', 64)
        }
    };

    const normalized = normalizeRoleAccessOperation(payload, config);
    t.is(normalized.type, OperationType.ADD_WRITER);
    t.ok(b4a.equals(normalized.address, addressToBuffer(sender, config.addressPrefix)));
    t.ok(b4a.equals(normalized.rao.tx, toBuffer(hex('11', 32))));
    t.ok(b4a.equals(normalized.rao.txv, toBuffer(hex('22', 32))));
    t.ok(b4a.equals(normalized.rao.iw, toBuffer(hex('33', 32))));
    t.ok(b4a.equals(normalized.rao.in, toBuffer(hex('44', 32))));
    t.ok(b4a.equals(normalized.rao.is, toBuffer(hex('55', 64))));
});

test('normalizeRoleAccessOperation accepts buffer inputs', t => {
    const sender = randomAddress(config.addressPrefix);
    const tx = toBuffer(hex('aa', 32));
    const txv = toBuffer(hex('bb', 32));
    const writerKey = toBuffer(hex('cc', 32));
    const nonce = toBuffer(hex('dd', 32));
    const signature = toBuffer(hex('ee', 64));

    const payload = {
        type: OperationType.REMOVE_WRITER,
        address: sender,
        rao: {
            tx,
            txv,
            iw: writerKey,
            in: nonce,
            is: signature
        }
    };

    const normalized = normalizeRoleAccessOperation(payload, config);
    t.ok(b4a.equals(normalized.rao.tx, tx));
    t.ok(b4a.equals(normalized.rao.txv, txv));
    t.ok(b4a.equals(normalized.rao.iw, writerKey));
    t.ok(b4a.equals(normalized.rao.in, nonce));
    t.ok(b4a.equals(normalized.rao.is, signature));
});

test('normalizeRoleAccessOperation throws on missing payload fields', t => {
    t.exception(
        () => normalizeRoleAccessOperation({ type: OperationType.ADD_WRITER }, config),
        errorMessageIncludes('Invalid payload for role access normalization.')
    );

    t.exception(
        () => normalizeRoleAccessOperation({ type: OperationType.ADD_WRITER, address: 'x', rao: {} }, config),
        errorMessageIncludes('Missing required fields in role access payload.')
    );
});

test('normalizeRoleAccessOperation throws on invalid hex string', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.ADD_WRITER,
        address: sender,
        rao: {
            tx: 'zz',
            txv: hex('22', 32),
            iw: hex('33', 32),
            in: hex('44', 32),
            is: hex('55', 64)
        }
    };
    t.exception(
        () => normalizeRoleAccessOperation(payload, config),
        errorMessageIncludes('Invalid hex string')
    );
});

test('normalizeBootstrapDeploymentOperation normalizes hex strings and addresses', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: sender,
        bdo: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            bs: hex('33', 32),
            ic: hex('44', 32),
            in: hex('55', 32),
            is: hex('66', 64)
        }
    };

    const normalized = normalizeBootstrapDeploymentOperation(payload, config);
    t.is(normalized.type, OperationType.BOOTSTRAP_DEPLOYMENT);
    t.ok(b4a.equals(normalized.address, addressToBuffer(sender, config.addressPrefix)));
    t.ok(b4a.equals(normalized.bdo.tx, toBuffer(hex('11', 32))));
    t.ok(b4a.equals(normalized.bdo.txv, toBuffer(hex('22', 32))));
    t.ok(b4a.equals(normalized.bdo.bs, toBuffer(hex('33', 32))));
    t.ok(b4a.equals(normalized.bdo.ic, toBuffer(hex('44', 32))));
    t.ok(b4a.equals(normalized.bdo.in, toBuffer(hex('55', 32))));
    t.ok(b4a.equals(normalized.bdo.is, toBuffer(hex('66', 64))));
});

test('normalizeBootstrapDeploymentOperation accepts buffer inputs', t => {
    const sender = randomAddress(config.addressPrefix);
    const tx = toBuffer(hex('aa', 32));
    const txv = toBuffer(hex('bb', 32));
    const bootstrap = toBuffer(hex('cc', 32));
    const channel = toBuffer(hex('dd', 32));
    const nonce = toBuffer(hex('ee', 32));
    const signature = toBuffer(hex('ff', 64));

    const payload = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: sender,
        bdo: {
            tx,
            txv,
            bs: bootstrap,
            ic: channel,
            in: nonce,
            is: signature
        }
    };

    const normalized = normalizeBootstrapDeploymentOperation(payload, config);
    t.ok(b4a.equals(normalized.bdo.tx, tx));
    t.ok(b4a.equals(normalized.bdo.txv, txv));
    t.ok(b4a.equals(normalized.bdo.bs, bootstrap));
    t.ok(b4a.equals(normalized.bdo.ic, channel));
    t.ok(b4a.equals(normalized.bdo.in, nonce));
    t.ok(b4a.equals(normalized.bdo.is, signature));
});

test('normalizeBootstrapDeploymentOperation throws on missing payload fields', t => {
    t.exception(
        () => normalizeBootstrapDeploymentOperation({ type: OperationType.BOOTSTRAP_DEPLOYMENT }, config),
        errorMessageIncludes('Invalid payload for bootstrap deployment normalization.')
    );

    t.exception(
        () => normalizeBootstrapDeploymentOperation({ type: OperationType.TX, address: 'x', bdo: {} }, config),
        errorMessageIncludes('Missing required fields in bootstrap deployment payload.')
    );
});

test('normalizeBootstrapDeploymentOperation throws on invalid hex string', t => {
    const sender = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: sender,
        bdo: {
            tx: 'zz',
            txv: hex('22', 32),
            bs: hex('33', 32),
            ic: hex('44', 32),
            in: hex('55', 32),
            is: hex('66', 64)
        }
    };
    t.exception(
        () => normalizeBootstrapDeploymentOperation(payload, config),
        errorMessageIncludes('Invalid hex string')
    );
});

test('normalizeHtlcLockOperation normalizes hex strings and addresses', t => {
    const sender = randomAddress(config.addressPrefix);
    const refundAddress = randomAddress(config.addressPrefix);
    const claimantAddress = randomAddress(config.addressPrefix);
    const feeRecipient = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.HTLC_LOCK,
        address: sender,
        hlo: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            ca: claimantAddress,
            ra: refundAddress,
            am: hex('33', 16),
            fa: hex('44', 16),
            fr: feeRecipient,
            hl: hex('55', 32),
            re: hex('66', 8),
            md: '0088ff',
            ss: [hex('99', 32), hex('aa', 32)],
            th: '02',
            cs: [hex('bb', 64)],
            in: hex('cc', 32),
            is: hex('dd', 64)
        }
    };

    const normalized = normalizeMessageByOperationType(payload, config);
    t.alike(normalized, normalizeHtlcLockOperation(payload, config));
    t.is(normalized.type, OperationType.HTLC_LOCK);
    t.ok(b4a.equals(normalized.address, addressToBuffer(sender, config.addressPrefix)));
    t.ok(b4a.equals(normalized.hlo.tx, toBuffer(hex('11', 32))));
    t.ok(b4a.equals(normalized.hlo.txv, toBuffer(hex('22', 32))));
    t.ok(b4a.equals(normalized.hlo.ca, addressToBuffer(claimantAddress, config.addressPrefix)));
    t.ok(b4a.equals(normalized.hlo.ra, addressToBuffer(refundAddress, config.addressPrefix)));
    t.ok(b4a.equals(normalized.hlo.am, toBuffer(hex('33', 16))));
    t.ok(b4a.equals(normalized.hlo.fa, toBuffer(hex('44', 16))));
    t.ok(b4a.equals(normalized.hlo.fr, addressToBuffer(feeRecipient, config.addressPrefix)));
    t.ok(b4a.equals(normalized.hlo.hl, toBuffer(hex('55', 32))));
    t.ok(b4a.equals(normalized.hlo.re, toBuffer(hex('66', 8))));
    t.ok(b4a.equals(normalized.hlo.md, toBuffer('0088ff')));
    t.ok(b4a.equals(normalized.hlo.ss[1], toBuffer(hex('aa', 32))));
    t.ok(b4a.equals(normalized.hlo.th, toBuffer('02')));
    t.ok(b4a.equals(normalized.hlo.cs[0], toBuffer(hex('bb', 64))));
    t.ok(b4a.equals(normalized.hlo.in, toBuffer(hex('cc', 32))));
    t.ok(b4a.equals(normalized.hlo.is, toBuffer(hex('dd', 64))));
});

test('normalizeHtlcClaimOperation prepares a signed claim for V1 broadcast', t => {
    const submitter = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.HTLC_CLAIM,
        address: submitter,
        hco: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            li: hex('33', 32),
            pi: hex('44', 32),
            in: hex('55', 32),
            is: hex('66', 64)
        }
    };

    const normalized = normalizeMessageByOperationType(payload, config);
    t.alike(normalized, normalizeHtlcClaimOperation(payload, config));
    t.ok(b4a.equals(normalized.address, addressToBuffer(submitter, config.addressPrefix)));
    for (const [field, value] of Object.entries(payload.hco)) {
        t.ok(b4a.equals(normalized.hco[field], toBuffer(value)), `${field} is preserved`);
    }

    t.exception(
        () => normalizeHtlcClaimOperation({...payload, hco: {...payload.hco, pi: undefined}}, config),
        errorMessageIncludes('Missing required fields')
    );
});

test('normalizeHtlcRefundOperation prepares a signed refund for V1 broadcast', t => {
    const submitter = randomAddress(config.addressPrefix);
    const payload = {
        type: OperationType.HTLC_REFUND,
        address: submitter,
        hro: {
            tx: hex('11', 32),
            txv: hex('22', 32),
            li: hex('33', 32),
            in: hex('44', 32),
            is: hex('55', 64)
        }
    };

    const normalized = normalizeMessageByOperationType(payload, config);
    t.alike(normalized, normalizeHtlcRefundOperation(payload, config));
    t.ok(b4a.equals(normalized.address, addressToBuffer(submitter, config.addressPrefix)));
    for (const [field, value] of Object.entries(payload.hro)) {
        t.ok(b4a.equals(normalized.hro[field], toBuffer(value)), `${field} is preserved`);
    }

    t.exception(
        () => normalizeHtlcRefundOperation({...payload, hro: {...payload.hro, li: undefined}}, config),
        errorMessageIncludes('Missing required fields')
    );
    t.exception(
        () => normalizeHtlcRefundOperation({...payload, hro: {...payload.hro, is: 'zz'}}, config),
        errorMessageIncludes('Invalid hex string')
    );
});

test('normalizeDecodedPayloadForJson converts buffers to strings', t => {
    const address = randomAddress(config.addressPrefix);
    const addressBuf = addressToBuffer(address, config.addressPrefix);
    const amountBuf = bigIntTo16ByteBuffer(1234n);
    const otherBuf = b4a.from('abcd', 'hex');

    const payload = {
        address: addressBuf,
        am: amountBuf,
        nested: {
            to: addressBuf,
            amount: amountBuf,
            other: otherBuf
        }
    };

    const normalized = normalizeDecodedPayloadForJson(payload, config);
    t.is(normalized.address, address);
    t.is(normalized.am, '1234');
    t.is(normalized.nested.to, address);
    t.is(normalized.nested.amount, '1234');
    t.is(normalized.nested.other, 'abcd');
});

test('normalizeDecodedPayloadForJson falls back to hex for invalid address buffers', t => {
    const bad = b4a.from('deadbeef', 'hex');
    const payload = { address: bad };
    const normalized = normalizeDecodedPayloadForJson(payload, config);
    t.is(normalized.address, b4a.toString(bad, 'hex'));
});

test('normalizeDecodedPayloadForJson returns input for non-objects', t => {
    t.is(normalizeDecodedPayloadForJson(null, config), null);
    t.is(normalizeDecodedPayloadForJson('value', config), 'value');
});

function makeHtlcMetadataPayload() {
    const address = randomAddress(config.addressPrefix);
    return {
        type: OperationType.HTLC_LOCK,
        address,
        hlo: {
            tx: hex('11', 32), txv: hex('22', 32), ca: address, ra: address,
            am: hex('01', 16), fa: hex('00', 16), hl: hex('33', 32),
            re: hex('01', 8), ss: [hex('44', 32)], th: '01', cs: [],
            in: hex('55', 32), is: hex('66', 64)
        }
    };
}

test('HTLC normalization preserves omitted and undefined metadata', t => {
    for (const explicitUndefined of [false, true]) {
        const payload = makeHtlcMetadataPayload();
        if (explicitUndefined) payload.hlo.md = undefined;
        const normalized = normalizeMessageByOperationType(payload, config);
        t.is(Object.hasOwn(normalized.hlo, 'md'), false, 'no metadata is introduced');
        t.is(Object.hasOwn(normalized.hlo, 'ph'), false, 'no legacy policy field is introduced');
    }
});

test('HTLC normalization preserves arbitrary metadata bytes without mutating the input', t => {
    const schema = new StateValidationSchema(config);
    for (const bytes of [b4a.alloc(1), b4a.from([0x00, 0xff, 0x80]), b4a.alloc(1024), b4a.alloc(1024, 0xff)]) {
        for (const md of [bytes, new Uint8Array(bytes), b4a.toString(bytes, 'hex').toUpperCase()]) {
            const payload = makeHtlcMetadataPayload();
            payload.hlo.md = md;
            const before = structuredClone(payload);
            Object.freeze(payload.hlo);
            Object.freeze(payload);
            const normalized = normalizeMessageByOperationType(payload, config);
            t.ok(b4a.equals(normalized.hlo.md, bytes), 'metadata bytes are preserved');
            t.is(schema.validateHtlcLockOperation(normalized), true, 'normalized operation satisfies the schema');
            t.alike(structuredClone(payload), before, 'input is unchanged');
            const json = normalizeDecodedPayloadForJson(normalized, config);
            t.is(json.hlo.md, b4a.toString(bytes, 'hex'), 'JSON renders metadata as hex');
        }
    }
});

test('HTLC normalization rejects malformed metadata encodings and types', t => {
    for (const md of [null, '', '0', 'abc', 'zz', '0x00', ' 00', '00 ',
        false, 1, 1n, Symbol('metadata'), {}, [0], new ArrayBuffer(1), new Uint16Array(1),
        {type: 'Buffer', data: [0]}]) {
        const payload = makeHtlcMetadataPayload();
        payload.hlo.md = md;
        t.exception(() => normalizeMessageByOperationType(payload, config), /hex|Buffer|null/);
    }
});

test('HTLC normalization does not discard metadata that must fail schema size validation', t => {
    const schema = new StateValidationSchema(config);
    for (const md of [b4a.alloc(0), new Uint8Array(0), b4a.alloc(1025), hex('00', 1025)]) {
        const payload = makeHtlcMetadataPayload();
        payload.hlo.md = md;
        const normalized = normalizeMessageByOperationType(payload, config);
        t.is(Object.hasOwn(normalized.hlo, 'md'), true, 'invalid metadata is not silently omitted');
        t.is(normalized.hlo.md.length, typeof md === 'string' ? md.length / 2 : md.length, 'bytes are not truncated');
        t.is(schema.validateHtlcLockOperation(normalized), false, 'schema enforces the metadata size limit');
    }
});
