const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { check } = require('../scripts/check-hyperdht-bogon.cjs')

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'msb-bogon-'))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const pkg = (dir, json) => {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(json))
    }
    pkg(root, { name: 'consumer', dependencies: { hyperdht: '6.29.6', bogon: '^1.3.0' } })
    const dht = path.join(root, 'node_modules/hyperdht')
    pkg(dht, { name: 'hyperdht', version: '6.29.6', dependencies: { bogon: '^1.0.0' }, exports: './index.js' })
    const bogon = (dir, compatible) => {
        pkg(dir, { name: 'bogon', version: compatible ? '1.3.0' : '1.1.0', main: 'index.cjs' })
        fs.writeFileSync(path.join(dir, 'index.cjs'), `exports.isBogon = () => false; ${compatible ? 'exports.isReserved = () => false;' : ''}`)
    }
    bogon(path.join(root, 'node_modules/bogon'), true)
    return { root, dht, bogon }
}

test('accepts compatible hoisted Bogon when manifests are hidden by exports', t => {
    const { root } = fixture(t)
    assert.equal(check(root), 1)
})

test('rejects stale nested Bogon even when consumer has Bogon 1.3.0', t => {
    const { root, dht, bogon } = fixture(t)
    bogon(path.join(dht, 'node_modules/bogon'), false)
    assert.throws(() => check(root), /HyperDHT 6.29.6 resolves incompatible Bogon/)
})

test('finds HyperDHT nested under another dependency', t => {
    const { root, dht, bogon } = fixture(t)
    const nested = path.join(root, 'node_modules/transport/node_modules/hyperdht')
    fs.mkdirSync(path.dirname(nested), { recursive: true })
    fs.renameSync(dht, nested)
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'consumer', dependencies: { transport: '1.0.0' } }))
    fs.writeFileSync(path.join(root, 'node_modules/transport/package.json'), JSON.stringify({ name: 'transport', dependencies: { hyperdht: '6.29.6' } }))
    bogon(path.join(nested, 'node_modules/bogon'), false)
    assert.throws(() => check(root), /incompatible Bogon/)
})
