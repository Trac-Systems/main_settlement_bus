import b4a from 'b4a';
import applyOperations from '../../src/utils/protobuf/applyOperations.cjs';

const validPostTx = {
  type: applyOperations.OperationType.POST_TX,
  key: b4a.from('2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07', 'hex'),
  txo: {
    //op: 'post-tx', we need to rid off this from transaction. 
    tx: b4a.from('2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07', 'hex'),
    is: b4a.from('4dbe14b0ef8cc08a9b513d40f541b3d56194debd03b09e5e571565b0c4196cc6f2b5feb5f763b8599c66bb41e0776bfdd5992657d6547afefecf044899d0b607', 'hex'),
    w: b4a.from('d9edc49157caa7b0d7508591b1dfba84c3e1a7c1039bf66238f9014c3dd00636', 'hex'),
    i: b4a.from('3ad0a49ecc5996d72a3ea9a1a57c4fed5bf71ecd0f965ec6225e4deed4fd4d95', 'hex'),
    ipk: b4a.from('332a5394d68e282f084d6c627febb40d1a5217c8f499a95510f2ba942bc52572', 'hex'),
    ch: b4a.from('7ceba2e9e4caa40e93b718d689ac543efb095b4d596d36d0abb13bb29c789f94', 'hex'),
    in: b4a.from('86e08c2a24854e3407b6a85912c088f97556cb0e381afa7912176ad7a2e8346b', 'hex'),
    bs: b4a.from('df2d5eab173b93fb585ce69463dee7288969869e9a025474aa638f42fab200c5', 'hex'),
    mbs: b4a.from('70bddc71374515d60a7fbe5abd47227658c4274b2832741404e78601d1d19b6e', 'hex'),
    ws: b4a.from('a24be863c6498e8b4473f6bb8e702a6d2dcbaaa0c789ba485b3fac0064888fbc7bbaf966e760b03e570c9ce606b1d2961413dec9a54b3f5438c1333d3ec69c0b', 'hex'),
    wp: b4a.from('3075ff1ab92036d45bf803f1fb0860a73eca2ca1f0c7b3abe4283684b7fcdfd2', 'hex'),
    wn: b4a.from('50d27298b975f92b605f6bb80c8c0eeb76d2a81bf494470a2b1ef68ffff6d0bc', 'hex')
  }
};

const validAddIndexer = {
  type: applyOperations.OperationType.ADD_INDEXER,
  key: b4a.from('6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80', 'hex'),
  bko: {
    nonce: b4a.from('59b638b60a07d8ae06aa3e2879bbf5ec7d09cfe566fabc6e866bf853f3458d15', 'hex'),
    sig: b4a.from('8fb6f2b1a6f0b6aef7c897b7525c2dbd25b41135aa1493f3a517befc932302a2074d19232192d34cca51c380f5ff0b1c5b23464c915e6dce547326db9795610e', 'hex')
  }
};

const validRemoveIndexr = {
  type: applyOperations.OperationType.REMOVE_INDEXER,
  key: b4a.from('6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80', 'hex'),
  bko: {
    nonce: b4a.from('ee4bf87667a39a058beadd3a34d5f58f9fa9f2dfef378023a53856bd72bb0225', 'hex'),
    sig: b4a.from('36fa96d940ea6ac15a8e26af40c160a9fe66cb810fd9837b76b7edac9f0a86d5c928d11f765a0a610b1fe7edcfa965a7f16da3bc2efb63896b7b0810a7dd0e00', 'hex')
  }
};

const validAppendWhitelist = {
  type: applyOperations.OperationType.APPEND_WHITELIST,
  key: b4a.from('8ddd9cdea5dda7792529fd2b84736bae41e735fd0466c2f7871ee36f2ede8cac', 'hex'),
  bko: {
    nonce: b4a.from('aaa649f39261af0b6513a4af4309dc02d6409e01e690dcffb9d2be10986b97ce', 'hex'),
    sig: b4a.from('ea34436732dabf611eb1eeb9f15b86fd6dce502c256063eee0022a0287fbbb635ed6229ea8bc0ec38fd921ceb6bc7bcf843ed824f59f4d51efbe8861d50adc05', 'hex')
  }
};

const validBanValidator = {
  type: applyOperations.OperationType.BAN_WRITER,
  key: b4a.from('6f0e38b8de086e65c1de22418d8ca54ad00aafe072159e2b05a9305f2611db80', 'hex'),
  bko: {
    nonce: b4a.from('7fb5b38fd0ee409045f249ffb11205649c3c65c9e77db6ed658411095d7db1b1', 'hex'),
    sig: b4a.from('b41bf967106134c5b748b41ab8607c0a4eb512a0f5127b12ae2d8304d6ee32b0da4ef1a93b6e602a32327f209b3ddc8ef015329f06e171b885b4b65ee69ee307', 'hex')
  }
};

