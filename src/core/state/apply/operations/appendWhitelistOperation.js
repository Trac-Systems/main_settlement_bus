import b4a from 'b4a';
import {
    EntryType,
    OperationType,
} from '../../../../utils/constants.js';
import tracCryptoApi from 'trac-crypto-api';
import {
} from '../../../../codecs/apply/applyOperationCodec.js';
import {
    createMessage,
    ZERO_WK,
    NULL_BUFFER,
} from '../../../../utils/buffer.js';
import addressUtils from '../../utils/address.js';
import nodeEntryUtils from '../../utils/nodeEntry.js';
import adminEntryUtils from '../../utils/adminEntry.js';
import nodeRoleUtils from '../../utils/roles.js';
import {
    BALANCE_FEE,
    toBalance,
} from '../../utils/balance.js';
import { Status } from '../../utils/transaction.js';
import {
} from '../../../../codecs/consensus/v1/vdfConfigCodec.js';

class AppendWhitelistHandler {
    #repo;
    #config;
    #stateValidationSchema;

    constructor(repo, config, stateValidationSchema) {
        this.#repo = repo;
        this.#config = config;
        this.#stateValidationSchema = stateValidationSchema;
    }

    async performOperation(op, view, base, node, batch) {
        if (!this.#stateValidationSchema.validateAdminControlOperation(op)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Contract schema validation failed.", node.from.key)
            return Status.FAILURE;
        };

        // Validate the recipient address
        const adminAddressBuffer = op.address;
        const adminAddressString = addressUtils.bufferToAddress(adminAddressBuffer, this.#config.addressPrefix);
        if (adminAddressString === null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Recipient address is invalid.", node.from.key)
            return Status.FAILURE;
        };
        // Validate recipient public key
        const requesterAdminPublicKey = tracCryptoApi.address.decodeSafe(adminAddressString);
        if (b4a.equals(requesterAdminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode recipient public key.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve and decode the admin entry to verify the operation is initiated by an admin
        const adminEntry = await this.#repo.getEntry(EntryType.ADMIN, batch);
        if (adminEntry === null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify admin entry.", node.from.key)
            return Status.FAILURE;
        };

        const decodedAdminEntry = adminEntryUtils.decode(adminEntry, this.#config.addressPrefix);
        if (decodedAdminEntry === null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
            return Status.FAILURE;
        }

        if (!this.#repo.isAdmin(decodedAdminEntry, node)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Node is not allowed to perform this operation. (ADMIN ONLY)", node.from.key)
            return Status.FAILURE;
        };

        // Extract admin entry
        const adminAddress = decodedAdminEntry.address;
        const adminPublicKey = tracCryptoApi.address.decodeSafe(adminAddress);
        if (b4a.equals(adminPublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin public key.", node.from.key)
            return Status.FAILURE;
        };

        //admin consistency check
        if (!b4a.equals(adminPublicKey, requesterAdminPublicKey)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "System admin and node public keys do not match.", node.from.key)
            return Status.FAILURE;
        };

        // Extract and validate the network prefix from the node's address
        const nodeAddressBuffer = op.aco.ia;

        const nodeAddressString = addressUtils.bufferToAddress(nodeAddressBuffer, this.#config.addressPrefix);
        if (nodeAddressString === null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify node address.", node.from.key)
            return Status.FAILURE;
        };
        const nodePublicKey = tracCryptoApi.address.decodeSafe(nodeAddressString);
        if (b4a.equals(nodePublicKey, NULL_BUFFER)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode node public key.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const message = createMessage(
            this.#config.networkId,
            op.aco.txv,
            op.aco.ia,
            op.aco.in,
            OperationType.APPEND_WHITELIST
        );
        if (message.length === 0) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Invalid requester message.", node.from.key)
            return Status.FAILURE;
        };

        // verify signature
        const hash = await tracCryptoApi.hash.blake3Safe(message);
        if (!b4a.equals(hash, op.aco.tx)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Message hash does not match the tx_hash.", node.from.key)
            return Status.FAILURE;
        };

        const isMessageVerified = tracCryptoApi.signature.verify(op.aco.is, op.aco.tx, adminPublicKey);
        if (!isMessageVerified) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to verify message signature.", node.from.key)
            return Status.FAILURE;
        };

        const hashHexString = op.aco.tx.toString('hex');

        // verify tx validity - prevent deferred execution attack
        const indexersSequenceState = await this.#repo.getIndexerSequenceState(base);
        if (indexersSequenceState === null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Indexer sequence state is invalid.", node.from.key)
            return Status.FAILURE;
        };

        if (!b4a.equals(op.aco.txv, indexersSequenceState)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Transaction was not executed.", node.from.key)
            return Status.FAILURE;
        };

        // Check if the operation has already been applied
        const opEntry = await this.#repo.getEntry(hashHexString, batch);
        if (opEntry !== null) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Operation has already been applied.", node.from.key)
            return Status.FAILURE;
        };

        // Retrieve the node entry to check its current role
        const nodeEntry = await this.#repo.getEntry(nodeAddressString, batch);
        if (nodeEntryUtils.isWhitelisted(nodeEntry)) {
            this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Node already whitelisted.", node.from.key)
            return Status.FAILURE;
        }; // Node is already whitelisted

        if (await this.#repo.isInitalizationDisabled(batch)) {
            // Fee
            const adminNodeEntry = await this.#repo.getEntry(adminAddressString, batch);
            if (adminNodeEntry === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to validate admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const decodedNodeEntry = nodeEntryUtils.decode(adminNodeEntry)
            if (decodedNodeEntry === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode admin entry.", node.from.key)
                return Status.FAILURE;
            };

            const adminBalance = toBalance(decodedNodeEntry.balance)
            if (adminBalance === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Invalid admin balance.", node.from.key)
                return Status.FAILURE;
            };

            if (!adminBalance.greaterThanOrEquals(BALANCE_FEE)) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Insufficient admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const newAdminBalance = adminBalance.sub(BALANCE_FEE)

            if (newAdminBalance === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to apply fee to admin balance.", node.from.key)
                return Status.FAILURE;
            };
            const updatedAdminEntry = newAdminBalance.update(adminNodeEntry)

            if (updatedAdminEntry === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to update admin entry.", node.from.key)
                return Status.FAILURE;
            };

            await batch.put(adminAddressString, updatedAdminEntry);
        }

        if (!nodeEntry) {
            // If the node entry does not exist, create a new whitelisted node entry
            /*
                Dear reader,
                wk = 00000000000000000000000000000000 on ed25519 is point P.
                P = (19681161376707505956807079304988542015446066515923890162744021073123829784752,0).
                This point belongs to the curve but is not a valid point.
                Point P belongs to the torsion subgroup E(Fp)_TOR of the curve.

                Yes, you could theoretically (easily) forge a signature on this point.
                No, you don’t need to worry about it.

                Why? Because `wk` is only used as an identifier in our network:
                1. Trac pair of keys is higher in hierarchy.
                2. Our network leverages Libsodium, a robust cryptographic library that enforces stringent checks:
                    - Anyone attempting to create a node with such a key won't be able to participate in our network.
                    - If an attacker tries to use a small order key, signature
                    verification fails due to checks that reject such keys;
                    - The cofactor is always cleared when generating keys,
                    thanks to a process called clamping, which forces private keys
                    to lie in the prime-order subgroup by fixing certain bits.
                    This protects against attacks involving small-order points;
                3. Even if you are assigned this specific wk (the all-zero identifier), you can rest assured
                that you won't be able to perform any network actions with it. You can only directly participate
                in the network if you possess a valid wk. As an indirect user, this characteristic doesn't affect you.

            */
            // If node does not exist, then create a new licence. 
            const { newLicenseLength, decodedNewLicenseLength } = await this.#repo.assignNewLicense(batch);
            if (newLicenseLength !== null && decodedNewLicenseLength) {
                await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
            } else {
                // This log should (if this error ever happend) ALWAYS log.
                this.#repo.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
            }

            const initializedNodeEntry = nodeEntryUtils.init(ZERO_WK, nodeRoleUtils.NodeRole.WHITELISTED, nodeRoleUtils.ZERO_BALANCE, newLicenseLength);
            if (initializedNodeEntry.length === 0) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to initialize node entry.", node.from.key)
                return Status.FAILURE;
            }

            await batch.put(nodeAddressString, initializedNodeEntry);
            await batch.put(hashHexString, node.value);
        } else {
            // If the node entry exists, update its role to WHITELISTED. Case if account will buy license from market but it existed before - for example it had balance.
            // I assume since we dont have a marketplace now, that we by default assign a new license to any whitelisted node.

            const decodedNodeEntry = nodeEntryUtils.decode(nodeEntry);
            if (decodedNodeEntry === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to decode node entry.", node.from.key)
                return Status.FAILURE;
            };
            const editedNodeEntry = nodeEntryUtils.setRole(nodeEntry, nodeRoleUtils.NodeRole.WHITELISTED);

            if (editedNodeEntry === null) {
                this.#repo.safeLog(OperationType.APPEND_WHITELIST, "Failed to edit node entry.", node.from.key)
                return Status.FAILURE;
            }

            // Edge case: if the user license is not ZERO_LICENSE, then we do not assign a new license. 
            // This means the admin has decided to unban the node. 
            // This is important because if the admin mistakenly whitelists a node that already has a license, 
            // the previous license could be overwritten and lost permanently. 
            // Therefore, in this case we do not overwrite the license — we only change the role.
            if (!b4a.equals(decodedNodeEntry.license, nodeEntryUtils.ZERO_LICENSE)) {
                await batch.put(nodeAddressString, editedNodeEntry);

            } else {
                const { newLicenseLength, decodedNewLicenseLength } = await this.#repo.assignNewLicense(batch);
                if (newLicenseLength !== null && decodedNewLicenseLength) {
                    await batch.put(EntryType.LICENSE_COUNT, newLicenseLength)
                    await batch.put(EntryType.LICENSE_INDEX + decodedNewLicenseLength, nodeAddressBuffer)
                } else {
                    // This log should (if this error ever happend) ALWAYS log.
                    this.#repo.safeLog("SYSTEM ERROR", "Something went wrong while updating license index.", node.from.key)
                }

                const nodeEntryWithNewLicense = nodeEntryUtils.setLicense(editedNodeEntry, newLicenseLength)
                await batch.put(nodeAddressString, nodeEntryWithNewLicense);
            }

            await batch.put(hashHexString, node.value);
        }
        // Only whitelisted node will be able to become a writer/indexer.
        return Status.SUCCESS;
    }


}

export default AppendWhitelistHandler;
