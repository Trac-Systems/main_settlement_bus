import request from "supertest"

export const registerConfirmedLengthTests = (context) => {
    describe("GET /v1/confirmed-length", () => {
        it("returns confirmed length", async () => {
            const res = await request(context.server).get("/v1/confirmed-length")
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({ confirmed_length: expect.any(Number) })
        })
    })
}
