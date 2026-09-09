import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';

import { createMessage, isZeroBuffer, toHex, uint8ToBuffer } from '../../utils/buffer.js';
import {
    AMOUNT_BYTE_LENGTH,
    EPOCH_BYTE_LENGTH,
    HASH_BYTE_LENGTH,
    HTLC_LOCK_ID_BYTE_LENGTH,
    HTLC_MAX_SIGNERS,
    HTLC_PREIMAGE_BYTE_LENGTH,
    HTLC_THRESHOLD_BYTE_LENGTH,
    NONCE_BYTE_LENGTH,
    OperationType,
    PUBLIC_KEY_LENGTH,
    SIGNATURE_BYTE_LENGTH,
} from '../../utils/constants.js';
import { addressToBuffer, bufferToAddress } from '../../core/state/utils/address.js';
import { isAddressValid } from "../../core/state/utils/address.js";
import {
    isAdminControl,
    isBalanceInitialization,
    isHtlc,
    isBootstrapDeployment,
    isConsensusControl,
    isCoreAdmin,
    isRoleAccess,
    isSetEpoch,
    isTransaction,
    isTransfer,
    operationToPayload
} from '../../utils/applyOperations.js';
import { decodeConsensusConfig } from '../../codecs/apply/applyOperationCodec.js';
import { isHexString } from '../../utils/helpers.js';
import {
    createHtlcLockSigningMessage,
    verifyOrderedHtlcCosignerSignatures
} from '../../utils/htlcLock.js';

// Single use per transaction: reuse of this instance needs mutex/queue or fail-fast and can delay validation or break validation rule.
// A fresh instance is effectively zero-cost, so no reset() is provided.

/**
 * Builder for partial/complete ApplyState messages.
 * @param {IWallet} wallet
 * @param {Config} config
 */
class ApplyStateMessageBuilder {
    #address;
    #amount;
    #approvals;
    #built = false;
    #channel;
    #contentHash;
    #config;
    #consensusConfig;
    #encodedConsensusConfig;
    #externalBootstrap;
    #htlcLockId;
    #htlcPreimage;
    #incomingAddress;
    #incomingNonce;
    #incomingSignature;
    #incomingWriterKey;
    #htlcCosignerSignatures = [];
    #htlcClaimAddress;
    #htlcCounterpartyHash;
    #htlcFeeAmount;
    #htlcFeeRecipient;
    #htlcHashLock;
    #htlcPolicyHash;
    #htlcRefundAddress;
    #htlcRefundEpoch;
    #htlcSignerSet;
    #htlcThreshold;
    #msbBootstrap;
    #nonce;
    #operationType;
    #output;
    #payload;
    #payloadKey;
    #phase;
    #proofData;
    #txHash;
    #txValidity;
    #wallet;
    #writingKey;

