import { TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';
import b4a from 'b4a';

import { addressToBuffer } from '../../src/core/state/utils/address.js';
import {
	HASH_BYTE_LENGTH,
	SIGNATURE_BYTE_LENGTH,
	WRITER_BYTE_LENGTH,
	BOOTSTRAP_BYTE_LENGTH,
	NONCE_BYTE_LENGTH,
	OperationType,
} from '../../src/utils/constants.js';

export const BDO = {
    valid_partial_bootstrap_deployment: {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1cep6jwcf02vmwekr4s0sttraqv736v8nf2gkaejz2203zhf7j7csnf44nm"),
        bdo: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
        }
    },

    valid_complete_bootstrap_deployment: {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1cep6jwcf02vmwekr4s0sttraqv736v8nf2gkaejz2203zhf7j7csnf44nm"),
        bdo: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        }
    },

    top_fields_bootstrap_deployment: ['type', 'address', 'bdo'],
    complete_bootstrap_deployment_value_fields: ['tx', 'txv', 'bs', 'in', 'is', 'vn', 'vs', 'va'],
    partial_bootstrap_deployment_value_fields: ['tx','txv', 'bs', 'in', 'is'],
    required_length_of_fields_for_complete_bootstrap_deployment: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        bs: BOOTSTRAP_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
        vn: NONCE_BYTE_LENGTH,
        vs: SIGNATURE_BYTE_LENGTH,
        va: TRAC_ADDRESS_SIZE
    },
    required_length_of_fields_for_partial_bootstrap_deployment: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        bs: BOOTSTRAP_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
    }
}

export const TXO = {
    valid_complete_transaction_operation: {
        type: OperationType.TX,
        address: addressToBuffer('trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'),
        txo: {
            tx: b4a.from('6fb7f6e7f6970477977080f2b46cc837d48605e67691d30bf7511a1417d17ed7', 'hex'),
            txv: b4a.from('6fb7f6e7f6970477977080f2b46cc837d48605e67691d30bf7511a1417d17ed7', 'hex'),
            iw: b4a.from('79ef7be837aa9fd8a446a120e1bc1e6bdd99fb5393dc4fa8299d9d5043a7cd98', 'hex'),
            in: b4a.from('8bcef53a043f42ac7c17344f0c0d56af5b335e412d4042124f27733911169e4f', 'hex'),
            ch: b4a.from('6ee7b29ce494875c1ea0dc0f9c2997d1aeeb8d21c67809950e145822989c8b2e', 'hex'),
            is: b4a.from('d8626ea0552bf302921de3536e877796ef131368c9854119660c9c77a4196d4735d60bb87c6a89bbff7d5f8d72a70610d6ee73d62bc5144874cdf23f88e28a05', 'hex'),
            bs: b4a.from('f68bac445eee3d9276be46aef58328a543e4b7ecc2b5c98c387c1b3ca1a7e85d', 'hex'),
            mbs: b4a.from('5f3b9a6a516066de365e5e75a7ac0feb55ab7cd4a29facbb028a047fc3f3956e', 'hex'),
            vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        }
    },
    valid_partial_transaction_operation: {
        type: OperationType.TX,
        address: addressToBuffer('trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'),
        txo: {
            tx: b4a.from('6fb7f6e7f6970477977080f2b46cc837d48605e67691d30bf7511a1417d17ed7', 'hex'),
            txv: b4a.from('6fb7f6e7f6970477977080f2b46cc837d48605e67691d30bf7511a1417d17ed7', 'hex'),
            iw: b4a.from('79ef7be837aa9fd8a446a120e1bc1e6bdd99fb5393dc4fa8299d9d5043a7cd98', 'hex'),
            in: b4a.from('8bcef53a043f42ac7c17344f0c0d56af5b335e412d4042124f27733911169e4f', 'hex'),
            ch: b4a.from('6ee7b29ce494875c1ea0dc0f9c2997d1aeeb8d21c67809950e145822989c8b2e', 'hex'),
            is: b4a.from('d8626ea0552bf302921de3536e877796ef131368c9854119660c9c77a4196d4735d60bb87c6a89bbff7d5f8d72a70610d6ee73d62bc5144874cdf23f88e28a05', 'hex'),
            bs: b4a.from('f68bac445eee3d9276be46aef58328a543e4b7ecc2b5c98c387c1b3ca1a7e85d', 'hex'),
            mbs: b4a.from('5f3b9a6a516066de365e5e75a7ac0feb55ab7cd4a29facbb028a047fc3f3956e', 'hex'),

        }
    },
    top_fields_transaction_operation: ['type', 'address', 'txo'],
    complete_transaction_operation_value_fields: ['tx', 'txv', 'iw', 'in', 'ch', 'is', 'bs', 'mbs', 'vs', 'vn'],
    partial_transaction_operation_value_fields: ['tx', 'txv', 'iw', 'in', 'ch', 'is', 'bs', 'mbs'],
    required_length_of_fields_for_complete_transaction_operation: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        iw: WRITER_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        ch: HASH_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
        bs: BOOTSTRAP_BYTE_LENGTH,
        mbs: BOOTSTRAP_BYTE_LENGTH,
        vn: NONCE_BYTE_LENGTH,
        vs: SIGNATURE_BYTE_LENGTH,
        va: TRAC_ADDRESS_SIZE

    },
    required_length_of_fields_for_partial_transaction_operation: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        iw: WRITER_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        ch: HASH_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
        bs: BOOTSTRAP_BYTE_LENGTH,
        mbs: BOOTSTRAP_BYTE_LENGTH,
    }

}

