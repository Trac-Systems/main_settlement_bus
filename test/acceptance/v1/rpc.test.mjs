import request from "supertest"
import { createServer } from "../../../rpc/create_server.mjs"
import { initTemporaryDirectory } from '../../utils/setupApplyTests.js'
import { testKeyPair1, testKeyPair2 } from '../../fixtures/apply.fixtures.js'
import { randomBytes, setupMsbAdmin, setupMsbWriter, fundPeer, removeTemporaryDirectory } from "../../utils/setupApplyTests.js"
import { $TNK } from "../../../src/core/state/utils/balance.js"
import tracCrypto from 'trac-crypto-api';
import b4a from 'b4a'

let msb
let server
let wallet
let toClose
let tmpDirectory

const setupNetwork = async () => {
    tmpDirectory = await initTemporaryDirectory()
    const rpcOpts = {
        bootstrap: randomBytes(32).toString('hex'),
        channel: randomBytes(32).toString('hex'),
        enable_role_requester: false,
        enable_wallet: true,
        enable_validator_observer: true,
        enable_interactive_mode: false,
        disable_rate_limit: true,
        enable_tx_apply_logs: false,
        stores_directory: `${tmpDirectory}/stores/`,
        store_name: '/admin'
    }

    const peer = await setupMsbAdmin(testKeyPair1, tmpDirectory, rpcOpts)
    const writer = await setupMsbWriter(peer, 'writer', testKeyPair2, tmpDirectory, peer.options);
    return { writer, peer }
}

beforeAll(async () => {
    const { peer, writer } = await setupNetwork()
    msb = writer.msb
    wallet = msb.wallet
    server = createServer(msb)
    toClose = peer.msb
})

afterAll(async () => {
    await Promise.all([msb?.close(), toClose?.close()])
    await removeTemporaryDirectory(tmpDirectory)
})

