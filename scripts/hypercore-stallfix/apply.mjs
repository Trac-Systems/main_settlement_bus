#!/usr/bin/env node
// OPENMAYHEM-STALLFIX: install-time Hypercore backports, run from postinstall.
//
// Why: Hypercore block requests have no age limit, and a responder that has paused a peer drops that peer's block
// requests silently. A node whose needed request sits on such a peer never advances until the connection closes.
// The patch (one exact-text patch set per supported Hypercore version, see hypercore-<version>.mjs here):
//   - cancels an in-flight request after 30 s on the wire, re-queues it for another peer and gives the silent peer a
//     cool-down (30 s doubling to 4 min); one unref'd sweep per replicator, bounded work per sweep;
//   - backports upstream 8cf8ad9 (#896) fix 2 (a stale block-queue entry no longer consumes a peer update);
//   - answers NOT_AVAILABLE (max 16 per minute per peer, silent beyond) to a peer we paused, instead of silence.
//   - backports upstream c24f37a (#911): never attach a stream that closed while the core was opening (v2).
//   - backports upstream #874 on 11.18.3 to skip absent remote bitfield pages when clearing bits.
// No wire-format change: patched and unpatched nodes interoperate.
//
// What this script does: finds every Hypercore copy this package loads (its own resolution plus the copies that
// autobase, corestore, trac-msb and trac-peer resolve from here, hoisted or nested), and for each copy:
//   - supported version, original hashes      -> prepares each file (each original text must occur exactly once),
//                                                 checks all result hashes, writes each file atomically (tmp + rename);
//   - supported version, file hash = patched   -> "already patched" (idempotent; safe when both packages run it);
//   - supported version, hash of a previous release -> applies that release's upgrade edits and checks the result hash;
//   - supported version, any other content      -> exit 1 with a clear message (nothing is written);
//   - unsupported version                       -> loud warning, no change.
// Usage: node scripts/hypercore-stallfix/apply.mjs [--check] [--quiet]
//   --check  only report; exit 1 if a supported copy is not patched.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PATCH_SETS = ['hypercore-11.18.3.mjs', 'hypercore-11.8.3.mjs']
const FOLLOW = ['autobase', 'corestore', 'trac-msb', 'trac-peer']
const MAX_DEPTH = 3

export async function loadPatchSets() {
    const sets = new Map()
    for (const name of PATCH_SETS) {
        const mod = await import(pathToFileURL(path.join(here, name)).href)
        sets.set(mod.default.version, mod.default)
    }
    return sets
}

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex')
}

function findPackageDir(name, fromDir) {
    let dir = fromDir
    for (;;) {
        const candidate = path.join(dir, 'node_modules', name)
        if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate)
        const parent = path.dirname(dir)
        if (parent === dir) return null
        dir = parent
    }
}

// Every Hypercore copy loaded from packageDir: bounded walk over FOLLOW packages, deduplicated by real path.
export function findHypercoreCopies(packageDir) {
    const copies = new Map()
    const seen = new Set()
    let level = [fs.realpathSync(packageDir)]
    for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
        const next = []
        for (const dir of level) {
            if (seen.has(dir)) continue
            seen.add(dir)
            const hc = findPackageDir('hypercore', dir)
            if (hc !== null && !copies.has(hc)) copies.set(hc, path.relative(packageDir, dir) || '.')
            for (const name of FOLLOW) {
                const d = findPackageDir(name, dir)
                if (d !== null && !seen.has(d)) next.push(d)
            }
        }
        level = next
    }
    return [...copies.entries()].map(([dir, from]) => ({ dir, from }))
}

export function applyPatchSet(text, set) {
    let out = text
    for (const [original, replacement] of set.edits) {
        const parts = out.split(original)
        if (parts.length !== 2) {
            throw new Error('expected original text exactly once, found ' + (parts.length - 1) + ': ' + JSON.stringify(original.slice(0, 80)))
        }
        out = parts[0] + replacement + parts[1]
    }
    return out
}

// Reverse of applyPatchSet (tests and forensics): restores the original text from a patched file.
export function unapplyPatchSet(text, set) {
    let out = text
    for (let i = set.edits.length - 1; i >= 0; i--) {
        const [original, replacement] = set.edits[i]
        const parts = out.split(replacement)
        if (parts.length !== 2) throw new Error('expected patched text exactly once, found ' + (parts.length - 1))
        out = parts[0] + original + parts[1]
    }
    return out
}

export function sha256Hex(text) {
    return sha256(text)
}

export function getPatchUpgrades(set) {
    const additional = set.additionalUpgrades ?? []
    if (!set.previousPatchedSha256) return additional
    return [{ label: 'v1', sha256: set.previousPatchedSha256, edits: set.upgradeEdits }, ...additional]
}

