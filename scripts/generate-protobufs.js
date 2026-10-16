import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { transformProtobufs } from './lib/transform-protobufs.js';

function generatePbjsModule(pbjsPath, protoRootPath, entryPaths, outputPath, rootName) {
    const generated = execFileSync(pbjsPath, [
        '-t', 'static-module',
        '-w', 'commonjs',
        '--keep-case',
        '--root', rootName,
        '-p', protoRootPath,
        ...entryPaths
    ], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
    const runtimePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/codecs/protobufRuntime.cjs');
    let relativeRuntimePath = path.relative(path.dirname(outputPath), runtimePath).split(path.sep).join('/');
    if (!relativeRuntimePath.startsWith('.')) relativeRuntimePath = `./${relativeRuntimePath}`;
    const content = transformProtobufs(generated, relativeRuntimePath);
    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`${outputPath} has been generated with b4a-compatible binary handling.`);
}

function main() {
    const directoryName = path.dirname(fileURLToPath(import.meta.url));

    const inputDir = path.join(directoryName, '../proto');
    const applyOutputDir = path.join(directoryName, '../src/codecs/apply');
    const networkOutputDir = path.join(directoryName, '../src/codecs/network/v1');
    const consensusOutputDir = path.join(directoryName, '../src/codecs/consensus/v1');
    const pbjsPath = path.join(directoryName, '../node_modules/.bin/pbjs');
    const applyOperationsEntryPath = path.join(inputDir, 'applyOperations/applyOperations.proto');
    const generatedApplyOperationsOutputPath = path.join(applyOutputDir, 'applyOperations.generated.cjs');
    const networkEntryPath = path.join(inputDir, 'network/v1/network_message.proto');
    const generatedNetworkOutputPath = path.join(networkOutputDir, 'networkV1.generated.cjs');
    const consensusEntryPath = path.join(inputDir, 'consensus/v1/consensus_message_header.proto');
    const epochProofV1EntryPath = path.join(inputDir, 'common/consensus/epoch_proof_v1.proto');
    const generatedConsensusOutputPath = path.join(consensusOutputDir, 'consensusV1.generated.cjs');

    fs.mkdirSync(applyOutputDir, { recursive: true });
    fs.mkdirSync(networkOutputDir, { recursive: true });
    fs.mkdirSync(consensusOutputDir, { recursive: true });

    generatePbjsModule(
        pbjsPath,
        inputDir,
        [applyOperationsEntryPath],
        generatedApplyOperationsOutputPath,
        'applyOperations'
    );

    generatePbjsModule(
        pbjsPath,
        inputDir,
        [networkEntryPath],
        generatedNetworkOutputPath,
        'networkV1'
    );

    generatePbjsModule(
        pbjsPath,
        inputDir,
        [consensusEntryPath, epochProofV1EntryPath],
        generatedConsensusOutputPath,
        'consensusV1'
    );
}

main();
