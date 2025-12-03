import request from "supertest"

export const registerBalanceTests = (context) => {
    describe("GET /v1/balance", () => {
        it("returns balance for confirmed view by default", async () => {
            const res = await request(context.server).get(`/v1/balance/${context.wallet.address}`)
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({ address: context.wallet.address, balance: "9670000000000000000" })
        })

        it("returns balance for unconfirmed view", async () => {
            const res = await request(context.server).get(`/v1/balance/${context.wallet.address}?confirmed=false`)
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({ address: context.wallet.address, balance: "9670000000000000000" })
        })
    })
}
