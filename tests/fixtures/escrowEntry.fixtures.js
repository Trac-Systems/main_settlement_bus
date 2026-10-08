import b4a from 'b4a';
import tracCryptoApi from 'trac-crypto-api';
import applyOperationFixtures from './applyOperation.fixtures.js';

const {address, hlo} = applyOperationFixtures.validHtlcLockOperation;

export const escrowPreimage = b4a.from('1f95296a578933d525cd122a04a4a5d3474381d8c40d8b97da5a0b221dd60ed2', 'hex');

export const validEscrowEntry = {
    version: 3,
    status: 0,
    lockId: b4a.from(hlo.tx),
    lockerAddress: b4a.from(address),
    claimRecipientAddress: b4a.from(hlo.ca),
    refundRecipientAddress: b4a.from(hlo.ra),
    amount: b4a.from(hlo.am),
    additionalFeeAmount: b4a.from(hlo.fa),
    additionalFeeRecipientAddress: b4a.from(hlo.fr),
    hashLock: tracCryptoApi.hash.sha256(escrowPreimage),
    refundEpoch: b4a.from(hlo.re),
    policyHash: b4a.from(hlo.ph),
};
