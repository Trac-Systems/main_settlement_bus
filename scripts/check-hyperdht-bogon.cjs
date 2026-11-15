#!/usr/bin/env node
// Check the actual Bogon seen by each reachable HyperDHT, including nested copies.
// A dependency's overrides and package-lock.json do not constrain its consumers.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')

function check(root = path.resolve(__dirname, '..')) {
    const pending = [path.join(root, 'package.json')]
    const seen = new Set()
    let checked = 0
    while (pending.length) {
        const manifest = pending.pop()
        if (seen.has(manifest)) continue
        seen.add(manifest)
        const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
        const requireFrom = createRequire(manifest)
        if (pkg.name === 'hyperdht') {
            checked++
            const [major, minor] = pkg.version.split('.').map(Number)
            if (major < 6 || (major === 6 && minor < 29)) continue
            const bogon = requireFrom('bogon')
            if (typeof bogon.isReserved !== 'function' || typeof bogon.isBogon !== 'function') {
                throw new Error(`HyperDHT ${pkg.version} resolves incompatible Bogon at ${requireFrom.resolve('bogon')}. Update the consumer lockfile to bogon >=1.2.0 and reinstall; same-host or LAN peer connections can otherwise crash.`)
            }
        }
        for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
            // Resolve physical manifests even when package exports hide package.json.
            const paths = requireFrom.resolve.paths(`${name}/package.json`) || []
            const resolved = paths.map(dir => path.join(dir, name, 'package.json')).find(file => fs.existsSync(file))
            if (!resolved) {
                if (pkg.optionalDependencies?.[name]) continue
                throw new Error(`Missing dependency ${name} required by ${pkg.name}`)
            }
            pending.push(fs.realpathSync(resolved))
        }
    }
    if (checked === 0) throw new Error('No HyperDHT found; dependency installation is incomplete.')
    return checked
}

module.exports = { check }
if (require.main === module) {
    try {
        console.log(`HyperDHT/Bogon compatibility: ${check()} copies checked`)
    } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
