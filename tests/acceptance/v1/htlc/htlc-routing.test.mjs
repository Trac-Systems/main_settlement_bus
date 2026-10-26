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
