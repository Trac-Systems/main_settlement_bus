import { hash } from 'hypercore-crypto';

const isBare = typeof Bare !== 'undefined';
const fs = (await (isBare ? import('bare-fs') : import('fs'))).default;
const path = (await (isBare ? import('bare-path') : import('path'))).default;

function read(filename) {
    try {
        if (fs.statSync(filename).size > 1024 * 1024) return null;
        return fs.readFileSync(filename, 'utf8');
    } catch {
        return null;
    }
}

function packageInfo(filename) {
    try { return JSON.parse(read(filename)); } catch { return null; }
}

function packageRoot(name, root) {
    try {
        let dir = path.dirname(decodeURIComponent(new URL(import.meta.resolve(name)).pathname));
        while (dir !== path.dirname(dir)) {
            if (packageInfo(path.join(dir, 'package.json'))?.name === name) return dir;
            dir = path.dirname(dir);
        }
    } catch { /* Bundled runtimes may not expose installed packages. */ }
    return path.join(root, 'node_modules', name);
}

// Read deployment metadata once, never shell out or inspect environment/key files.
// HEAD describes the checkout at startup, not a guarantee of unmodified sources.
export function runtimeMetadata() {
    try {
        const root = decodeURIComponent(new URL('../../', import.meta.url).pathname);
        let gitDir = path.join(root, '.git');
        const gitFile = read(gitDir);
        if (gitFile?.startsWith('gitdir: ')) gitDir = path.resolve(root, gitFile.trim().slice(8));
        const common = read(path.join(gitDir, 'commondir'))?.trim();
        const commonDir = common ? path.resolve(gitDir, common) : gitDir;
        const head = read(path.join(gitDir, 'HEAD'))?.trim();
        const ref = head?.startsWith('ref: ') ? head.slice(5) : null;
        let sha = ref ? read(path.join(gitDir, ref))?.trim() ?? read(path.join(commonDir, ref))?.trim() : head;
        if (ref && !sha) {
            const line = read(path.join(commonDir, 'packed-refs'))?.split('\n').find(line => line.endsWith(` ${ref}`));
            sha = line?.split(' ')[0];
        }
        const dependencies = {};
        for (const name of ['autobase', 'hypercore', 'hyperbee', 'corestore', 'hyperswarm', 'hyperdht']) {
            dependencies[name] = packageInfo(path.join(packageRoot(name, root), 'package.json'))?.version ?? null;
        }
        let dir = packageRoot('hyperswarm', root);
        while (dir !== path.dirname(dir)) {
            const version = packageInfo(path.join(dir, 'node_modules/hyperdht/package.json'))?.version;
            if (version) { dependencies.hyperswarm_hyperdht = version; break; }
            dir = path.dirname(dir);
        }
        const sourceHashes = {};
        for (const filename of ['msb.mjs', 'src/index.js', 'src/core/state/State.js',
            'src/core/network/Network.js', 'src/diagnostics/IndexerDiagnostics.js',
            'src/diagnostics/runtimeMetadata.js', 'src/diagnostics/DiagnosticOutput.js']) {
            const source = read(path.join(root, filename));
            sourceHashes[filename] = source === null ? null : hash(Buffer.from(source)).toString('hex');
        }
        return {
            checkout_head_at_start: /^[a-f0-9]{40}$/.test(sha ?? '') ? sha : null,
            checkout_ref_at_start: ref,
            package_version: packageInfo(path.join(root, 'package.json'))?.version ?? null,
            dependencies,
            source_blake2b256: sourceHashes,
            runtime: typeof Bare !== 'undefined' ? 'bare' : 'node',
            runtime_version: typeof Bare !== 'undefined' ? Bare.version ?? null : process.version,
            pid: typeof process !== 'undefined' ? process.pid : null,
            utc_offset_minutes: -new Date().getTimezoneOffset(),
        };
    } catch {
        return { metadata_unavailable: true };
    }
}