    constructor(wallet, config) {
        this.#config = config;
        if (!wallet || typeof wallet !== 'object') {
            throw new Error('Wallet must be a valid wallet object');
        }
        if (!isAddressValid(wallet.address, this.#config.addressPrefix)) {
            throw new Error('Wallet should have a valid TRAC address.');
        }

        this.#wallet = wallet;
    }

    setPhase(phase) {
        if (!['partial', 'complete'].includes(phase)) {
            throw new Error(`Invalid phase: ${phase}`);
        }
        this.#phase = phase;
        return this;
    }

    setOutput(output) {
        if (!['json', 'buffer'].includes(output)) {
            throw new Error(`Invalid output format: ${output}`);
        }
        this.#output = output;
        return this;
    }

    setOperationType(operationType) {
        if (!Object.values(OperationType).includes(operationType)) {
            throw new Error(`Invalid operation type: ${operationType}`);
        }
        this.#operationType = operationType;
        return this;
    }

    setAddress(address) {
        const addressBuffer = this.#normalizeAddress(address);
        if (!addressBuffer) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${this.#config.addressLength}.`);
        }

        this.#address = addressBuffer;
        return this;
    }

    setWriterKey(writingKey) {
        this.#writingKey = this.#normalizeHexBuffer(writingKey, 32, 'Writer key');
        return this;
    }

    setTxHash(txHash) {
        this.#txHash = this.#normalizeHexBuffer(txHash, 32, 'Transaction hash');
        return this;
    }

    setIncomingAddress(address) {
        const addressBuffer = this.#normalizeAddress(address);
        if (!addressBuffer) {
            throw new Error(`Address field must be a valid TRAC bech32m address with length ${this.#config.addressLength}.`);
        }

        this.#incomingAddress = addressBuffer;
        return this;
    }

    setIncomingWriterKey(writerKey) {
        this.#incomingWriterKey = this.#normalizeHexBuffer(writerKey, 32, 'Incoming writer key');
        return this;
    }

    setIncomingNonce(nonce) {
        this.#incomingNonce = this.#normalizeHexBuffer(nonce, 32, 'Incoming nonce');
        return this;
    }

    setContentHash(contentHash) {
        this.#contentHash = this.#normalizeHexBuffer(contentHash, 32, 'Content hash');
        return this;
    }

    setIncomingSignature(signature) {
        this.#incomingSignature = this.#normalizeHexBuffer(signature, 64, 'Incoming signature');
        return this;
    }

    setExternalBootstrap(bootstrapKey) {
        this.#externalBootstrap = this.#normalizeHexBuffer(bootstrapKey, 32, 'Bootstrap key');
        return this;
    }

    setMsbBootstrap(msbBootstrap) {
        this.#msbBootstrap = this.#normalizeHexBuffer(msbBootstrap, 32, 'MSB bootstrap');
        return this;
    }

    setChannel(channel) {
        this.#channel = this.#normalizeHexBuffer(channel, 32, 'Channel');
        return this;
    }

    setTxValidity(txValidity) {
        this.#txValidity = this.#normalizeHexBuffer(txValidity, 32, 'Transaction validity');
        return this;
    }

    setHtlcLockId(lockId) {
        this.#htlcLockId = this.#normalizeHexBuffer(
            lockId,
            HTLC_LOCK_ID_BYTE_LENGTH,
            'HTLC lock ID'
        );
        return this;
    }

