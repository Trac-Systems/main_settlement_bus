/**
 * Lightweight factory for spinning up Autobase+State test networks.
 *
 * Each node gets:
 *  - a Corestore/Autobase pair created via test/testHelpers/autobaseTestHelpers
 *  - a PeerWallet (bootstrap uses the deterministic test mnemonic)
 *  - a State instance wired to the same bootstrap key so we can call State.apply directly
 *
 * Tests can grab `network.bootstrap` (the first node) plus the rest from `network.nodes`,
 * call `await network.sync()` to replicate, and `await network.teardown()` in their cleanup hook.
 */

import State from '../../src/core/state/State.js';
import {
	create,
	createStores,
	replicateAndSync,
	defaultOpenHyperbeeView,
	createWallet,
	seedIndexerList
} from './autobaseTestHelpers.js';
import {
	AUTOBASE_VALUE_ENCODING,
	ACK_INTERVAL
} from '../../src/utils/constants.js';
import { testKeyPair1 } from '../fixtures/apply.fixtures.js';

export class StateNetworkFactory {
	
	static async create(options = {}) {
		const factory = new StateNetworkFactory(options);
		await factory.#initialize();
		return factory;
	}

	#bootstrap = null;
	#nodes = [];
	#bases = [];
	#harness = createHarness();
	#options;

	constructor({
		nodes = 2,
		valueEncoding = AUTOBASE_VALUE_ENCODING,
		stateOptions = {},
		autobaseOptions = {},
		open = defaultOpenHyperbeeView,
		seedIndexers = true
	} = {}) {
		if (nodes < 1) throw new Error('StateNetworkFactory requires at least one node');
		this.#options = {
			nodes,
			valueEncoding,
			stateOptions,
			autobaseOptions,
			open,
			seedIndexers
		};
	}

	get bootstrap() {
		return this.#bootstrap;
	}

	get nodes() {
		return this.#nodes;
	}

	async sync() {
		await replicateAndSync(this.#bases);
	}

	async teardown() {
		await this.#harness.cleanup();
	}

	async #initialize() {
		const { nodes, valueEncoding, stateOptions, autobaseOptions, open, seedIndexers } = this.#options;

		const stateStores = await createStores(nodes, this.#harness);
		const { bases } = await create(nodes, this.#harness, {
			apply: async () => {},
			open,
			valueEncoding,
			ackInterval: ACK_INTERVAL,
			bigBatches: false,
			optimistic: false,
			...autobaseOptions
		});
		this.#bases = bases;

		await Promise.all(bases.map(base => base.ready()));

		const bootstrapKey = bases[0].local.key;
		const descriptors = [];

		for (let i = 0; i < nodes; i++) {
			const mnemonic = i === 0 ? testKeyPair1.mnemonic : null;
			const wallet = await createWallet(mnemonic);
			const state = new State(stateStores[i].session(), bootstrapKey, wallet, {
				enable_tx_apply_logs: false,
				enable_error_apply_logs: true,
				...stateOptions
			});

			bases[i]._handlers.apply = state.apply.bind(state);
			descriptors.push({
				index: i,
				name: bases[i].name,
				base: bases[i],
				state,
				wallet
			});
		}

		if (seedIndexers) {
			for (const descriptor of descriptors) {
				seedIndexerList(descriptor.base, [bootstrapKey]);
			}
		}

		this.#bootstrap = descriptors[0];
		this.#nodes = descriptors;
	}
}

export async function setupStateNetwork(options = {}) {
	return StateNetworkFactory.create(options);
}

function createHarness() {
	const teardowns = [];
	return {
		teardown(fn, { order = 0 } = {}) {
			teardowns.push({ fn, order });
		},
		async cleanup() {
			const sorted = teardowns.sort((a, b) => b.order - a.order);
			for (const { fn } of sorted) {
				try {
					await fn();
				} catch (err) {
					console.error('teardown failed', err);
				}
			}
		}
	};
}
