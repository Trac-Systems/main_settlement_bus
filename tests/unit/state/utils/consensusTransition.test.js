import test from 'brittle';
import b4a from 'b4a';
import { isConsensusTransitionAllowed, validateConsensusConfig } from '../../../../src/core/state/utils/consensusConfig.js';

// Synthetic versions exercise the rules without enabling new network formats.
const transitions = Object.freeze({
    1: Object.freeze([2]),
    2: Object.freeze([3]),
    3: Object.freeze([255]),
    255: Object.freeze([]),
});

test('Consensus transitions allow registered upgrades and same-version parameter changes', t => {
    for (const version of [1, 2, 3, 255]) {
        t.ok(isConsensusTransitionAllowed(version, version, transitions));
    }
    t.ok(isConsensusTransitionAllowed(1, 2, transitions));
    t.ok(isConsensusTransitionAllowed(2, 3, transitions));
    t.ok(isConsensusTransitionAllowed(3, 255, transitions));
    t.absent(isConsensusTransitionAllowed(1, 3, transitions), 'cannot skip a required migration');
    t.absent(isConsensusTransitionAllowed(2, 255, transitions), 'a higher ID alone is not permission');
});

test('Consensus transitions cannot return to an earlier version after multiple upgrades', t => {
    let currentVersion = 1;
    for (const nextVersion of [2, 3, 255]) {
        t.ok(isConsensusTransitionAllowed(currentVersion, nextVersion, transitions));
        currentVersion = nextVersion;
        for (const oldVersion of [1, 2, 3].filter(version => version < currentVersion)) {
            t.absent(isConsensusTransitionAllowed(currentVersion, oldVersion, transitions));
        }
    }
});

test('Consensus transitions reject every backward byte pair even with permissive rules', t => {
    const versions = Array.from({ length: 255 }, (_, index) => index + 1);
    const permissiveRules = Object.fromEntries(versions.map(version => [version, versions]));
    const acceptedDowngrades = [];
    for (const currentVersion of versions) {
        for (let nextVersion = 1; nextVersion < currentVersion; nextVersion++) {
            if (isConsensusTransitionAllowed(currentVersion, nextVersion, permissiveRules)) {
                acceptedDowngrades.push([currentVersion, nextVersion]);
            }
        }
    }
    t.alike(acceptedDowngrades, [], 'all 32,385 backward transitions are rejected');
});

test('Consensus transitions reject malformed and unsupported version identifiers', t => {
    for (const version of [undefined, null, 0, -1, 256, 1.5, NaN, Infinity, '1', true, 1n]) {
        t.absent(isConsensusTransitionAllowed(version, 2, transitions));
        t.absent(isConsensusTransitionAllowed(1, version, transitions));
    }
    t.absent(isConsensusTransitionAllowed(4, 4, transitions), 'unknown same-version config is rejected');
    t.absent(isConsensusTransitionAllowed(1, 4, { 1: [4] }), 'target must also be registered');
    t.absent(isConsensusTransitionAllowed(1, 2, Object.create(transitions)), 'inherited rules are not registered versions');
});

test('Production consensus transition rules do not enable synthetic test versions', t => {
    t.ok(isConsensusTransitionAllowed(1, 1));
    const acceptedVersions = [];
    for (let version = 2; version <= 255; version++) {
        if (isConsensusTransitionAllowed(1, version) || isConsensusTransitionAllowed(version, version)) {
            acceptedVersions.push(version);
        }
    }
    t.alike(acceptedVersions, [], 'none of the other 254 version IDs are enabled');
});

test('Consensus config validation does not reinterpret invalid or unknown versions as VDF V1', t => {
    const cd = b4a.from('000000010400', 'hex');
    t.ok(validateConsensusConfig({ sv: b4a.from([1]), cd }));
    for (const sv of [null, 1, '1', b4a.alloc(0), b4a.from([0]), b4a.from([1, 0]), b4a.from([2]), b4a.from([255])]) {
        t.absent(validateConsensusConfig({ sv, cd }));
    }
    for (const invalidConfig of [null, {}, { sv: b4a.from([1]) }]) {
        t.absent(validateConsensusConfig(invalidConfig));
    }
});
