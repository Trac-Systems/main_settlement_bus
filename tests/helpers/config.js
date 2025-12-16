import { HASH_BYTE_LENGTH, NETWORK_ID, NONCE_BYTE_LENGTH, TRAC_ADDRESS_SIZE, WRITER_BYTE_LENGTH } from '../../src/utils/constants.js';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

export const config = { 
  networkId: NETWORK_ID,
  addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
  addressLength: TRAC_ADDRESS_SIZE,
  maxValidators: 6,
  enableTxApplyLogs: false,
  enableErrorApplyLogs: true,
  transactionTotalSize: 3 * WRITER_BYTE_LENGTH + 2 * TRAC_ADDRESS_SIZE + HASH_BYTE_LENGTH + NONCE_BYTE_LENGTH
};
