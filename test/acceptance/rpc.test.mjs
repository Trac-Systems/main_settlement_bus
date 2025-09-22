import request from "supertest"
import { createServer } from "../../rpc/create_server.mjs"
import { initTemporaryDirectory } from '../utils/setupApplyTests.js'
import { testKeyPair1 } from '../fixtures/apply.fixtures.js'
import { randomBytes, initMsbPeer, setupMsbAdmin } from "../utils/setupApplyTests.js"

let msb
let server
let wallet

beforeAll(async () => {  
  const tmpDirectory = await initTemporaryDirectory()
  const rpcOpts = {
    channel: randomBytes(32).toString('hex'),
    enable_role_requester: false,
    enable_auto_transaction_consent: false,
    enable_wallet: true,
    enable_validator_observer: true,
    enable_interactive_mode: false,
    disable_rate_limit: true,
    enable_txlogs: true,
    stores_directory: `${tmpDirectory}/stores/`,
    store_name: '/admin',
    mnemonic: 'slight wedding permit mention subject mask hawk awkward sniff leopard spider scatter close neutral deny apple wide category sick love sorry pupil then legal'
  }

  const peer = await setupMsbAdmin(testKeyPair1, tmpDirectory, rpcOpts)
  msb = peer.msb // new MainSettlementBus(rpcOpts)

  wallet = msb.wallet
  server = createServer(msb)
})

afterAll(async () => {
  await msb.close()
})

describe("API acceptance tests", () => {
  it("GET /confirmed-length", async () => {
    const res = await request(server).get("/confirmed-length")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ confirmed_length: 0 })
  })

  it("GET /unconfirmed-length", async () => {
    const res = await request(server).get("/unconfirmed-length")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ unconfirmed_length: 0 })
  })

  it("GET /txv", async () => {
    const res = await request(server).get("/txv")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ txv: expect.stringMatching(/^[a-z0-9]{64}$/) })
  })

  it("GET /fee", async () => {
    const res = await request(server).get("/fee")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ fee: expect.stringMatching(/^-?\d+(\.\d+)?$/) })
  })

  it("GET /tx-hashes", async () => {
    const res = await request(server).get("/tx-hashes/0/1")
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ hashes: expect.any(Array) })
  })

  it("GET /balance", async () => {
    const res = await request(server).get(`/balance/${wallet.address}`)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ address: wallet.address, balance: 0 })
  })

  // it("POST /broadcast-transaction", async () => {
  //   const payload = JSON.stringify({ payload: 'ewogICAgICAidHlwZSI6IDEzLAogICAgICAiYWRkcmVzcyI6ICJ0cmFjMWU0dGg1d3ZhZ2EzbGF4cHpmbnZkbXc3OTJodnZqdzkzNXJjazBtZnVoMzY0dWxjdG1kOXF2cmV4c2YiLAogICAgICAidHJvIjogewogICAgICAgICJ0eCI6ICJmNTZhYTQyOGRjZTk2MGQxMjgzZTE2ZDkyYTJkZmZjNzMzMDI2YTQ4MWIyMGMxYzI1YzA4MGVlNDk5ZDIzNDJkIiwKICAgICAgICAidHh2IjogImE0ODlhNzIxOWVjN2YxZGJjYmI3NWI3Y2M0NDgyZmExZGJiYzQ5ODBkNzA4MTNjNTY0ZTdlMWIyZTI2YzUwMjMiLAogICAgICAgICJpbiI6ICI0N2MwNDU0MTE5N2UyNTcxNDllYjg4MzUxMzNmOTYyNThmNDI4MzY5OWZiMzNmNGU5ZWUxNjNiOGFlODRlM2M0IiwKICAgICAgICAidG8iOiAidHJhYzFlbjlmMHJ6cnl5dXgyenZ6d2oyZHJxc2M4ZjdzNGFucjd5bTkwMHJ5Yzg2bGZxMnVncXVzZDZxdHA5IiwKICAgICAgICAiYW0iOiAiMDAwMDAwMDAwMDAwMDAwMDAwYzc1ZTJkNjMxMDAwMDAiLAogICAgICAgICJpcyI6ICJlYTU2OTk0NjNhOWJkNWRkMTZlZWZhNDdiMzU1MTQzYjYwMTVkOGRjY2Q4NmMxNjRkNDcwODkxMzNjYWM5ZDNmYzk3NTRlMjYzZDI0MjY4NjFkYTY5YWRiOGVmYmQzMjlhY2I2OTU0MzVjYWE0NjlkMTlmYjEzNTZiYTk1MWIwYSIKICAgICAgfX0=' })
  //   const res = await request(server)
  //     .post("/broadcast-transaction")
  //     .set("Accept", "application/json")
  //     .send(payload)

  //   expect(res.statusCode).toBe(200)
  //   console.log(res.body)
  //   expect(res.body).toEqual({ hashes: expect.any(Array) })
  // })
})