    setHtlcPreimage(preimage) {
        this.#htlcPreimage = this.#normalizeHexBuffer(
            preimage,
            HTLC_PREIMAGE_BYTE_LENGTH,
            'HTLC preimage'
        );
        return this;
    }

    setAmount(amount) {
        this.#amount = this.#normalizeHexBuffer(amount, AMOUNT_BYTE_LENGTH, 'Amount');
        return this;
    }

    setProofData(proofData) {
        this.#proofData = this.#normalizeBytesBuffer(proofData, 'Proof data');
        return this;
    }

    setNonce(nonce) {
        this.#nonce = this.#normalizeHexBuffer(nonce, NONCE_BYTE_LENGTH, 'Nonce');
        return this;
    }

    setHtlcClaimAddress(address) {
        const addressBuffer = this.#normalizeAddress(address);
        if (!addressBuffer) throw new Error('HTLC claim address must be a valid TRAC address.');
        this.#htlcClaimAddress = addressBuffer;
        return this;
    }

    setHtlcRefundAddress(address) {
        const addressBuffer = this.#normalizeAddress(address);
        if (!addressBuffer) throw new Error('HTLC refund address must be a valid TRAC address.');
        this.#htlcRefundAddress = addressBuffer;
        return this;
    }

    setHtlcFeeAmount(amount) {
        this.#htlcFeeAmount = this.#normalizeHexBuffer(amount, AMOUNT_BYTE_LENGTH, 'HTLC fee amount');
        return this;
    }

    setHtlcFeeRecipient(address) {
        if (address === undefined || address === null) {
            this.#htlcFeeRecipient = undefined;
            return this;
        }
        const addressBuffer = this.#normalizeAddress(address);
        if (!addressBuffer) throw new Error('HTLC fee recipient must be a valid TRAC address.');
        this.#htlcFeeRecipient = addressBuffer;
        return this;
    }

    setHtlcHashLock(hashLock) {
        this.#htlcHashLock = this.#normalizeHexBuffer(hashLock, HASH_BYTE_LENGTH, 'HTLC hashlock');
        return this;
    }

    setHtlcRefundEpoch(refundEpoch) {
        this.#htlcRefundEpoch = this.#normalizeHexBuffer(refundEpoch, EPOCH_BYTE_LENGTH, 'HTLC refund epoch');
        return this;
    }

    setHtlcCounterpartyHash(counterpartyHash) {
        this.#htlcCounterpartyHash = this.#normalizeHexBuffer(
            counterpartyHash,
            HASH_BYTE_LENGTH,
            'HTLC counterparty commitment'
        );
        return this;
    }

    setHtlcPolicyHash(policyHash) {
        if (policyHash === undefined || policyHash === null) {
            this.#htlcPolicyHash = undefined;
            return this;
        }
        this.#htlcPolicyHash = this.#normalizeHexBuffer(policyHash, HASH_BYTE_LENGTH, 'HTLC policy hash');
        return this;
    }

    setHtlcSignerSet(signerSet) {
        if (!Array.isArray(signerSet) || signerSet.length < 1 || signerSet.length > HTLC_MAX_SIGNERS) {
            throw new Error(`HTLC signer set must contain between 1 and ${HTLC_MAX_SIGNERS} public keys.`);
        }
        this.#htlcSignerSet = signerSet.map((signer, index) => {
            const publicKey = this.#normalizeHexBuffer(signer, PUBLIC_KEY_LENGTH, `HTLC signer ${index}`);
            if (isZeroBuffer(publicKey)) throw new Error(`HTLC signer ${index} must not be zero-filled.`);
            return publicKey;
        });
        return this;
    }

    setHtlcThreshold(threshold) {
        this.#htlcThreshold = Number.isInteger(threshold)
            ? uint8ToBuffer(threshold)
            : this.#normalizeHexBuffer(threshold, HTLC_THRESHOLD_BYTE_LENGTH, 'HTLC threshold');
        return this;
    }

    setHtlcCosignerSignatures(signatures = []) {
        if (!Array.isArray(signatures) || signatures.length > HTLC_MAX_SIGNERS - 1) {
            throw new Error(`HTLC cosigner signatures must be an array with at most ${HTLC_MAX_SIGNERS - 1} entries.`);
        }
        this.#htlcCosignerSignatures = signatures.map((signature, index) => this.#normalizeHexBuffer(
            signature,
            SIGNATURE_BYTE_LENGTH,
            `HTLC cosigner signature ${index}`
        ));
        return this;
    }

    setApprovals(approvals) {
        if (!Array.isArray(approvals)) {
            throw new Error('Approvals must be an array.');
        }

        this.#approvals = approvals.map((approval, index) => {
            return this.#normalizeBytesBuffer(approval, `Approval ${index}`);
        });
        return this;
    }

    setConsensusConfig(encodedConsensusConfig) {
        this.#consensusConfig = decodeConsensusConfig(encodedConsensusConfig);
        this.#encodedConsensusConfig = encodedConsensusConfig;
        return this;
    }

    #requireFields(fields) {
        for (const [value, name] of fields) {
            if (!value) {
                throw new Error(`${name} must be set before build.`);
            }
        }
    }

    async build() {
        this.#assertPhaseAndOutput();

        if (!this.#operationType) {
            throw new Error('Operation type must be set before build.');
        }

        if (!this.#address) {
            throw new Error('Address must be set before build.');
        }

        const payloadKey = operationToPayload(this.#operationType);
        if (!payloadKey) {
            throw new Error(`Unsupported operation type: ${this.#operationType}`);
        }

        let body;
        if (this.#phase === 'partial') {
            body = await this.#buildPartialBody();
        } else {
            body = await this.#buildCompleteBody();
        }

        this.#payloadKey = payloadKey;
        this.#payload = {
            type: this.#operationType,
            address: this.#address,
            [payloadKey]: body
        };
        this.#built = true;
        return this;
    }

    getPayload() {
        if (!this.#built || !this.#payload) {
            throw new Error('Payload has not been built.');
        }
        return this.#output === 'json' ? this.#encodePayloadJson(this.#payload) : this.#payload;
    }

    #assertPhaseAndOutput() {
        if (!this.#phase) {
            throw new Error('Phase must be set before build.');
        }

        if (!this.#output) {
            throw new Error('Output format must be set before build.');
        }

        // We assume that complete phase only supports buffer output. So this check will be enforced
        if (this.#phase === 'complete' && this.#output !== 'buffer') {
            throw new Error('Complete phase only supports buffer output.');
        }
    }

    #normalizeHexBuffer(value, expectedBytes, fieldName) {
        // with normalizer built in builder, we can remove other normalizers later.
        if (b4a.isBuffer(value)) {
            if (value.length !== expectedBytes) {
                throw new Error(`${fieldName} must be a ${expectedBytes}-byte buffer.`);
            }
            return value;
        }
        if (typeof value === 'string') {
            const expectedLength = expectedBytes * 2;
            if (!isHexString(value) || value.length !== expectedLength) {
                throw new Error(`${fieldName} must be a ${expectedLength}-length hexstring.`);
            }
            return b4a.from(value, 'hex');
        }
        throw new Error(`${fieldName} must be a ${expectedBytes}-byte buffer or ${expectedBytes * 2}-length hexstring.`);
    }

    #normalizeBytesBuffer(value, fieldName) {
        if (b4a.isBuffer(value)) {
            if (value.length === 0) {
                throw new Error(`${fieldName} must be a non-empty buffer.`);
            }
            return value;
        }

        if (typeof value === 'string') {
            if (!isHexString(value)) {
                throw new Error(`${fieldName} must be a non-empty hexstring.`);
            }
            return b4a.from(value, 'hex');
        }

        throw new Error(`${fieldName} must be a non-empty buffer or hexstring.`);
    }

    #normalizeAddress(address) {
        if (b4a.isBuffer(address)) {
            const addr = bufferToAddress(address, this.#config.addressPrefix);
            return addr ? address : null;
        }
        if (!isAddressValid(address, this.#config.addressPrefix)) {
            return null;
        }
        return addressToBuffer(address, this.#config.addressPrefix);
    }

    #getHtlcLockFields() {
        this.#requireFields([
            [this.#txValidity, 'Transaction validity'],
            [this.#htlcClaimAddress, 'HTLC claim address'],
            [this.#htlcRefundAddress, 'HTLC refund address'],
            [this.#amount, 'Amount'],
            [this.#htlcFeeAmount, 'HTLC fee amount'],
            [this.#htlcHashLock, 'HTLC hashlock'],
            [this.#htlcRefundEpoch, 'HTLC refund epoch'],
            [this.#htlcCounterpartyHash, 'HTLC counterparty commitment'],
            [this.#htlcSignerSet, 'HTLC signer set'],
            [this.#htlcThreshold, 'HTLC threshold']
        ]);

        const feeIsZero = this.#htlcFeeAmount.every(byte => byte === 0);
        if (feeIsZero && this.#htlcFeeRecipient) {
            throw new Error('HTLC fee recipient must be omitted when the fee amount is zero.');
        }
        if (!feeIsZero && !this.#htlcFeeRecipient) {
            throw new Error('HTLC fee recipient must be set when the fee amount is non-zero.');
        }

        const lockerAddress = bufferToAddress(this.#address, this.#config.addressPrefix);
        const lockerPublicKey = tracCryptoApi.address.decodeSafe(lockerAddress);
        if (!b4a.isBuffer(lockerPublicKey) || !b4a.equals(lockerPublicKey, this.#htlcSignerSet[0])) {
            throw new Error('HTLC signer zero must be the locker identified by the operation address.');
        }

        const signerKeys = new Set();
        for (let index = 0; index < this.#htlcSignerSet.length; index++) {
            const signerKey = toHex(this.#htlcSignerSet[index]);
            if (signerKeys.has(signerKey)) {
                throw new Error('HTLC signer set must not contain duplicate public keys.');
            }
            signerKeys.add(signerKey);

            if (index > 1 && b4a.compare(this.#htlcSignerSet[index - 1], this.#htlcSignerSet[index]) >= 0) {
                throw new Error('HTLC cosigner public keys must be sorted by raw bytes.');
            }
        }

        const threshold = this.#htlcThreshold.readUInt8(0);
        if (threshold < 1 || threshold > this.#htlcSignerSet.length) {
            throw new Error('HTLC threshold must be between one and the signer-set size.');
        }

        if (this.#htlcCosignerSignatures.length > this.#htlcSignerSet.length - 1) {
            throw new Error('HTLC cosigner signatures cannot outnumber the cosigner keys.');
        }

        if (1 + this.#htlcCosignerSignatures.length < threshold) {
            throw new Error('HTLC signatures do not satisfy the declared signature threshold.');
        }

        return {
            txv: this.#txValidity,
            ca: this.#htlcClaimAddress,
            ra: this.#htlcRefundAddress,
            am: this.#amount,
            fa: this.#htlcFeeAmount,
            ...(this.#htlcFeeRecipient && {fr: this.#htlcFeeRecipient}),
            hl: this.#htlcHashLock,
            re: this.#htlcRefundEpoch,
            cc: this.#htlcCounterpartyHash,
            ...(this.#htlcPolicyHash && {ph: this.#htlcPolicyHash}),
            ss: this.#htlcSignerSet,
            th: this.#htlcThreshold,
            cs: this.#htlcCosignerSignatures
        };
    }

    #validateHtlcLockSignatures(tx, lockerSignature) {
        if (!tracCryptoApi.signature.verify(lockerSignature, tx, this.#htlcSignerSet[0])) {
            throw new Error('HTLC locker signature is invalid.');
        }

        if (!verifyOrderedHtlcCosignerSignatures(this.#htlcCosignerSignatures, tx, this.#htlcSignerSet)) {
            throw new Error('HTLC cosigner signatures are invalid or not in signer-set order.');
        }
    }

    async #buildPartialBody() {
        if (!isRoleAccess(this.#operationType) && !isTransaction(this.#operationType) &&
            !isBootstrapDeployment(this.#operationType) && !isTransfer(this.#operationType) &&
            !isHtlc(this.#operationType)) {
            throw new Error(`Operation type ${this.#operationType} is not supported for partial build.`);
        }

        const nonce = this.#nonce ?? tracCryptoApi.nonce.generate();
        let msg;
        let htlcLockFields;

        switch (this.#operationType) {
            case OperationType.HTLC_LOCK:
                if (this.#htlcCosignerSignatures.length > 0 && !this.#nonce) {
                    throw new Error('HTLC nonce must be supplied when the lock includes cosigner signatures.');
                }
                htlcLockFields = this.#getHtlcLockFields();
                msg = createHtlcLockSigningMessage(
                    this.#config.networkId,
                    this.#address,
                    {...htlcLockFields, in: nonce}
                );
                break;
            case OperationType.HTLC_REFUND:
                return {};
            case OperationType.HTLC_CLAIM:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#htlcLockId, 'HTLC lock ID'],
                    [this.#htlcPreimage, 'HTLC preimage']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#htlcLockId,
                    this.#htlcPreimage,
                    nonce,
                    OperationType.HTLC_CLAIM
                );
                break;
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#writingKey, 'Writer key']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#writingKey,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#externalBootstrap, 'External bootstrap'],
                    [this.#channel, 'Channel']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#externalBootstrap,
                    this.#channel,
                    nonce,
                    OperationType.BOOTSTRAP_DEPLOYMENT
                );
                break;
            case OperationType.TX:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#writingKey, 'Writer key'],
                    [this.#contentHash, 'Content hash'],
                    [this.#externalBootstrap, 'External bootstrap'],
                    [this.#msbBootstrap, 'MSB bootstrap']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#writingKey,
                    this.#contentHash,
                    this.#externalBootstrap,
                    this.#msbBootstrap,
                    nonce,
                    OperationType.TX
                );
                break;
            case OperationType.TRANSFER:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingAddress, 'Incoming address'],
                    [this.#amount, 'Amount']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#incomingAddress,
                    this.#amount,
                    nonce,
                    OperationType.TRANSFER
                );
                break;

            default:
                throw new Error(`Unsupported operation type: ${this.#operationType}`);
        }

        const tx = await tracCryptoApi.hash.blake3(msg);
        const signature = this.#wallet.sign(tx);

        if (this.#operationType === OperationType.HTLC_LOCK) {
            this.#validateHtlcLockSignatures(tx, signature);
        }

        if (isBootstrapDeployment(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                bs: this.#externalBootstrap,
                ic: this.#channel,
                in: nonce,
                is: signature
            };
        }
        if (isRoleAccess(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                iw: this.#writingKey,
                in: nonce,
                is: signature
            };
        }
        if (isTransaction(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                iw: this.#writingKey,
                ch: this.#contentHash,
                bs: this.#externalBootstrap,
                mbs: this.#msbBootstrap,
                in: nonce,
                is: signature,
            };
        }
        if (isTransfer(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                to: this.#incomingAddress,
                am: this.#amount,
                in: nonce,
                is: signature
            };
        }
        if (this.#operationType === OperationType.HTLC_LOCK) {
            return {
                tx,
                ...htlcLockFields,
                in: nonce,
                is: signature
            };
        }
        if (this.#operationType === OperationType.HTLC_CLAIM) {
            return {
                tx,
                txv: this.#txValidity,
                li: this.#htlcLockId,
                pi: this.#htlcPreimage,
                in: nonce,
                is: signature
            };
        }

        throw new Error(`No corresponding value type for operation: ${this.#operationType}`);
    }

    async #buildCompleteBody() {
        if (isSetEpoch(this.#operationType)) {
            this.#requireFields([
                [this.#proofData, 'Proof data'],
                [this.#approvals, 'Approvals']
            ]);
            return {
                pd: this.#proofData,
                app: this.#approvals
            };
        }

        if (this.#operationType === OperationType.HTLC_CLAIM) {
            this.#requireFields([
                [this.#txHash, 'Transaction hash'],
                [this.#txValidity, 'Transaction validity'],
                [this.#htlcLockId, 'HTLC lock ID'],
                [this.#htlcPreimage, 'HTLC preimage'],
                [this.#incomingNonce, 'Incoming nonce'],
                [this.#incomingSignature, 'Incoming signature']
            ]);
            return {
                tx: this.#txHash,
                txv: this.#txValidity,
                li: this.#htlcLockId,
                pi: this.#htlcPreimage,
                in: this.#incomingNonce,
                is: this.#incomingSignature
            };
        }

        const nonce = tracCryptoApi.nonce.generate();
        let msg;
        let htlcLockFields;

        switch (this.#operationType) {
            case OperationType.HTLC_LOCK:
                this.#requireFields([
                    [this.#txHash, 'Transaction hash'],
                    [this.#incomingNonce, 'Incoming nonce'],
                    [this.#incomingSignature, 'Incoming signature']
                ]);
                htlcLockFields = this.#getHtlcLockFields();
                {
                    const incomingMessage = createHtlcLockSigningMessage(
                        this.#config.networkId,
                        this.#address,
                        {...htlcLockFields, in: this.#incomingNonce}
                    );
                    const incomingHash = await tracCryptoApi.hash.blake3(incomingMessage);
                    if (!b4a.equals(incomingHash, this.#txHash)) {
                        throw new Error('Regenerated HTLC lock transaction does not match the incoming hash.');
                    }
                    this.#validateHtlcLockSignatures(this.#txHash, this.#incomingSignature);
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.HTLC_REFUND:
                return {};
            case OperationType.ADD_ADMIN:
            case OperationType.DISABLE_INITIALIZATION:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#writingKey, 'Writer key']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#writingKey,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.BALANCE_INITIALIZATION:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingAddress, 'Incoming address'],
                    [this.#amount, 'Amount']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#incomingAddress,
                    this.#amount,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.APPEND_WHITELIST:
            case OperationType.ADD_INDEXER:
            case OperationType.REMOVE_INDEXER:
            case OperationType.BAN_VALIDATOR: {
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingAddress, 'Incoming address']
                ]);
                const incomingAddress = bufferToAddress(this.#incomingAddress, this.#config.addressPrefix);
                if (incomingAddress && this.#wallet.address === incomingAddress) {
                    throw new Error('Address must not be the same as the wallet address for basic operations.');
                }
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#incomingAddress,
                    nonce,
                    this.#operationType
                );
                break;
            }
            case OperationType.ADD_WRITER:
            case OperationType.REMOVE_WRITER:
            case OperationType.ADMIN_RECOVERY:
                this.#requireFields([
                    [this.#txHash, 'Transaction hash'],
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingWriterKey, 'Incoming writer key'],
                    [this.#incomingNonce, 'Incoming nonce'],
                    [this.#incomingSignature, 'Incoming signature']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.BOOTSTRAP_DEPLOYMENT:
                this.#requireFields([
                    [this.#txHash, 'Transaction hash'],
                    [this.#txValidity, 'Transaction validity'],
                    [this.#externalBootstrap, 'External bootstrap'],
                    [this.#channel, 'Channel'],
                    [this.#incomingNonce, 'Incoming nonce'],
                    [this.#incomingSignature, 'Incoming signature']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.TX:
                this.#requireFields([
                    [this.#txHash, 'Transaction hash'],
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingWriterKey, 'Incoming writer key'],
                    [this.#incomingNonce, 'Incoming nonce'],
                    [this.#incomingSignature, 'Incoming signature'],
                    [this.#contentHash, 'Content hash'],
                    [this.#externalBootstrap, 'External bootstrap'],
                    [this.#msbBootstrap, 'MSB bootstrap']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.TRANSFER:
                this.#requireFields([
                    [this.#txHash, 'Transaction hash'],
                    [this.#txValidity, 'Transaction validity'],
                    [this.#incomingAddress, 'Incoming address'],
                    [this.#amount, 'Amount'],
                    [this.#incomingNonce, 'Incoming nonce'],
                    [this.#incomingSignature, 'Incoming signature']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txHash,
                    nonce,
                    this.#operationType
                );
                break;
            case OperationType.SET_GENESIS_EPOCH:
            case OperationType.SET_CONSENSUS_CONFIG:
                this.#requireFields([
                    [this.#txValidity, 'Transaction validity'],
                    [this.#encodedConsensusConfig, 'Consensus config']
                ]);
                msg = createMessage(
                    this.#config.networkId,
                    this.#txValidity,
                    this.#encodedConsensusConfig,
                    nonce,
                    this.#operationType
                );
                break;
            default:
                throw new Error(`Unsupported operation type: ${this.#operationType}`);
        }

        const tx = await tracCryptoApi.hash.blake3(msg);
        const signature = this.#wallet.sign(tx);
        const validatorAddress = addressToBuffer(this.#wallet.address, this.#config.addressPrefix);

        if (isCoreAdmin(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                iw: this.#writingKey,
                in: nonce,
                is: signature
            };
        }
        if (isAdminControl(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                ia: this.#incomingAddress,
                in: nonce,
                is: signature
            };
        }
        if (isRoleAccess(this.#operationType)) {
            return {
                tx: this.#txHash,
                txv: this.#txValidity,
                iw: this.#incomingWriterKey,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: validatorAddress,
                vn: nonce,
                vs: signature,
            };
        }
        if (isTransaction(this.#operationType)) {
            return {
                tx: this.#txHash,
                txv: this.#txValidity,
                iw: this.#incomingWriterKey,
                ch: this.#contentHash,
                bs: this.#externalBootstrap,
                mbs: this.#msbBootstrap,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: validatorAddress,
                vn: nonce,
                vs: signature,
            };
        }
        if (isBootstrapDeployment(this.#operationType)) {
            return {
                tx: this.#txHash,
                txv: this.#txValidity,
                bs: this.#externalBootstrap,
                ic: this.#channel,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: validatorAddress,
                vn: nonce,
                vs: signature
            };
        }
        if (isTransfer(this.#operationType)) {
            return {
                tx: this.#txHash,
                txv: this.#txValidity,
                to: this.#incomingAddress,
                am: this.#amount,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: validatorAddress,
                vn: nonce,
                vs: signature
            };
        }
        if (this.#operationType === OperationType.HTLC_LOCK) {
            return {
                tx: this.#txHash,
                ...htlcLockFields,
                in: this.#incomingNonce,
                is: this.#incomingSignature,
                va: validatorAddress,
                vn: nonce,
                vs: signature
            };
        }
        if (isBalanceInitialization(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                ia: this.#incomingAddress,
                am: this.#amount,
                in: nonce,
                is: signature
            };
        }
        if (isConsensusControl(this.#operationType)) {
            return {
                tx,
                txv: this.#txValidity,
                cc: this.#consensusConfig,
                in: nonce,
                is: signature
            };
        }

        throw new Error(`No corresponding value type for operation: ${this.#operationType}`);
    }

    #encodePayloadJson(payload) {
        const address = bufferToAddress(payload.address, this.#config.addressPrefix);
        if (!address) {
            throw new Error('Payload address is invalid.');
        }

        const body = payload[this.#payloadKey];
        const base = { type: payload.type, address };

        switch (this.#payloadKey) {
            case 'rao':
                return {
                    ...base,
                    rao: {
                        tx: toHex(body.tx),
                        txv: toHex(body.txv),
                        iw: toHex(body.iw),
                        in: toHex(body.in),
                        is: toHex(body.is)
                    }
                };
            case 'txo':
                return {
                    ...base,
                    txo: {
                        tx: toHex(body.tx),
                        txv: toHex(body.txv),
                        iw: toHex(body.iw),
                        ch: toHex(body.ch),
                        bs: toHex(body.bs),
                        mbs: toHex(body.mbs),
                        in: toHex(body.in),
                        is: toHex(body.is)
                    }
                };
            case 'bdo':
                return {
                    ...base,
                    bdo: {
                        tx: toHex(body.tx),
                        txv: toHex(body.txv),
                        bs: toHex(body.bs),
                        ic: toHex(body.ic),
                        in: toHex(body.in),
                        is: toHex(body.is)
                    }
                };
            case 'tro':
                return {
                    ...base,
                    tro: {
                        tx: toHex(body.tx),
                        txv: toHex(body.txv),
                        to: bufferToAddress(body.to, this.#config.addressPrefix),
                        am: toHex(body.am),
                        in: toHex(body.in),
                        is: toHex(body.is)
                    }
                };
            case 'hlo': {
                const htlcLock = {
                    tx: toHex(body.tx),
                    txv: toHex(body.txv),
                    ca: bufferToAddress(body.ca, this.#config.addressPrefix),
                    ra: bufferToAddress(body.ra, this.#config.addressPrefix),
                    am: toHex(body.am),
                    fa: toHex(body.fa),
                    hl: toHex(body.hl),
                    re: toHex(body.re),
                    cc: toHex(body.cc),
                    ss: body.ss.map(toHex),
                    th: toHex(body.th),
                    cs: body.cs.map(toHex),
                    in: toHex(body.in),
                    is: toHex(body.is)
                };
                if (body.fr) htlcLock.fr = bufferToAddress(body.fr, this.#config.addressPrefix);
                if (body.ph) htlcLock.ph = toHex(body.ph);

                return {...base, hlo: htlcLock};
            }
            default:
                throw new Error(`JSON output is not supported for payload ${this.#payloadKey}.`);
        }
    }
}

export default ApplyStateMessageBuilder;
