# Uncovered guards in `src/core/state/State.js`

The following branches currently have no scenarios in `tests/unit/state/apply`:

- `handleApplyInitializeBalanceOperation`: “Invalid requester message”, “Failed to initialize node entry”, “Failed to set node entry balance”.
- `handleApplyDisableBalanceInitializationOperation`: “Invalid requester message”.
- `handleApplyAddAdminOperation`: “Invalid requester message”, “Something went wrong while updating license index”, “Something went wrong while updating writers index”.
- `handleApplyAdminRecoveryOperation`: no tests for the entire handler (all guards missing).
- `handleApplyAppendWhitelistOperation`: “Invalid requester message”, “Failed to validate admin entry”, “Failed to update admin entry”, two branches “Something went wrong while updating license index”, “Failed to initialize node entry”, “Failed to edit node entry”.
- `handleApplyAddWriterOperation` / `#addWriter`: “Invalid requester message”, “Invalid validator message”, “Failed to update node entry with a writer role”, “Something went wrong while updating writers index”.
- `handleApplyRemoveWriterOperation` / `#removeWriter`: “Invalid requester message”, “Invalid validator message”, “Failed to decode validator node entry”.
- `handleApplyAddIndexerOperation`: “Invalid requester message”.
- `handleApplyRemoveIndexerOperation` / `#removeIndexer`: “Invalid requester message”, “Something went wrong while updating writers index”.
- `handleApplyBanValidatorOperation`: “Invalid requester message”.
- `handleApplyBootstrapDeploymentOperation`: “Invalid requester message”, “Invalid validator message”, “Invalid validator node entry”.
- `handleApplyTxOperation`: “Invalid requester message”, “Invalid validator message”.
- `handleApplyTransferOperation`: “Invalid requester message”, “Invalid validator message”.
- `#withdrawStakedBalanceApply`: “Invalid staked balance”, “No staked balance to unstake”, “Invalid current balance”, “Failed to add staked balance to current balance”.
- `#validatorPenaltyApply`: “Admin entry not found”, “Admin cannot be penalized”.
- `#transferFeeTxOperation`: “Invalid incoming data.”.
