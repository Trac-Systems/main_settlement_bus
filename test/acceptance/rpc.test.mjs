import request from "supertest"
import { createServer } from "../../rpc/create_server.mjs";
import { initTemporaryDirectory } from '../utils/setupApplyTests.js'
import { testKeyPair1 } from '../fixtures/apply.fixtures.js';
import { randomBytes, initDirectoryStructure } from "../utils/setupApplyTests.js";
import { MainSettlementBus } from '../../src/index.js'

let msb
let server

beforeAll(async () => {  
  const tmpDirectory = await initTemporaryDirectory()
  const peer = await initDirectoryStructure('admin', testKeyPair1, tmpDirectory)
  const rpcOpts = {
    channel: randomBytes(32).toString('hex'),
    enable_role_requester: false,
    enable_auto_transaction_consent: false,
    enable_wallet: false,
    enable_validator_observer: true,
    enable_interactive_mode: true,
    disable_rate_limit: true,
    enable_txlogs: true,
    enable_txlogs: false,
    stores_directory: peer.storesDirectory,
    store_name: peer.storeName
  }

  msb = new MainSettlementBus(rpcOpts)
  await msb.ready()
  server = createServer(msb);
});

afterAll(async () => {
  await msb.close()
})

describe("API acceptance tests", () => {
  it("GET /unconfirmed-length", async () => {
    const res = await request(server).get("/unconfirmed-length");
    expect(res.statusCode).toBe(200);
    console.log(res.body)
    expect(res.body).toEqual({ unconfirmed_length: 0 });
  });
});