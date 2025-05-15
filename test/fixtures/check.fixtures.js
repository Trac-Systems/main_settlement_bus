import {
	ADDRESS_CHAR_HEX_LENGTH,
	WRITER_KEY_CHAR_HEX_LENGTH,
	NONCE_CHAR_HEX_LENGTH,
	SIGNATURE_CHAR_HEX_LENGTH,
	HASH_CHAR_HEX_LENGTH
} from '../../src/utils/constants.js';

const validPreTx = {
	op: 'pre-tx',
	tx: 'bae5893ff93ed04924da634f083fe19e9c82ce4722f0d45b10987e40757fc039',
	is: '2cede45df161a6472f1249547c9ca410bd5984dee078303e88ba4b76ce00b92cc6bd76681e923238db77aa4f4a01237101e4d7be1406d4b4b3bd869e2619af05',
	wp: '3075ff1ab92036d45bf803f1fb0860a73eca2ca1f0c7b3abe4283684b7fcdfd2',
	i: '3ad0a49ecc5996d72a3ea9a1a57c4fed5bf71ecd0f965ec6225e4deed4fd4d95',
	ipk: '332a5394d68e282f084d6c627febb40d1a5217c8f499a95510f2ba942bc52572',
	ch: '1678bc98ca7751f96f2c3aabef7a72f1ae4a0421951240ddc3b682620da1fc3e',
	in: 'f25c466034e2b0dc6ee2722017ad4b1c55f916273ad406eb6e4fb20665446e28',
	bs: 'df2d5eab173b93fb585ce69463dee7288969869e9a025474aa638f42fab200c5',
	mbs: '70bddc71374515d60a7fbe5abd47227658c4274b2832741404e78601d1d19b6e'
};

const validPostTx = {
	type: 'tx',
	key: '2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07',
	value: {
		op: 'post-tx',
		tx: '2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07',
		is: '4dbe14b0ef8cc08a9b513d40f541b3d56194debd03b09e5e571565b0c4196cc6f2b5feb5f763b8599c66bb41e0776bfdd5992657d6547afefecf044899d0b607',
		w: 'd9edc49157caa7b0d7508591b1dfba84c3e1a7c1039bf66238f9014c3dd00636',
		i: '3ad0a49ecc5996d72a3ea9a1a57c4fed5bf71ecd0f965ec6225e4deed4fd4d95',
		ipk: '332a5394d68e282f084d6c627febb40d1a5217c8f499a95510f2ba942bc52572',
		ch: '7ceba2e9e4caa40e93b718d689ac543efb095b4d596d36d0abb13bb29c789f94',
		in: '86e08c2a24854e3407b6a85912c088f97556cb0e381afa7912176ad7a2e8346b',
		bs: 'df2d5eab173b93fb585ce69463dee7288969869e9a025474aa638f42fab200c5',
		mbs: '70bddc71374515d60a7fbe5abd47227658c4274b2832741404e78601d1d19b6e',
		ws: 'a24be863c6498e8b4473f6bb8e702a6d2dcbaaa0c789ba485b3fac0064888fbc7bbaf966e760b03e570c9ce606b1d2961413dec9a54b3f5438c1333d3ec69c0b',
		wp: '3075ff1ab92036d45bf803f1fb0860a73eca2ca1f0c7b3abe4283684b7fcdfd2',
		wn: '50d27298b975f92b605f6bb80c8c0eeb76d2a81bf494470a2b1ef68ffff6d0bc'
	}
};

const validAddIndexer = {
	type: 'addIndexer',
	key: '6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80',
	value: {
		nonce: '59b638b60a07d8ae06aa3e2879bbf5ec7d09cfe566fabc6e866bf853f3458d15',
		sig: '8fb6f2b1a6f0b6aef7c897b7525c2dbd25b41135aa1493f3a517befc932302a2074d19232192d34cca51c380f5ff0b1c5b23464c915e6dce547326db9795610e'
	}
};

const validRemoveIndexr = {
	type: 'removeIndexer',
	key: '6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80',
	value: {
		nonce: 'ee4bf87667a39a058beadd3a34d5f58f9fa9f2dfef378023a53856bd72bb0225',
		sig: '36fa96d940ea6ac15a8e26af40c160a9fe66cb810fd9837b76b7edac9f0a86d5c928d11f765a0a610b1fe7edcfa965a7f16da3bc2efb63896b7b0810a7dd0e00'
	}
};

const validAppendWhitelist = {
	type: 'appendWhitelist',
	key: '8ddd9cdea5dda7792529fd2b84736bae41e735fd0466c2f7871ee36f2ede8cac',
	value: {
		nonce: 'aaa649f39261af0b6513a4af4309dc02d6409e01e690dcffb9d2be10986b97ce',
		sig: 'ea34436732dabf611eb1eeb9f15b86fd6dce502c256063eee0022a0287fbbb635ed6229ea8bc0ec38fd921ceb6bc7bcf843ed824f59f4d51efbe8861d50adc05'
	}
};

const validBanValidator = {
	type: 'banValidator',
	key: '6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80',
	value: {
		nonce: '7fb5b38fd0ee409045f249ffb11205649c3c65c9e77db6ed658411095d7db1b1',
		sig: 'b41bf967106134c5b748b41ab8607c0a4eb512a0f5127b12ae2d8304d6ee32b0da4ef1a93b6e602a32327f209b3ddc8ef015329f06e171b885b4b65ee69ee307'
	}
};

