import request from "supertest"
import tracCrypto from "trac-crypto-api"
import b4a from "b4a"
import { $TNK } from "../../../../src/core/state/utils/balance.js"

export const registerBroadcastTransactionTests = (context) => {
    describe("POST /v1/broadcast-transaction", () => {
        it("broadcasts transaction and returns lengths", async () => {
            const txData = await tracCrypto.transaction.preBuild(
                context.wallet.address,
                context.wallet.address,
                b4a.toString($TNK(1n), 'hex'),
                b4a.toString(await context.rpcMsb.state.getIndexerSequenceState(), 'hex')
            )

            const payload = tracCrypto.transaction.build(txData, b4a.from(context.wallet.secretKey, 'hex'))
            const res = await request(context.server)
                .post("/v1/broadcast-transaction")
                .set("Accept", "application/json")
                .send(JSON.stringify({ payload }))

            expect(res.statusCode).toBe(200)
            expect(res.body).toMatchObject({
                result: {
                    message: "Transaction broadcasted successfully.",
                    signedLength: expect.any(Number),
                    unsignedLength: expect.any(Number),
                    tx: expect.any(String)
                }
            })
        })
    })
}
