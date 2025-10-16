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
        enable_auto_transaction_consent: false,
        enable_wallet: true,
        enable_validator_observer: true,
        enable_interactive_mode: false,
        disable_rate_limit: true,
        enable_txlogs: false,
        stores_directory: `${tmpDirectory}/stores/`,
        store_name: '/admin'
    }

    const peer = await setupMsbAdmin(testKeyPair1, tmpDirectory, rpcOpts)
    const writer = await setupMsbWriter(peer, 'writer', testKeyPair2, tmpDirectory, rpcOpts);
    await fundPeer(peer, writer, $TNK(100n))
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
        expect(res.body).toEqual({ confirmed_length: 16 })
    })

    it("GET /v1/unconfirmed-length", async () => {
        const res = await request(server).get("/v1/unconfirmed-length")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ unconfirmed_length: 16 })
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
        expect(res.body).toEqual({ address: wallet.address, balance: "100000000000000000000" })
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

    // TODO: not sure why but test runner does not work, so this will require more attention.
    // We can map some of the tx hashes from previous OPs and fetch and assert payload here
    it("POST /v1/tx-payloads-bulk", async () => {
        
        const payload = { hashes: [
            "test"
        ]}

        const res = await request(server)
            .post("/v1/tx-payloads-bulk")
            .set("Accept", "application/json")
            .send(JSON.stringify( payload ))
        
        expect(res.statusCode).toBe(200)
        expect(res.body).toMatchObject({
            results: [],
            missing:["test"]
        })
    })
})