export const CAO = {
    validAddAdminOperation: {
        type: OperationType.ADD_ADMIN,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        cao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },
    topFieldsCoreAdmin: ['type', 'address', 'cao'],
    coreAdminOperationValuesFields: ['tx', 'txv', 'iw', 'in', 'is'],
    requiredLengthOfFieldsForCoreAdmin: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        iw: WRITER_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH
    }
};

export const ACO = {
    validAppendWhitelistOperation: {
        type: OperationType.APPEND_WHITELIST,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        aco: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            ia: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },

    validAddIndexerOperation: {
        type: OperationType.ADD_INDEXER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        aco: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            ia: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },

    validRemoveIndexerOperation: {
        type: OperationType.REMOVE_INDEXER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        aco: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            ia: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },

    validBanValidatorOperation: {
        type: OperationType.BAN_VALIDATOR,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        aco: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            ia: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },

    topFieldsAdminControl: ['type', 'address', 'aco'],
    adminControlValueFields: ['tx', 'txv', 'in', 'ia', 'is'],
    requiredLengthOfFieldsForAdminControl: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        ia: TRAC_ADDRESS_SIZE,
        is: SIGNATURE_BYTE_LENGTH
    }
};

export const RAO = {
    valid_complete_add_writer: {
        type: OperationType.ADD_WRITER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            vn: b4a.from('9027192c6de13b683bc0c0fbcfe09c4e55d47c12c46b122d988f06c282a4be5e', 'hex'),
            vs: b4a.from('8fb8a3ba30e00c347bca5a8554c47e167f63b248c87e1ea5532eebbad1bc036184fe8872ff65a9e63acfee68d2213a187466c13ff6687d3ab57e5209abd4fb01', 'hex')
        }
    },
    valid_partial_add_writer: {
        type: OperationType.ADD_WRITER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')

        }
    },

    valid_complete_remove_writer: {
        type: OperationType.REMOVE_WRITER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            vn: b4a.from('9027192c6de13b683bc0c0fbcfe09c4e55d47c12c46b122d988f06c282a4be5e', 'hex'),
            vs: b4a.from('8fb8a3ba30e00c347bca5a8554c47e167f63b248c87e1ea5532eebbad1bc036184fe8872ff65a9e63acfee68d2213a187466c13ff6687d3ab57e5209abd4fb01', 'hex')
        }
    },
    valid_partial_remove_writer: {
        type: OperationType.REMOVE_WRITER,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },
    valid_complete_admin_recovery: {
        type: OperationType.ADMIN_RECOVERY,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
            vn: b4a.from('9027192c6de13b683bc0c0fbcfe09c4e55d47c12c46b122d988f06c282a4be5e', 'hex'),
            vs: b4a.from('8fb8a3ba30e00c347bca5a8554c47e167f63b248c87e1ea5532eebbad1bc036184fe8872ff65a9e63acfee68d2213a187466c13ff6687d3ab57e5209abd4fb01', 'hex')
        }
    },
    valid_partial_admin_recovery: {
        type: OperationType.ADMIN_RECOVERY,
        address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        rao: {
            tx: b4a.from('1bd4f96adeffba9c04943a82993c5b19660c3a5f572620d82a67464f381640e2', 'hex'),
            txv: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            iw: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex')
        }
    },

    top_fields_role_access: ['type', 'address', 'rao'],
    complete_role_access_value_fields: ['tx', 'txv', 'iw', 'in', 'is', 'va', 'vn', 'vs'],
    partial_role_access_value_fields: ['tx', 'txv', 'iw', 'in', 'is'],
    required_length_of_fields_for_complete_role_access: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        iw: WRITER_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
        va: TRAC_ADDRESS_SIZE,
        vn: NONCE_BYTE_LENGTH,
        vs: SIGNATURE_BYTE_LENGTH
    },
    required_length_of_fields_for_partial_role_access: {
        tx: HASH_BYTE_LENGTH,
        txv: HASH_BYTE_LENGTH,
        iw: WRITER_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
    }


};

export const partial_operation_value_type = ['bdo', 'tto', 'txo', 'rao']

export const not_allowed_data_types = [
    997,
    true,
    null,
    undefined,
    Infinity,
    {},
    [],
    () => { },
    "string",
    BigInt(997),
    new Date(),
    NaN,
    new Map(),
    new Set(),
    /abc/,
    new Error('fail'),
    Promise.resolve(),
    new Uint8Array([1,2,3]),
    new Float32Array([1.1, 2.2]),
    b4a.alloc(10)
];
