import { test } from 'brittle';
import b4a from 'b4a';

import { setupStateNetwork } from '../../../testHelpers/StateNetworkFactory.js';
import {
	eventFlush,
	deriveIndexerSequenceState,
	seedBootstrapIndexer,
	defaultOpenHyperbeeView
} from '../../../testHelpers/autobaseTestHelpers.js';
import CompleteStateMessageOperations from '../../../../src/messages/completeStateMessages/CompleteStateMessageOperations.js';
import adminEntryUtils from '../../../../src/core/state/utils/adminEntry.js';
import nodeEntryUtils from '../../../../src/core/state/utils/nodeEntry.js';
import lengthEntryUtils from '../../../../src/core/state/utils/lengthEntry.js';
import addressUtils from '../../../../src/core/state/utils/address.js';
import { safeDecodeApplyOperation, safeEncodeApplyOperation } from '../../../../src/utils/protobuf/operationHelpers.js';
import { safeWriteUInt32BE } from '../../../../src/utils/buffer.js';
import {
	AUTOBASE_VALUE_ENCODING,
	EntryType,
	ADMIN_INITIAL_BALANCE,
	ADMIN_INITIAL_STAKED_BALANCE
} from '../../../../src/utils/constants.js';

async function setupAddAdminScenario(t) {
	const context = await setupStateNetwork({
		nodes: 2,
		valueEncoding: AUTOBASE_VALUE_ENCODING,
		open: defaultOpenHyperbeeView
	});
	seedBootstrapIndexer(context);
	t.teardown(async () => {
		await context.teardown();
	});
	return context;
}

test('State.apply addAdmin bootstraps admin node and metadata', async t => {
	const networkContext = await setupAddAdminScenario(t);
	const { bootstrap, nodes } = networkContext;
	const reader = nodes[1];
	
	const txValidity = await deriveIndexerSequenceState(bootstrap.base);
	const addAdminPayload = await CompleteStateMessageOperations.assembleAddAdminMessage(
		bootstrap.wallet,
		bootstrap.base.local.key,
		txValidity
	);

	await bootstrap.base.append(addAdminPayload);
	await bootstrap.base.update();
	await eventFlush();

	await assertAdminState(t, bootstrap.base, bootstrap.wallet, bootstrap.base.local.key, addAdminPayload);

	await networkContext.sync();
	await assertAdminState(t, reader.base, bootstrap.wallet, bootstrap.base.local.key, addAdminPayload);

	const readerNodeEntry = await reader.base.view.get(reader.wallet.address);
	t.is(readerNodeEntry, null, 'reader node remains without any role');
});

test('State.apply addAdmin rejects payloads that fail schema validation', async t => {
	const networkContext = await setupAddAdminScenario(t);
	const { bootstrap, nodes } = networkContext;
	const reader = nodes[1];

	const txValidity = await deriveIndexerSequenceState(bootstrap.base);
	const validPayload = await CompleteStateMessageOperations.assembleAddAdminMessage(
		bootstrap.wallet,
		bootstrap.base.local.key,
		txValidity
	);

	const decodedPayload = safeDecodeApplyOperation(validPayload);
	t.ok(decodedPayload, 'fixtures decode');

	decodedPayload.cao.tx = b4a.alloc(decodedPayload.cao.tx.length);
	const invalidPayload = safeEncodeApplyOperation(decodedPayload);
	t.ok(invalidPayload.length > 0, 'invalid payload still encodes');

	await bootstrap.base.append(invalidPayload);
	await bootstrap.base.update();
	await eventFlush();

	const adminEntryRecord = await bootstrap.base.view.get(EntryType.ADMIN);
	t.is(adminEntryRecord, null, 'admin entry remains absent');

	const initializationEntry = await bootstrap.base.view.get(EntryType.INITIALIZATION);
	t.is(initializationEntry, null, 'initialization flag not set');

	const writerRegistry = await bootstrap.base.view.get(
		EntryType.WRITER_ADDRESS + bootstrap.base.local.key.toString('hex')
	);
	t.is(writerRegistry, null, 'writer registry not created');

	await networkContext.sync();
	const readerAdminEntry = await reader.base.view.get(EntryType.ADMIN);
	t.is(readerAdminEntry, null, 'reader node never observes admin entry');
});

