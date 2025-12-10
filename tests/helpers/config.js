import { NETWORK_ID, TRAC_ADDRESS_SIZE } from '../../src/utils/constants.js';
import { TRAC_NETWORK_MSB_MAINNET_PREFIX } from 'trac-wallet/constants.js';

export const config = { networkId: NETWORK_ID,
  addressPrefix: TRAC_NETWORK_MSB_MAINNET_PREFIX,
  addressLength: TRAC_ADDRESS_SIZE,
  maxValidators: 6,
  enableTxApplyLogs: false,
  enableErrorApplyLogs: true,
};
