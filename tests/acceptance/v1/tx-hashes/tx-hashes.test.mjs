import request from "supertest"

export const registerTxHashesTests = (context) => {
    describe("GET /v1/tx-hashes", () => {
        it("< 1000", async () => {
            const res = await request(context.server).get("/v1/tx-hashes/1/1001")
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
            const res = await request(context.server).get("/v1/tx-hashes/1/1002")
            expect(res.statusCode).toBe(400)
        })
    })
}
