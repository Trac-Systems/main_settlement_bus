import { TRAC_ADDRESS_SIZE } from 'trac-wallet/constants.js';
import b4a from 'b4a';

import { addressToBuffer } from '../../src/core/state/utils/address.js';
import {
	TX_HASH_HEXSTRING_LENGTH,
	WRITING_KEY_HEXSTRING_LENGTH,
	NONCE_HEXSTRING_LENGTH,
	CONTENT_HASH_HEXSTRING_LENGTH,
	SIGNATURE_HEXSTRING_LENGTH,
	BOOTSTRAP_HEXSTRING_LENGTH,

	HASH_BYTE_LENGTH,
	SIGNATURE_BYTE_LENGTH,
	WRITER_BYTE_LENGTH,
	BOOTSTRAP_BYTE_LENGTH,
	NONCE_BYTE_LENGTH,
	OperationType,
} from '../../src/utils/constants.js';

export const BSD = {
    valid_bootstrap_deployment: {
        type: OperationType.BOOTSTRAP_DEPLOYMENT,
        address: addressToBuffer("trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud"),
        bdo: {
            bs: b4a.from('f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414', 'hex'),
            in: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            is: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            vn: b4a.from('0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645', 'hex'),
            vs: b4a.from('5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08', 'hex'),
            va: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
        }
    },
    topFieldsBootstrapDeployment: ['type', 'address', 'bdo'],
    bootstrapDeploymentValueFields: ['bs', 'in', 'is', 'vn', 'vs', 'va'],
    requiredLengthOfFieldsForBootstrapDeployment: {
        bs: BOOTSTRAP_BYTE_LENGTH,
        in: NONCE_BYTE_LENGTH,
        is: SIGNATURE_BYTE_LENGTH,
        vn: NONCE_BYTE_LENGTH,
        vs: SIGNATURE_BYTE_LENGTH,
        va: TRAC_ADDRESS_SIZE
    }
}

export const PRETX = {

	validPreTx: {
		op: OperationType.PRE_TX,
		tx: '7c46f7ae33db16a6db4e48260ea1c87e391b4013fa00ac6294a297c2fad81442',
		ia: 'trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud',
		iw: '79ef7be837aa9fd8a446a120e1bc1e6bdd99fb5393dc4fa8299d9d5043a7cd98',
		in: '0ad7fe36a35a27ea4df932b800200823a97d4db31bca247f43ad7523b0493645',
		ch: 'de3aebb7882655bf00d6da27b1be17f98ea8c0a1b145d20acc9e7c3a5ff89815',
		is: '5b534be7a374148962c271d194c26cf5b1ad705ab218a87709a33fe74f9d1b811772447c939b17b2f803e3da7648f49b666b929fbb20e458ced952f147162c08',
		bs: 'f24e61cf7941256b080be2133bccb520414c78021215edfcb781622da526c414',
		mbs: '5f3b9a6a516066de365e5e75a7ac0feb55ab7cd4a29facbb028a047fc3f3956e',
		va: 'trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'
	},

	requiredLengthOfFieldsForPreTx: {
		tx: TX_HASH_HEXSTRING_LENGTH,
		ia: TRAC_ADDRESS_SIZE,
		iw: WRITING_KEY_HEXSTRING_LENGTH,
		in: NONCE_HEXSTRING_LENGTH,
		ch: CONTENT_HASH_HEXSTRING_LENGTH,
		is: SIGNATURE_HEXSTRING_LENGTH,
		bs: BOOTSTRAP_HEXSTRING_LENGTH,
		mbs: BOOTSTRAP_HEXSTRING_LENGTH,
		va: TRAC_ADDRESS_SIZE
	},

	preTxfields: ['op', 'tx', 'ia', 'iw', 'in', 'ch', 'is', 'bs', 'mbs', 'va']
};

