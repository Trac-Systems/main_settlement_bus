import test from 'brittle';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transformProtobufs } from '../../../scripts/lib/transform-protobufs.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const modules = [
    ['applyOperations', 'apply/applyOperations.generated.cjs', '../protobufRuntime.cjs', ['applyOperations/applyOperations.proto']],
    ['networkV1', 'network/v1/networkV1.generated.cjs', '../../protobufRuntime.cjs', ['network/v1/network_message.proto']],
    ['consensusV1', 'consensus/v1/consensusV1.generated.cjs', '../../protobufRuntime.cjs', [
        'consensus/v1/consensus_message_header.proto', 'common/consensus/epoch_proof_v1.proto'
    ]]
];

test('Protobuf postprocessing covers fresh generator output and is idempotent', t => {
    for (const [name, file, runtimePath, entries] of modules) {
        const source = execFileSync(path.join(root, 'node_modules/.bin/pbjs'), [
            '-t', 'static-module', '-w', 'commonjs', '--keep-case', '--root', name,
            '-p', path.join(root, 'proto'), ...entries.map(entry => path.join(root, 'proto', entry))
        ], { encoding: 'utf8' });
        const transformed = transformProtobufs(source, runtimePath);
        t.is(transformProtobufs(transformed, runtimePath), transformed, `${name}: a second pass is unchanged`);
        t.is(transformed, fs.readFileSync(path.join(root, 'src/codecs', file), 'utf8'), `${name}: committed output is current`);
        t.absent(/\bBuffer\b|\bUint8Array\b|\$util\.base64\./.test(transformed), `${name}: binary handling uses the adapter`);
        t.exception(() => transformProtobufs(source.replace('reader.bytes()', 'reader.readBytes()'), runtimePath),
            /Unsupported protobufjs output \(decoded bytes\)/, `${name}: generator drift fails visibly`);
        t.exception(() => transformProtobufs(`${source}\nnew Uint8Array(0);`, runtimePath),
            /unadapted binary handling/, `${name}: new native allocation cannot be hidden by type annotation changes`);
    }
});

test('npm run protobuf produces identical codec modules on repeated runs', async t => {
    const temp = await t.tmp();
    fs.mkdirSync(path.join(temp, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/generate-protobufs.js'), path.join(temp, 'scripts/generate-protobufs.js'));
    fs.cpSync(path.join(root, 'scripts/lib'), path.join(temp, 'scripts/lib'), { recursive: true });
    fs.cpSync(path.join(root, 'proto'), path.join(temp, 'proto'), { recursive: true });
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({
        type: 'module', scripts: { protobuf: 'node scripts/generate-protobufs.js' }
    }));

    const generate = () => {
        execFileSync('npm', ['run', 'protobuf'], { cwd: temp, stdio: 'pipe' });
        return modules.map(([, file]) => fs.readFileSync(path.join(temp, 'src/codecs', file), 'utf8'));
    };
    const first = generate();
    t.alike(generate(), first, 'all three outputs are deterministic');
    modules.forEach(([, file], i) => {
        t.is(first[i], fs.readFileSync(path.join(root, 'src/codecs', file), 'utf8'), `${file}: matches the repository`);
    });
});