async function assertAdminState(t, base, wallet, writingKey, payload) {
	const adminEntryRecord = await base.view.get(EntryType.ADMIN);
	t.ok(adminEntryRecord, 'admin entry should exist');

	const decodedAdminEntry = adminEntryUtils.decode(adminEntryRecord.value);
	t.ok(decodedAdminEntry, 'admin entry decodes');
	t.is(decodedAdminEntry.address, wallet.address, 'admin entry stores wallet address');
	t.ok(b4a.equals(decodedAdminEntry.wk, writingKey), 'admin entry stores writing key');

	const nodeEntryRecord = await base.view.get(wallet.address);
	t.ok(nodeEntryRecord, 'node entry should exist for admin address');

	const nodeEntry = nodeEntryUtils.decode(nodeEntryRecord.value);
	t.ok(nodeEntry, 'node entry decodes');
	t.is(nodeEntry.isWriter, true, 'node entry flagged as writer');
	t.is(nodeEntry.isIndexer, true, 'node entry flagged as indexer');
	t.ok(b4a.equals(nodeEntry?.wk, writingKey), 'node entry writing key matches');
	t.ok(b4a.equals(nodeEntry?.balance, ADMIN_INITIAL_BALANCE), 'admin initial balance is set');
	t.ok(
		b4a.equals(nodeEntry?.stakedBalance, ADMIN_INITIAL_STAKED_BALANCE),
		'admin initial staked balance is set'
	);
	t.ok(
		b4a.equals(nodeEntry?.license, lengthEntryUtils.encodeBE(1)),
		'admin license id assigned'
	);

	const adminAddressBuffer = addressUtils.addressToBuffer(wallet.address);
	t.ok(adminAddressBuffer.length > 0, 'admin address encoded as buffer');
	const writerRegistry = await base.view.get(EntryType.WRITER_ADDRESS + writingKey.toString('hex'));
	t.ok(writerRegistry, 'writer registry entry exists');
	t.ok(
		b4a.equals(writerRegistry.value, adminAddressBuffer),
		'writer registry links writing key to admin'
	);

	const writersLengthEntry = await base.view.get(EntryType.WRITERS_LENGTH);
	t.ok(writersLengthEntry, 'writers length entry exists');
	const writersLength = lengthEntryUtils.decodeBE(writersLengthEntry.value);
	t.is(writersLength, 1, 'writers length increments to 1');

	const writerIndexEntry = await base.view.get(`${EntryType.WRITERS_INDEX}0`);
	t.ok(writerIndexEntry, 'writer index entry exists');
	t.is(
		writerIndexEntry.value.toString('ascii'),
		adminAddressBuffer.toString('ascii'),
		'writer index 0 stores admin address'
	);

	const licenseCountEntry = await base.view.get(EntryType.LICENSE_COUNT);
	t.ok(licenseCountEntry, 'license count entry exists');
	const licenseCount = lengthEntryUtils.decodeBE(licenseCountEntry.value);
	t.is(licenseCount, 1, 'license count increments to 1');

	const licenseIndexEntry = await base.view.get(`${EntryType.LICENSE_INDEX}1`);
	t.ok(licenseIndexEntry, 'license index entry exists');
	t.is(
		licenseIndexEntry.value.toString('ascii'),
		adminAddressBuffer.toString('ascii'),
		'license index 1 stores admin address'
	);

	const initializationEntry = await base.view.get(EntryType.INITIALIZATION);
	t.ok(initializationEntry, 'initialization entry exists');
	t.ok(
		b4a.equals(initializationEntry.value, safeWriteUInt32BE(1, 0)),
		'initialization flag set to 1'
	);

	const decodedOperation = safeDecodeApplyOperation(payload);
	t.ok(decodedOperation.cao.tx, 'operation decodes');
	const txKey = decodedOperation.cao.tx.toString('hex');
	const txEntry = await base.view.get(txKey);
	t.ok(txEntry, 'operation hash stored to prevent replays');
}