export const TXO = {
	validPostTx: {
		type: OperationType.TX,
		address: addressToBuffer('trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'),
		txo: {
			tx: b4a.from('6fb7f6e7f6970477977080f2b46cc837d48605e67691d30bf7511a1417d17ed7', 'hex'),
			ia: addressToBuffer('trac1lj5ccpygyelu266enxjr2m0hkf2p5nkr4ua2gq9a2pj6ewq54p9qkydxud'),
			iw: b4a.from('79ef7be837aa9fd8a446a120e1bc1e6bdd99fb5393dc4fa8299d9d5043a7cd98', 'hex'),
			in: b4a.from('8bcef53a043f42ac7c17344f0c0d56af5b335e412d4042124f27733911169e4f', 'hex'),
			ch: b4a.from('6ee7b29ce494875c1ea0dc0f9c2997d1aeeb8d21c67809950e145822989c8b2e', 'hex'),
			is: b4a.from('d8626ea0552bf302921de3536e877796ef131368c9854119660c9c77a4196d4735d60bb87c6a89bbff7d5f8d72a70610d6ee73d62bc5144874cdf23f88e28a05', 'hex'),
			bs: b4a.from('f68bac445eee3d9276be46aef58328a543e4b7ecc2b5c98c387c1b3ca1a7e85d', 'hex'),
			mbs: b4a.from('5f3b9a6a516066de365e5e75a7ac0feb55ab7cd4a29facbb028a047fc3f3956e', 'hex'),
			vs: b4a.from('6ffd5bed879b2edc5ee2108e7ac9c530744dd82775c6369f307dc88aadd07ce5be28fc2fb97b4f793b1bf81d7903bcbe301299ddfb51316d41c70e23d97e4a0d', 'hex'),
			vn: b4a.from('aa48f5384851cfd58da1b90fb9a444cc4e1bd57659c8b041ad573ebe3c382927', 'hex'),
		}
	},
	topFieldsTx: ['type', 'address', 'txo'],
	postTxValueFields: ['tx', 'ia', 'iw', 'in', 'ch', 'is', 'bs', 'mbs', 'vs', 'vn'],
	requiredLengthOfFieldsForPostTx: {
		tx: HASH_BYTE_LENGTH,
		ia: TRAC_ADDRESS_SIZE,
		iw: WRITER_BYTE_LENGTH,
		in: NONCE_BYTE_LENGTH,
		ch: HASH_BYTE_LENGTH,
		is: SIGNATURE_BYTE_LENGTH,
		bs: BOOTSTRAP_BYTE_LENGTH,
		mbs: BOOTSTRAP_BYTE_LENGTH,
		vs: SIGNATURE_BYTE_LENGTH,
		vn: NONCE_BYTE_LENGTH
	}
}

export const BKO = {
	validAddIndexer: {
		type: OperationType.ADD_INDEXER,
		address: addressToBuffer('trac1jnafrn8xl3c59s4ml6jusufp2vzm6egkyenrcqvd907j8c9v5j2qnx7wvt'),
		bko: {
			nonce: b4a.from('a57e57fdda484270d0bed52da04b52ba5bdeb5bc5c0151951d23771e4a8c2e69', 'hex'),
			sig: b4a.from('65521e25d52ec95c5226f9d4d23604d0805792d8007f0e2f29c1ea3cb4a9725720182267d17463e9d22da073fc0328bd334310ae29505df8ccb3171dc0399d0d', 'hex'),
		}
	},
	validRemoveIndexer: {
		type: OperationType.REMOVE_INDEXER,
		address: addressToBuffer('trac1jnafrn8xl3c59s4ml6jusufp2vzm6egkyenrcqvd907j8c9v5j2qnx7wvt'),
		bko: {
			nonce: b4a.from('0c5e531de4cc43145bffbd0758e54d41a41049520d7ced7d40b19e94fa0cc5bc', 'hex'),
			sig: b4a.from('70283bccce64b03d55840200fe70561cd2f1744fd3a5425c116ebae4b53845c4d510a5e48bcedc4cb7919caf0f77541e694d19a6df8e9419dbb58d840f376d0b', 'hex'),
		}
	},
	validAppendWhitelist: {
		type: OperationType.APPEND_WHITELIST,
		address: addressToBuffer('trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'),
		bko: {
			nonce: b4a.from('775899a44de60dc63b4e8427c72cf0c18cdd9c602aa01300e84f6a9a195771a5', 'hex'),
			sig: b4a.from('552dcde06d3e7096b91dd254f1ba39bfa38e8821896ee6eabcc70e827a1b95d9378657fa1a6fded98a5a97fffdbc6c2f4eef6caf00d3ad3c4557369aab4fd20b', 'hex'),
		}
	},
	validBanValidator: {
		type: OperationType.BAN_VALIDATOR,
		address: addressToBuffer('trac1c232xtkvyg08zyeurn7l0wrarc4y36fzq5vhcdsgkxe6hdpzuslsm63dw8'),
		bko: {
			nonce: b4a.from('b83421a0d1869a59726a81849f4668c0a7b7042e5917887556f192244d7b3c92', 'hex'),
			sig: b4a.from('902e4f4d17cf168f4842e2a6dc86058842a4825d2cd698a7e096763d7dbd1cb6c1e8f3f43e4ae99e8594fd5808f6e802cd370b16b330da677b8ec252a96f990d', 'hex'),
		}
	},
	topFieldsBko: ['type', 'address', 'bko'],
	basicKeyOpValueFields: ['nonce', 'sig'],
	requiredLengthOfFieldsForBasicKeyOp: {
		nonce: NONCE_BYTE_LENGTH,
		sig: SIGNATURE_BYTE_LENGTH,
	}

}

