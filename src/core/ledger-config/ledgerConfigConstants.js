import b4a from 'b4a';
import { HASH_BYTE_LENGTH } from '../../utils/constants.js';

export const LEDGER_CONFIG_FORMAT_VERSION = 1;
export const LEDGER_CONFIG_COMMITMENT_SCHEME = 'binary-merkle-v1';
export const LEDGER_CONFIG_HASH_BYTES = HASH_BYTE_LENGTH;

export const MAX_LEDGER_CONFIG_ENTRIES = 1_024;
export const MAX_LEDGER_CONFIG_KEY_BYTES = 256;
export const MAX_LEDGER_CONFIG_VALUE_BYTES = 65_536;
export const MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES = 256;
export const MAX_LEDGER_CONFIG_SNAPSHOT_BYTES = 4 * 1_024 * 1_024;
export const MAX_LEDGER_CONFIG_OPERATION_BYTES = MAX_LEDGER_CONFIG_SNAPSHOT_BYTES + 4_096;

export const DEFAULT_LEDGER_CONFIG_LIMITS = Object.freeze({
    maxEntries: MAX_LEDGER_CONFIG_ENTRIES,
    maxKeyBytes: MAX_LEDGER_CONFIG_KEY_BYTES,
    maxValueBytes: MAX_LEDGER_CONFIG_VALUE_BYTES,
    maxSchemaIdBytes: MAX_LEDGER_CONFIG_SCHEMA_ID_BYTES,
    maxSnapshotBytes: MAX_LEDGER_CONFIG_SNAPSHOT_BYTES,
});

export const LEDGER_CONFIG_DOMAINS = Object.freeze({
    leaf: 'ledger-config/leaf/v1',
    node: 'ledger-config/node/v1',
    empty: 'ledger-config/empty/v1',
    id: 'ledger-config/id/v1',
    commit: 'ledger-config/commit/v1',
    content: 'ledger-config/content/v1',
});

export function createZeroCommitId() {
    return b4a.alloc(LEDGER_CONFIG_HASH_BYTES);
}