// The order here is important since the OPs change the network state. We wont boot up an instance before each because the tests are to verify rpc structure and the decision is to spare ci resources.
describe("API acceptance tests", () => {
    it("GET /v1/confirmed-length", async () => {
        const res = await request(server).get("/v1/confirmed-length")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ confirmed_length: expect.any(Number) })
    })

    it("GET /v1/unconfirmed-length", async () => {
        const res = await request(server).get("/v1/unconfirmed-length")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ unconfirmed_length: expect.any(Number) })
    })

    it("GET /v1/txv", async () => {
        const res = await request(server).get("/v1/txv")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ txv: expect.stringMatching(/^[a-z0-9]{64}$/) })
    })

    it("GET /v1/fee", async () => {
        const res = await request(server).get("/v1/fee")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ fee: expect.stringMatching(/^-?\d+(\.\d+)?$/) })
    })

    describe('GET /v1/tx-hashes', () => {
        it("< 1000", async () => {
            const res = await request(server).get("/v1/tx-hashes/1/1001")
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({
                hashes: expect.arrayContaining([
                    expect.objectContaining({
                        hash: expect.any(String),
                        confirmed_length: expect.any(Number),
                    })
                ])
            })
        })

        it("> 1000", async () => {
            const res = await request(server).get("/v1/tx-hashes/1/1002")
            expect(res.statusCode).toBe(400)
        })
    })

    it("GET /v1/balance", async () => {
        const res = await request(server).get(`/v1/balance/${wallet.address}`)
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ address: wallet.address, balance: "9670000000000000000" })
    })

    it("GET /v1/balance unconfirmed", async () => {
        const res = await request(server).get(`/v1/balance/${wallet.address}?confirmed=false`)
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ address: wallet.address, balance: "9670000000000000000" })
    })

    it("POST /v1/broadcast-transaction", async () => {
        const txData = await tracCrypto.transaction.preBuild(
            wallet.address,
            wallet.address,
            b4a.toString($TNK(1n), 'hex'),
            b4a.toString(await msb.state.getIndexerSequenceState(), 'hex')
        );

        const payload = tracCrypto.transaction.build(txData, b4a.from(wallet.secretKey, 'hex'));
        const res = await request(server)
            .post("/v1/broadcast-transaction")
            .set("Accept", "application/json")
            .send(JSON.stringify({ payload }))

        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({
            result: {
                message: "Transaction broadcasted successfully.",
                signedLength: expect.any(Number),
                unsignedLength: expect.any(Number),
            }
        })
    })

    it("POST /v1/tx-payloads-bulk", async () => {
        const result = await msb.state.confirmedTransactionsBetween(0, 40) // This is just an arbitrary range that will most likely contain valid
        const hashes = result.map(({ hash }) => hash)

        const payload = { hashes }

        const res = await request(server)
            .post("/v1/tx-payloads-bulk")
            .set("Accept", "application/json")
            .send(JSON.stringify(payload))

        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({
            results: expect.arrayOf(
                expect.objectContaining({
                    hash: expect.any(String),
                })
            ),
            missing: []
        })
    })

    describe('GET /v1/tx/details', () => {

        it("positive case - should return 200 for valid already broadcasted hash confirmed and unconfirmed", async () => {
            const txData = await tracCrypto.transaction.preBuild(
                wallet.address,
                wallet.address,
                b4a.toString($TNK(1n), 'hex'),
                b4a.toString(await msb.state.getIndexerSequenceState(), 'hex')
            );

            const payload = tracCrypto.transaction.build(txData, b4a.from(wallet.secretKey, 'hex'));
            const broadcastRes = await request(server)
                .post("/v1/broadcast-transaction")
                .set("Accept", "application/json")
                .send(JSON.stringify({ payload }));
            expect(broadcastRes.statusCode).toBe(200);

            const resConfirmed = await request(server)
                .get(`/v1/tx/details/${txData.hash.toString('hex')}?confirmed=true`);
            expect(resConfirmed.statusCode).toBe(200);

            expect(resConfirmed.body).toMatchObject({
                txDetails: expect.any(Object),
                confirmed_length: expect.any(Number),
                fee: expect.any(String)
            })

            const resUnconfirmed = await request(server)
                .get(`/v1/tx/details/${txData.hash.toString('hex')}?confirmed=false`);
            expect(resUnconfirmed.statusCode).toBe(200);

            expect(resUnconfirmed.body).toMatchObject({
                txDetails: expect.any(Object),
                confirmed_length: expect.any(Number),
                fee: expect.any(String)
            })
        });

        it("should handle null confirmed_length for unconfirmed transaction", async () => {
            const txData = await tracCrypto.transaction.preBuild(
                wallet.address,
                wallet.address,
                b4a.toString($TNK(1n), 'hex'),
                b4a.toString(await msb.state.getIndexerSequenceState(), 'hex')
            );

            const payload = tracCrypto.transaction.build(txData, b4a.from(wallet.secretKey, 'hex'));
            
            const originalGetConfirmedLength = msb.state.getTransactionConfirmedLength;
            msb.state.getTransactionConfirmedLength = async () => null;

            try {
                const broadcastRes = await request(server)
                    .post("/v1/broadcast-transaction")
                    .set("Accept", "application/json")
                    .send(JSON.stringify({ payload }));
                expect(broadcastRes.statusCode).toBe(200);

                const res = await request(server)
                    .get(`/v1/tx/details/${txData.hash.toString('hex')}?confirmed=false`);
                expect(res.statusCode).toBe(200);

                expect(res.body).toMatchObject({
                    txDetails: expect.any(Object),
                    confirmed_length: 0,
                    fee: '0'
                });
            } finally {
                msb.state.getTransactionConfirmedLength = originalGetConfirmedLength;
            }
        });

        it("should return 404 for non-existent transaction hash", async () => {
            const nonExistentHash = "0b4d1c1dac48af13212f616601d7399457476a0b644850875b7f4b79df6ff89c";
            const res = await request(server)
                .get(`/v1/tx/details/${nonExistentHash}`);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({
                error: `No payload found for tx hash: ${nonExistentHash}`
            });
        });

        it("should return 400 for invalid hash format (too short)", async () => {
            const invalidHash = '0'.repeat(63);
            const res = await request(server)
                .get(`/v1/tx/details/${invalidHash}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Invalid transaction hash format"
            });
        });

        it("should return 400 for invalid hash format (non-hex)", async () => {
            const invalidHash = 'Z'.repeat(64);
            const res = await request(server)
                .get(`/v1/tx/details/${invalidHash}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Invalid transaction hash format"
            });
        });

        it("should return 400 for invalid confirmed parameter", async () => {
            const hash = "0b4d1c1dac48af13212f616601d7399457476a0b644850875b7f4b79df6ff89c";

            const res = await request(server)
                .get(`/v1/tx/details/${hash}?confirmed=invalid`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: 'Parameter "confirmed" must be exactly "true" or "false"'
            });
        });

        it("should return 400 for invalid confirmed parameter case (UPPERCASE)", async () => {
            const hash = "0b4d1c1dac48af13212f616601d7399457476a0b644850875b7f4b79df6ff89c";
            const res = await request(server).get(`/v1/tx/details/${hash}?confirmed=TRUE`);
            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: 'Parameter "confirmed" must be exactly "true" or "false"'
            });
        });

        it("should return 400 when no hash provided", async () => {
            const res = await request(server)
                .get('/v1/tx/details');

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Transaction hash is required"
            });
        });

        it("should return 400 for hash with invalid characters", async () => {
            const invalidHash = '0b4d1c1dac48$af13212f6166017399457476a0b644850875b7f4b79df6ff89c';
            const res = await request(server)
                .get(`/v1/tx/details/${invalidHash}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Invalid transaction hash format"
            });
        });

        it("should return 400 for hash with special characters", async () => {
            const invalidHash = '!@#$%^&*'.repeat(8);
            const res = await request(server)
                .get(`/v1/tx/details/${invalidHash}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Invalid transaction hash format"
            });
        });

        it("should return 400 for hash with spaces", async () => {
            const invalidHash = '0b4d1c1dac48af13212f616601d7399457476a0b644850875b7 4b79df6ff89c';
            const res = await request(server)
                .get(`/v1/tx/details/${invalidHash}`);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: "Invalid transaction hash format"
            });
        });
    })
})