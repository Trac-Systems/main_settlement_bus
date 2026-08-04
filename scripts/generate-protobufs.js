import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

function generatePbjsModule(pbjsPath, protoRootPath, entryPath, outputPath, rootName) {
    execFileSync(pbjsPath, [
        '-t', 'static-module',
        '-w', 'commonjs',
        '--keep-case',
        '--root', rootName,
        '-p', protoRootPath,
        '-o', outputPath,
        entryPath
    ]);
    console.log(`${outputPath} has been generated.`);
}

function transformPbjsForBare(outputPath) {
    let content = fs.readFileSync(outputPath, 'utf-8');
    const shim = `if (typeof globalThis !== 'undefined' && typeof globalThis.self === 'undefined') {\n  globalThis.self = globalThis;\n}\n`;
    const strictDirective = '"use strict";';

    if (content.includes(strictDirective)) {
        content = content.replace(strictDirective, `${strictDirective}\n${shim}`);
    } else {
        content = `${strictDirective}\n${shim}${content}`;
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
    console.log(`${outputPath} has been modified for bare-compatible protobufjs runtime.`);
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
    const generatedConsensusOutputPath = path.join(consensusOutputDir, 'consensusV1.generated.cjs');

    fs.mkdirSync(applyOutputDir, { recursive: true });
    fs.mkdirSync(networkOutputDir, { recursive: true });
    fs.mkdirSync(consensusOutputDir, { recursive: true });

    generatePbjsModule(
        pbjsPath,
        inputDir,
        applyOperationsEntryPath,
        generatedApplyOperationsOutputPath,
        'applyOperations'
    );
    transformPbjsForBare(generatedApplyOperationsOutputPath);

    generatePbjsModule(
        pbjsPath,
        inputDir,
        networkEntryPath,
        generatedNetworkOutputPath,
        'networkV1'
    );
    transformPbjsForBare(generatedNetworkOutputPath);

    generatePbjsModule(
        pbjsPath,
        inputDir,
        consensusEntryPath,
        generatedConsensusOutputPath,
        'consensusV1'
    );
    transformPbjsForBare(generatedConsensusOutputPath);
}

main();
