import test from 'brittle';
import b4a from 'b4a';

import applyOperationsGenerated from '../../../../src/codecs/apply/applyOperations.generated.cjs';
import {
    isSetGenesisEpoch,
    isSetLedgerConfig,
    operationToPayload,
} from '../../../../src/utils/applyOperations.js';
import { OperationType } from '../../../../src/utils/constants.js';

const operations = applyOperationsGenerated.apply.operations;

test('apply operations expose only the Model B configuration operation', t => {
    t.is(OperationType.SET_LEDGER_CONFIG, 16);
    t.absent(OperationType.SET_VDF_PARAMS);
    t.absent(operations.OperationType.SET_VDF_PARAMS);
    t.absent(operations.SetVdfParamsOperation);
    t.ok(isSetLedgerConfig(OperationType.SET_LEDGER_CONFIG));
    t.is(operationToPayload(OperationType.SET_LEDGER_CONFIG), 'lco');
    t.ok(isSetGenesisEpoch(OperationType.SET_GENESIS_EPOCH));
    t.is(operationToPayload(OperationType.SET_GENESIS_EPOCH), 'sgo');
});

test('ledger config occupies oneof field 12 on the apply wire', t => {
    const encoded = b4a.from(operations.Operation.encode({
        type: OperationType.SET_LEDGER_CONFIG,
        lco: {},
    }).finish());

    t.alike([...encoded], [0x08, 0x10, 0x62, 0x00]);
});
