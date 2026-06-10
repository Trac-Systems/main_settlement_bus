import ReadyResource from "ready-resource";
import b4a from "b4a";
import Scheduler from "../../../utils/Scheduler.js";
import { OperationType } from "../../../utils/constants.js";
import { Logger } from "../../../utils/logger.js";
import { safeEncodeApplyOperation } from '../../../codecs/apply/applyOperationCodec.js';
import { addressToBuffer } from "../../state/utils/address.js";
import tracCryptoApi from "trac-crypto-api";
import { generateUUID } from '../../../utils/helpers.js';
import { consensusMessageFactory } from '../../../messages/consensus/v1/consensusMessageFactory.js';
import { createVDFService } from "./createVDFService.js";
import addressUtils from '../../state/utils/address.js';
import { CustomEventType } from '../../../utils/constants.js';
import { safeEncodeProofProposal, safeEncodeProofProposalApproval } from '../../../codecs/consensus/v1/consensusV1OperationCodec.js';
import { buildProofData } from '../../consensus/v1/handlers/epochProposal/epochProofData.js';

const PROTOCOL_VERSION = 1;
const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
]);

class EpochProofProposalService extends ReadyResource {
    #state;
    #wallet;
    #config;
    #intervalMs;
    #scheduler;
    #logger;
    #isInterrupted;
    #calculatorService;
    #connectionManager

    /**
   * @param {object} state
   * @param {object} connectionManager
   * @param {object} wallet
   * @param {object} config
   */
    constructor(state, connectionManager, wallet, config) {
        super();
        this.#state = state;
        this.#wallet = wallet;
        this.#config = config;
        this.#intervalMs = this.#config.epochInterval;
        this.#scheduler = null;
        this.#logger = new Logger(config);
        this.#isInterrupted = false;
        this.#connectionManager = connectionManager;
    }

    async _open() {
        this.#calculatorService = await createVDFService();
        await this.#calculatorService.ready()
        this.#scheduler = new Scheduler(
            (next) => this.#worker(next),
            this.#intervalMs,
        );

        this.#state.on(CustomEventType.EPOCH_CREATED, async () => {
            const isAdmin = await this.#state.isAdmin();
            if (this.#state.isIndexer() && !isAdmin) {
                
            }
        });
    }

    async _close() {
        this.#isInterrupted = true;
        await this.#scheduler.stop(true);
        await this.#calculatorService?.close();
    }

    start() {
        if (this.#scheduler.isRunning) {
            return false;
        }

        this.#ensureScheduler();
        return true;
    }

    async stop(waitForCurrent = true) {
        if (!this.#scheduler.isRunning) {
            return false;
        }

        this.#isInterrupted = true;
        await this.#scheduler.stop(waitForCurrent);
        return true;
    }

    #ensureScheduler() {
        if (this.#scheduler.isRunning) return;

        this.#isInterrupted = false;
        this.#scheduler.start(this.#intervalMs);
        this.#logger.debug(`scheduler started with intervalMs ${this.#intervalMs}`);
    }

    async calculateVDF(challenge, difficulty, discriminantSizeBits) {
        return await this.#calculatorService.calculateVDF(challenge, difficulty, discriminantSizeBits);
    }

    createProposal(lastEpochId, lastEpochHash, vdf) {
        const currentEpochId = lastEpochId + 1;
        return buildProofData({
            protocolVersion: PROTOCOL_VERSION,
            epoch: currentEpochId,
            prevEpochHash: lastEpochHash,
            networkId: this.#config.networkId,
            proposer: this.#wallet.address,
            vdfParamsHash: vdf.solution.slice(0, 258), // y — the first 258 bytes
            vdfOutput: vdf.solution.slice(258), // proof — the last 258 bytes  
        });
    }

    async verifySignature(signature, hash, publicKey) {
        try {
            return tracCryptoApi.signature.verify(signature, hash, publicKey);
        } catch {
            return false;
        }
    }

    async sendToIndexer(member, proofProposal) {
        const connection = this.#connectionManager.getConnection(member.key);
        if (!connection) return null;

        const request = await consensusMessageFactory(this.#wallet, this.#config)
            .buildProofProposal(generateUUID(), this.#config.networkId, proofProposal.epoch, proofProposal.prevEpochHash, proofProposal.proposer, proofProposal.vdfParamsHash, proofProposal.vdfProof);

        const response = await connection.protocolSession.send(request);
        return response?.result?.signature ?? null;
    }

    async #collectSignature(member, proofProposal) {
        const key = b4a.toString(member.key, "hex");
        const addressBuffer = await this.#state.getRegisteredWriterKey(key);
        if (!addressBuffer) return null;

        const address = addressUtils.bufferToAddress(addressBuffer, this.#config.addressPrefix);
        if (!address) return null;

        // I'm the leader now and I want to exclude myself from the list
        if (address === this.#wallet.address) return null;
        const memberSignature = await this.sendToIndexer(member, proofProposal);
        if (!memberSignature) return null;

        const isValidSignature = await this.verifySignature(memberSignature, proofProposal.dataHash, member.key);
        if (!isValidSignature) return null;

        return { signature: memberSignature, publicKey: member.key };
    }

    async #worker(next) {
        if (!this.#isInterrupted) {
            const threshold = this.#config.epochThreshold;
            const epochIdBefore = await this.#state.currentEpochId();
            const currentEpochHash = await this.#state.getEpochHash(epochIdBefore);

            const vdf = await this.calculateVDF(
                currentEpochHash,
                this.#config.vdfDifficulty,
                this.#config.vdfDiscriminantSizeBits
            );

            const newEpochProofData = this.createProposal(
                epochIdBefore,
                currentEpochHash,
                vdf.result,
            );
            const proofProposal = await newEpochProofData.toProposalMessage(this.#wallet)

            const approvers = await this.#state.getIndexersEntry();
            const tasks = approvers.map(member =>
                withTimeout(this.#collectSignature(member, proofProposal), this.#config.epochSignatureTimeout)
            );

            const results = await Promise.allSettled(tasks);
            const signatures = results
                .filter(r => r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value)
                .slice(0, threshold);

            if (signatures.length >= threshold) {
                const epoch = {
                    ...proofProposal,
                    signatures: signatures,
                };

                await this.#appendEpoch(epoch);
            }
        }

        next(this.#intervalMs);
    }

    async #appendEpoch(epoch) {
        const payload = {
            type: OperationType.SET_EPOCH,
            address: addressToBuffer(
                this.#wallet.address,
                this.#config.addressPrefix,
            ),
            seo: {
                pd: safeEncodeProofProposal({
                    protocol_version: epoch.data.protocolVersion,
                    network_id: epoch.data.networkId,
                    epoch: epoch.data.epoch,
                    previous_epoch_record_hash: epoch.data.prevEpochHash,
                    proposer: this.#state.writingKey,
                    vdf_parameters_hash: epoch.data.vdfParamsHash,
                    vdf_proof: epoch.data.vdfOutput,
                    signature: epoch.signature,
                }),
                app: epoch.signatures.map(({ signature, publicKey}) =>
                    safeEncodeProofProposalApproval({
                        approval_sig: signature,
                        member_id: b4a.isBuffer(publicKey) ? publicKey : b4a.from(publicKey, 'hex'),
                    })
                )
            },
        };

        const encodedPayload = safeEncodeApplyOperation(payload);
        if (!b4a.isBuffer(encodedPayload) || encodedPayload.length === 0) {
            throw new Error(
                `Failed to encode epoch operation for epoch ${epoch.data.epoch}.`,
            );
        }

        await this.#state.append(encodedPayload);
    }
}

export default EpochProofProposalService;