export const EKO = {
	validAddAdmin: {
		type: OperationType.ADD_ADMIN,
		address: addressToBuffer('trac18qq7h503y3326v6msgvq0jwc0e8jp4t4q53z9p9jvd98arj7mtpqfac04p'),
		eko: {
			wk: b4a.from('71c53657a8738b48772f0940398d4f4b01dc56cb32cd2fd84c30359f0cbb08f1', 'hex'),
			nonce: b4a.from('9027192c6de13b683bc0c0fbcfe09c4e55d47c12c46b122d988f06c282a4be5e', 'hex'),
			sig: b4a.from('8fb8a3ba30e00c347bca5a8554c47e167f63b248c87e1ea5532eebbad1bc036184fe8872ff65a9e63acfee68d2213a187466c13ff6687d3ab57e5209abd4fb01', 'hex')
		}
	},
	validAddWriter: {
		type: OperationType.ADD_WRITER,
		address: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
		eko: {
			wk: b4a.from('b409a53113949a492b7757370479d2850cac648db4685a1a40d3cdf8da0242e2', 'hex'),
			nonce: b4a.from('af9698ead07618dd38b4a5bb1bb85de516dc88438f69b5ec8f192ff5a6bcf062', 'hex'),
			sig: b4a.from('aec41a1266eb6f4992cc097ef6594e49d3c2bc9881173f4570db16e00b2fa7450d79212c059dd15cf3115a1c9771d4c941b126eed41ca44efc517a48a0291609', 'hex')
		}
	},
	validRemoveWriter: {
		type: OperationType.REMOVE_WRITER,
		address: addressToBuffer('trac1xvqvlzx4w2q2pfqrmycew87kq4rv0q0cewxk68ddvddgk2xm09cqvpc4jc'),
		eko: {
			wk: b4a.from('b409a53113949a492b7757370479d2850cac648db4685a1a40d3cdf8da0242e2', 'hex'),
			nonce: b4a.from('c18a02cfa577624b03d34b12dd48daff86c6d5abcb4a0fc11d18775e0bcb88ee', 'hex'),
			sig: b4a.from('bd9118d8630b01b2cbbd2fb96ffdf4bcb0917e144809a773a6c4bc12dc84ee2afa82d2c5502ae1ff2c829a479f956d0d2e57ad5a501fbb39595c0a6a70bf8408', 'hex')
		}
	},
	topFieldsEko: ['type', 'address', 'eko'],
	extendedKeyOpValueFields: ['wk', 'nonce', 'sig'],
	requiredLengthOfFieldsForExtendedValue: {
		wk: WRITER_BYTE_LENGTH,
		nonce: NONCE_BYTE_LENGTH,
		sig: SIGNATURE_BYTE_LENGTH,
	}
}

export const notAllowedDataTypes = [
	997,
	true,
	null,
	undefined,
    Infinity,
	{},
	[],
	() => { },
    //Symbol('sym'), test will throw but protocol won't accept it TODO: cover it somehow in the future if possible
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
	b4a.alloc(10),
];
