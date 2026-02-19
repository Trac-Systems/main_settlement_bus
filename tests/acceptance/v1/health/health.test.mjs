import request from "supertest"

export const registerHealthTests = (context) => {
    describe("GET /v1/health", () => {
        it("should return 200 and ok:true when healthy", async () => {
            const res = await request(context.server).get("/v1/health")
            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({ ok: true })
        })

        it("should return 503 when the state is unavailable", async () => {
            const originalState = context.rpcMsb.state;
            Object.defineProperty(context.rpcMsb, 'state', {
                get: () => null,
                configurable: true
            });

            try {
                const res = await request(context.server).get("/v1/health")
                
                expect(res.statusCode).toBe(503)
                expect(res.body).toEqual({ 
                    error: "Could not connect to RPC server" 
                })
            } finally {
                Object.defineProperty(context.rpcMsb, 'state', {
                    get: () => originalState,
                    configurable: true
                });
            }
        })
    })
}