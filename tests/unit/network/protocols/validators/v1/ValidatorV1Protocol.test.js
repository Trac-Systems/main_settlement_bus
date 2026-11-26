import test from 'brittle';
import b4a from 'b4a';
import ValidatorV1Protocol from '../../../../../../src/core/network/protocols/validators/v1/ValidatorV1Protocol.js';
import ValidatorPendingRequestService from '../../../../../../src/core/network/protocols/validators/v1/ValidatorPendingRequestService.js';
import fixtures from '../../../../../fixtures/networkV1.fixtures.js';
import { config } from '../../../../../helpers/config.js';

if (typeof globalThis.Bare !== 'undefined') {
    test('ValidatorV1Protocol transport ownership uses Node streams', t => t.pass('covered in Node'));
} else {
    test('ValidatorV1Protocol ties requests to their transport and refuses sends after closure', async t => {
        const { Duplex } = await import('node:stream');
        const pending = new ValidatorPendingRequestService(config);
        t.teardown(() => pending.close());
        const open = () => {
            // Keep writes unanswered so requests remain in flight until the transport fails.
            const connection = new Duplex({ read() {}, write(_data, _encoding, callback) { callback(); } });
            connection.remotePublicKey = b4a.alloc(32, 1);
            t.teardown(() => connection.destroy());
            return { connection, protocol: new ValidatorV1Protocol({ async route() {} }, connection, pending, config) };
        };
        const old = open();
        const replacement = open();
        const oldResult = old.protocol.send({ ...fixtures.payloadLivenessRequest, id: 'old' }).catch(error => error);
        const newResult = replacement.protocol.send({ ...fixtures.payloadLivenessRequest, id: 'new' }).catch(error => error);
        t.is(pending.getPendingRequest('old').connection, old.connection);
        t.is(pending.getPendingRequest('new').connection, replacement.connection);

        const error = new Error('connection reset by peer');
        t.is(pending.rejectPendingRequestsForConnection(old.connection, error), 1);
        t.is(await oldResult, error);
        t.ok(pending.has('new'), 'replacement request survives the old transport failure');
        t.is(pending.rejectPendingRequestsForConnection(old.connection, error), 0, 'repeated cleanup is harmless');
        t.is(pending.rejectPendingRequestsForConnection(null, error), 0);
        pending.resolvePendingRequest('new', 'ok');
        t.is(await newResult, 'ok');

        old.connection.destroy();
        await t.exception(() => old.protocol.send({ ...fixtures.payloadLivenessRequest, id: 'after-destroy' }), /connection is closed/);
        replacement.protocol.close();
        await t.exception(() => replacement.protocol.send({ ...fixtures.payloadLivenessRequest, id: 'after-close' }), /connection is closed/);
        t.absent(pending.has('after-destroy'));
        t.absent(pending.has('after-close'));
    });
}