const validAddAdmin = {
	type: 'addAdmin',
	key: '9418310c60fe01bd3788bb1f2fa5be8a2ea7eaa638ce712ca2af835f8eaabe2d',
	value: {
		pub: '9418310c60fe01bd3788bb1f2fa5be8a2ea7eaa638ce712ca2af835f8eaabe2d',
		wk: 'cb8ddff835b6837422bfe0a8e50ba3b4dca08d4f35667a75681128e2bf4d8ee8',
		nonce: '4ba7252577a07316b4b8dad6a7a91b65e9e6c7fce81a3641120febdc7c455600',
		sig: '2c2fcec55305653421ca3e68097b62615ab8c0ecf2a3eec487e6fe9db2bb662b94b40e6ed39f8e321f88ec550114dd6706aa36b13eda0d3fca06af8234a7980d'
	}
};

const validAddWriter = {
	type: 'addWriter',
	key: '675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479',
	value: {
		pub: '675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479',
		wk: 'b1210f884cd7c7cd2895a7345388d6ede24e21990e69eb34ae7a60a47c30fdfa',
		nonce: '9387127793640a09af6c11c4e29dc4108fa729230a7c3e587072a09fdf4a555d',
		sig: '82cc5dff1ec55c3eb3ff448a888286b3c97e17279909882a015f8249e8573c8fa64ec57cf9b525a4fca28cca6c56f09376c891e48192a39d8b9a618c69c1ce0c'
	}
};

const validRemoveWriter = {
	type: 'removeWriter',
	key: '675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479',
	value: {
		pub: '675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479',
		wk: 'b1210f884cd7c7cd2895a7345388d6ede24e21990e69eb34ae7a60a47c30fdfa',
		nonce: '6c7501bf624767e960bc6a3668a65df3388817f7512d105ef8961b01139509f3',
		sig: 'cc0e4e9bc5faf3b54521501d5c69a98edaa244e24df4a847b5dcd1b8167316f674d538812dfa3e296a13eebbc5941a1d717856a298c95b9eee533b141d8f4f07'
	}
};

const notAllowedDataTypes = [
	997,
	true,
	null,
	undefined,
	{},
	[],
	() => { },
	//Symbol('sym'), test will throw but protocol won't accept it TODO: fix in the future
	BigInt(997),
	new Date(),
	NaN,
	new Map(),
	new Set()
];

const preTxfields = ['op', 'tx', 'is', 'wp', 'i', 'ipk', 'ch', 'in', 'bs', 'mbs'];

const requiredLengthOfFieldsForPreTx = {
	tx: HASH_CHAR_HEX_LENGTH,
	is: SIGNATURE_CHAR_HEX_LENGTH,
	wp: ADDRESS_CHAR_HEX_LENGTH,
	i: WRITER_KEY_CHAR_HEX_LENGTH,
	ipk: ADDRESS_CHAR_HEX_LENGTH,
	ch: HASH_CHAR_HEX_LENGTH,
	in: NONCE_CHAR_HEX_LENGTH,
	bs: WRITER_KEY_CHAR_HEX_LENGTH,
	mbs: WRITER_KEY_CHAR_HEX_LENGTH
};

const topFields = ['type', 'key', 'value'];

const postTxValueFields = ['op', 'tx', 'is', 'w', 'i', 'ipk', 'ch', 'in', 'bs', 'mbs', 'ws', 'wp', 'wn'];

const requiredLengthOfFieldsForPostTx = {
	tx: HASH_CHAR_HEX_LENGTH,
	is: SIGNATURE_CHAR_HEX_LENGTH,
	w: WRITER_KEY_CHAR_HEX_LENGTH,
	i: WRITER_KEY_CHAR_HEX_LENGTH,
	ipk: ADDRESS_CHAR_HEX_LENGTH,
	ch: HASH_CHAR_HEX_LENGTH,
	in: NONCE_CHAR_HEX_LENGTH,
	bs: WRITER_KEY_CHAR_HEX_LENGTH,
	mbs: WRITER_KEY_CHAR_HEX_LENGTH,
	ws: SIGNATURE_CHAR_HEX_LENGTH,
	wp: ADDRESS_CHAR_HEX_LENGTH,
	wn: NONCE_CHAR_HEX_LENGTH
};
const basicKeyOpValueFields = ['nonce', 'sig'];
const requiredLengthOfFieldsForBasicKeyOp = {
	nonce: NONCE_CHAR_HEX_LENGTH,
	sig: SIGNATURE_CHAR_HEX_LENGTH,
};
const extendedKeyOpValueFields = ['pub', 'wk', 'nonce', 'sig'];

const requiredLengthOfFieldsForExtendedValue = {
	pub: ADDRESS_CHAR_HEX_LENGTH,
	wk: WRITER_KEY_CHAR_HEX_LENGTH,
	nonce: NONCE_CHAR_HEX_LENGTH,
	sig: SIGNATURE_CHAR_HEX_LENGTH,
};

export default {
	validPreTx,
	validPostTx,
	validAddIndexer,
	validRemoveIndexr,
	validAppendWhitelist,
	validBanValidator,
	validAddAdmin,
	validAddWriter,
	validRemoveWriter,
	notAllowedDataTypes,
	preTxfields,
	requiredLengthOfFieldsForPreTx,
	topFields,
	postTxValueFields,
	requiredLengthOfFieldsForPostTx,
	basicKeyOpValueFields,
	requiredLengthOfFieldsForBasicKeyOp,
	extendedKeyOpValueFields,
	requiredLengthOfFieldsForExtendedValue
};