const validAddAdmin = {
  type: applyOperations.OperationType.ADD_ADMIN,
  key: b4a.from('9418310c60fe01bd3788bb1f2fa5be8a2ea7eaa638ce712ca2af835f8eaabe2d', 'hex'),
  eko: {
    wk: b4a.from('cb8ddff835b6837422bfe0a8e50ba3b4dca08d4f35667a75681128e2bf4d8ee8', 'hex'),
    nonce: b4a.from('4ba7252577a07316b4b8dad6a7a91b65e9e6c7fce81a3641120febdc7c455600', 'hex'),
    sig: b4a.from('2c2fcec55305653421ca3e68097b62615ab8c0ecf2a3eec487e6fe9db2bb662b94b40e6ed39f8e321f88ec550114dd6706aa36b13eda0d3fca06af8234a7980d', 'hex')
  }
};

const validAddWriter = {
  type: applyOperations.OperationType.ADD_WRITER,
  key: b4a.from('675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479', 'hex'),
  eko: {
    wk: b4a.from('b1210f884cd7c7cd2895a7345388d6ede24e21990e69eb34ae7a60a47c30fdfa', 'hex'),
    nonce: b4a.from('9387127793640a09af6c11c4e29dc4108fa729230a7c3e587072a09fdf4a555d', 'hex'),
    sig: b4a.from('82cc5dff1ec55c3eb3ff448a888286b3c97e17279909882a015f8249e8573c8fa64ec57cf9b525a4fca28cca6c56f09376c891e48192a39d8b9a618c69c1ce0c', 'hex')
  }
};

const validRemoveWriter = {
  type: applyOperations.OperationType.REMOVE_WRITER,
  key: b4a.from('675cf7ed2813155d92335335dbdb19e9cea3278330185dbb4f441a7fa2207479', 'hex'),
  eko: {
    wk: b4a.from('b1210f884cd7c7cd2895a7345388d6ede24e21990e69eb34ae7a60a47c30fdfa', 'hex'),
    nonce: b4a.from('6c7501bf624767e960bc6a3668a65df3388817f7512d105ef8961b01139509f3', 'hex'),
    sig: b4a.from('cc0e4e9bc5faf3b54521501d5c69a98edaa244e24df4a847b5dcd1b8167316f674d538812dfa3e296a13eebbc5941a1d717856a298c95b9eee533b141d8f4f07', 'hex')
  }
};

const invalidPayloads = [
  null,
  undefined,
  true,
  false,
  0,
  1,
  123,
  NaN,
  Infinity,
  -1,
  '',
  'string',
  Symbol('sym'),
  BigInt(10),
  [],
  {},
  () => { },
  new Date(),
  { foo: 'bar' },
  { type: '1', key: b4a.from('01', 'hex') },
  { type: 1, key: null },
  { type: 1 },
  { key: b4a.from('01', 'hex') },
  { type: 5, key: [] },
  { type: 1, key: b4a.from('01', 'hex'), bko: null },
  { type: 1, key: b4a.from('01', 'hex'), bko: 123 },
  { type: 1, key: b4a.from('01', 'hex'), bko: b4a.from('01', 'hex'), data: 'string' },
  { type: 1, key: b4a.from('01', 'hex'), bko: b4a.from('01', 'hex'), data: null },
  { type: 1, key: b4a.from('01', 'hex'), memo: 123 },
  { type: 1, key: 'string' },
  { type: 1, key: {}, bko: {} },
  { type: 'foo', key: [], bko: 'bar' },
  b4a.from([0xFF, 0xAA, 0x55, 0x00, 0x99]),
  (() => { const a = {}; a.self = a; return a; })(),
  Object.create(null),
  new Map(),
  new Set(),
  new Float64Array([1.1, 2.2]),
  new Int16Array([1, 2, 3]),
  { type: 9999, key: b4a.from('01', 'hex') },
  { type: 1, key: 'not-a-buffer' },
  Number.MAX_SAFE_INTEGER + 1,
  -Number.MAX_SAFE_INTEGER - 1,
  { type: 1, key: b4a.from('01', 'hex'), callback: () => { } },
  Buffer.alloc(0),
  Buffer.alloc(1, 0x00),
  Buffer.alloc(1, 0xFF),
  Buffer.alloc(10, 0x01),
  Buffer.from([0, 255, 127, 128, 64]),
  Buffer.from('not serialized data?'),
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  Buffer.from(Array.from({ length: 1024 * 1024 }, () => Math.floor(Math.random() * 256))), // 1MB
];

const invalidPayloadWithMultipleOneOfKeys = {
  type: applyOperations.OperationType.ADD_WRITER,
  key: b4a.from('2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07', 'hex'),
  bko: { nonce: b4a.from('2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07', 'hex') },
  eko: { wk: b4a.from('2f0f434b77ac0c85c1c3511ac01e24136d9e5e2425cceca14ef9199f73af5d07', 'hex') }
};

export default {
  validPostTx,
  validAddIndexer,
  validRemoveIndexr,
  validAppendWhitelist,
  validBanValidator,
  validAddAdmin,
  validAddWriter,
  validRemoveWriter,
  invalidPayloads,
  invalidPayloadWithMultipleOneOfKeys
};
