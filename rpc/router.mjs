import {
    handleBalance,
    handleUnconfirmedBalance,
    handleTxv,
    handleFee,
    handleConfirmedLength,
    handleBroadcastTransaction,
    handleTxHashes
} from './handlers.mjs';

export const routes = [
    { method: 'GET', path: '/balance/', handler: handleBalance },
    { method: 'GET', path: '/balance?confirmed=false', handler: handleUnconfirmedBalance },
    { method: 'GET', path: '/txv', handler: handleTxv },
    { method: 'GET', path: '/fee', handler: handleFee },
    { method: 'GET', path: '/confirmed-length', handler: handleConfirmedLength },
    { method: 'POST', path: '/broadcast-transaction', handler: handleBroadcastTransaction },
    { method: 'GET', path: '/tx-hashes/', handler: handleTxHashes },
];