// Offline plain-peer reproduction: no MSB roles, wallets, stores or public bootstrap.
const assert = require('node:assert/strict')
const { once } = require('node:events')
const DHT = require('hyperdht')
const UDX = require('udx-native')
const Socket = require('udx-native/lib/socket')
let port = 59100
// Public DHT `udx` injection keeps even ephemeral test sockets in the allocated range.
class LocalSocket extends Socket {
  bind(p, host) {
    assert.equal(host, '127.0.0.1')
    p = p || port++
    assert.ok(p >= 59100 && p <= 59199)
    return super.bind(p, host)
  }
}
class LocalUDX extends UDX {
  createSocket(opts) { return new LocalSocket(this, opts) }
}
const common = { host: '127.0.0.1', nodes: [], udx: new LocalUDX(), anyPort: false }
const nodes = []
const timeout = setTimeout(() => { console.error('REPRO TIMEOUT'); process.exit(2) }, 20000)
;(async () => {
  const relay = DHT.bootstrapper(port++, '127.0.0.1', common)
  nodes.push(relay)
  await relay.fullyBootstrapped()
  const bootstrap = [{ host: '127.0.0.1', port: relay.address().port }]
  for (let i = 0; i < 2; i++) {
    const node = new DHT({ ...common, port: port++, bootstrap, ephemeral: true, firewalled: true })
    nodes.push(node)
    await node.fullyBootstrapped()
  }
  const [, serverNode, client] = nodes
  const server = serverNode.createServer({ shareLocalAddress: true }, socket => {
    socket.on('error', () => {})
    socket.end('plain-peer-ok')
  })
  await server.listen(DHT.keyPair())
  console.log('local relay and two plain non-validator peers ready')
  const socket = client.connect(server.publicKey, { localConnection: true })
  let received = ''
  socket.on('data', b => { received += b })
  await once(socket, 'end')
  assert.equal(received, 'plain-peer-ok')
  socket.destroy()
  await server.close()
  for (const node of nodes.reverse()) await node.destroy()
  clearTimeout(timeout)
  console.log('PASS: encrypted plain-peer transfer through same-host relayed connection')
})().catch(err => { console.error(err.stack); process.exit(1) })
