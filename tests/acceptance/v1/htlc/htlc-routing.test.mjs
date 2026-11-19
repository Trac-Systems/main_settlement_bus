import request from 'supertest';
import { createServer } from '../../../../rpc/create_server.js';
import { OperationType } from '../../../../src/utils/constants.js';

const lockId = 'ab'.repeat(32);
const tx = 'cd'.repeat(32);
const address = 'trac1test';
const encoded = payload => Buffer.from(JSON.stringify(payload)).toString('base64');

function registerHtlcRoutingTests() {
    describe('HTLC RPC routing', () => {
        let server;
        let calls;

        beforeEach(() => {
            calls = [];
            const msb = {
                async broadcastTransaction(payload) {
                    calls.push(['broadcast', payload]);
                    return { tx, signedLength: 1, unsignedLength: 2 };
                },
                async htlcLock(payload) {
                    calls.push(['lock', payload]);
                    return { tx, signedLength: 1, unsignedLength: 2 };
                },
                async htlcClaim(payload) {
                    calls.push(['claim', payload]);
                    return { tx, signedLength: 1, unsignedLength: 2 };
                },
                async htlcRefund(payload) {
                    calls.push(['refund', payload]);
                    return { tx, signedLength: 1, unsignedLength: 2 };
                },
                async getHtlc(id, confirmed) {
                    calls.push(['get', id, confirmed]);
                    return { lockId: id, status: 'PENDING' };
                },
            };
            server = createServer(msb, {});
        });

        afterEach(async () => {
            if (server.listening) await new Promise(resolve => server.close(resolve));
        });

        it('routes lock, claim and refund without falling through to the lock endpoint', async () => {
            const operations = [
                ['/v1/htlc', OperationType.HTLC_LOCK, 'hlo', 'lock'],
                [`/v1/htlc/${lockId}/claim`, OperationType.HTLC_CLAIM, 'hco', 'claim'],
                [`/v1/htlc/${lockId}/refund`, OperationType.HTLC_REFUND, 'hro', 'refund'],
            ];
            for (const [path, type, key, expected] of operations) {
                const payload = { type, address, [key]: { li: lockId, tx } };
                const response = await request(server).post(path).send({ payload: encoded(payload) });
                expect(response.statusCode).toBe(200);
                expect(response.body.result.tx).toBe(tx);
                expect(calls.at(-1)).toEqual([expected, payload]);
            }
        });

        it.each([
            ['transfer', OperationType.TRANSFER, 'tro'],
            ['transaction', OperationType.TX, 'txo'],
            ['HTLC lock', OperationType.HTLC_LOCK, 'hlo'],
            ['HTLC claim', OperationType.HTLC_CLAIM, 'hco'],
            ['HTLC refund', OperationType.HTLC_REFUND, 'hro'],
        ])('routes %s through the generic broadcast endpoint', async (_name, type, key) => {
            const operation = { tx };
            if (key === 'hlo') Object.assign(operation, { ss: [lockId, tx], cs: ['ef'.repeat(64)], md: '0080ff' });
            if (key === 'hco' || key === 'hro') operation.li = lockId;
            if (key === 'hco') operation.pi = tx;
            const payload = { type, address, [key]: operation };

            const response = await request(server).post('/v1/broadcast-transaction').send({ payload: encoded(payload) });

            expect(response.statusCode).toBe(200);
            expect(response.body.result).toEqual({
                tx, signedLength: 1, unsignedLength: 2, message: 'Transaction broadcasted successfully.',
            });
            expect(calls).toEqual([['broadcast', payload]]);
        });

        it.each([
            [OperationType.HTLC_LOCK, 'hco'],
            [OperationType.HTLC_CLAIM, 'hro'],
            [OperationType.HTLC_REFUND, 'hlo'],
            [OperationType.ADD_WRITER, 'rao'],
        ])('rejects type %s with unsupported or mismatched body %s', async (type, key) => {
            const response = await request(server).post('/v1/broadcast-transaction').send({
                payload: encoded({ type, address, [key]: { tx, li: lockId } }),
            });
            expect(response.statusCode).toBe(400);
            expect(response.body).toEqual({ error: 'Invalid payload structure.' });
            expect(calls).toEqual([]);
        });

        it('reads an escrow with the requested confirmation mode', async () => {
            const response = await request(server).get(`/v1/htlc/${lockId}?confirmed=false`);
            expect(response.statusCode).toBe(200);
            expect(response.body.htlc).toEqual({ lockId, status: 'PENDING' });
            expect(calls).toEqual([['get', lockId, false]]);
        });

        it('does not route an unknown HTLC path to lock submission', async () => {
            const response = await request(server).post(`/v1/htlc/${lockId}`);
            expect(response.statusCode).toBe(404);
            expect(calls).toEqual([]);
        });
    });
}

registerHtlcRoutingTests();