function inspectFile(file, set, upgrades) {
    const text = fs.readFileSync(file, 'utf8')
    // keep the inspected text: patching must not re-read the file, a parallel run may have replaced it meanwhile
    const hash = sha256(text)
    const upgrade = upgrades.find((candidate) => candidate.sha256 === hash)
    let state = 'mismatch'
    if (hash === set.patchedSha256) state = 'patched'
    else if (hash === set.originalSha256) state = 'original'
    else if (upgrade) state = 'previous-patched'
    else if (upgrades.length && text.includes('OPENMAYHEM-STALLFIX')) state = 'other-stallfix-revision'
    return { text, hash, state, upgrade }
}

export async function run({ packageDir, check = false, quiet = false, log = console.log, warn = console.error } = {}) {
    const sets = await loadPatchSets()
    const copies = findHypercoreCopies(packageDir)
    const name = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).name
    const tag = '[hypercore-stallfix ' + name + ']'
    let failed = false

    if (copies.length === 0) warn(tag + ' WARNING: no hypercore copy found from ' + packageDir + ' (nothing patched)')

    const results = []
    for (const copy of copies) {
        const { version } = JSON.parse(fs.readFileSync(path.join(copy.dir, 'package.json'), 'utf8'))
        const set = sets.get(version)
        const where = 'hypercore ' + version + ' at ' + copy.dir + ' (via ' + copy.from + ')'
        if (!set) {
            warn(tag + ' WARNING: ' + where + ' is not a supported version (' + [...sets.keys()].join(', ') + '); NOT patched')
            results.push({ ...copy, version, supported: false, state: 'unsupported-version', sha256: null })
            continue
        }

        const writes = []
        let copyFailed = false
        for (const patch of [set, ...(set.additionalPatches ?? [])]) {
            const file = path.join(copy.dir, patch.file)
            const upgrades = getPatchUpgrades(patch)
            const { text, hash, state, upgrade } = inspectFile(file, patch, upgrades)
            const result = { ...copy, version, file: patch.file, supported: true, state, sha256: hash }
            results.push(result)
            const location = where + ' ' + patch.file
            const label = patch.label ?? 'v2'

            if (state === 'patched') {
                if (!quiet) log(tag + ' ' + location + ': already patched (sha256 ' + hash + ')')
                continue
            }
            if (state !== 'original' && !upgrade) {
                const otherRevision = state === 'other-stallfix-revision' ? ', patched by a different stallfix revision' : ''
                const previous = upgrades.map(({ label, sha256 }) => ', released ' + label + ' ' + sha256).join('')
                warn(tag + ' ERROR: ' + where + ' has unexpected ' + patch.file + ' content (sha256 ' + hash + otherRevision +
                    '; expected original ' + patch.originalSha256 + previous + ' or patched ' + label + ' ' + patch.patchedSha256 + '). Refusing to patch.')
                copyFailed = true
                continue
            }
            if (check) {
                warn(tag + ' ' + location + ': NOT patched to ' + label + (upgrade ? ' (released ' + upgrade.label + ' needs upgrade)' : ''))
                copyFailed = true
                continue
            }

            try {
                const patched = applyPatchSet(text, upgrade ?? patch)
                if (sha256(patched) !== patch.patchedSha256) throw new Error('patched result has an unexpected hash')
                const action = upgrade ? 'UPGRADED ' + upgrade.label + ' -> ' + label : 'PATCHED ' + label
                writes.push({ file, patched, hash: patch.patchedSha256, result, location, action })
            } catch (err) {
                warn(tag + ' ERROR: ' + location + ': ' + err.message + '; nothing written')
                copyFailed = true
            }
        }

        if (copyFailed) {
            failed = true
            continue
        }
        for (const { file, patched, hash, result, location, action } of writes) {
            // atomic: a parallel run (trac-msb and trac-peer postinstall) writes the same bytes, rename keeps one
            const tmp = file + '.stallfix-' + process.pid + '.tmp'
            fs.writeFileSync(tmp, patched)
            fs.renameSync(tmp, file)
            result.state = 'patched'
            result.sha256 = hash
            log(tag + ' ' + location + ': ' + action + ' (sha256 ' + hash + ')')
        }
    }
    return { ok: !failed, results }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2)
    const packageDir = path.resolve(here, '..', '..')
    run({ packageDir, check: args.includes('--check'), quiet: args.includes('--quiet') }).then(({ ok }) => {
        if (!ok) {
            console.error('[hypercore-stallfix] FAILED: see the messages above for the affected Hypercore backports.')
            process.exit(1)
        }
    }, (err) => {
        console.error('[hypercore-stallfix] FAILED:', err && err.stack ? err.stack : err)
        process.exit(1)
    })
}
