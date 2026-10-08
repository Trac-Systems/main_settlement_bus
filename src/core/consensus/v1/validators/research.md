ETH/TNK Timeout Relationship

  Assume the maker sells TNK and the taker locks ETH first:

  flowchart LR
      A["Both locks finalized"] --> B["Before ETH deadline E<br/>ETH CLAIM: open<br/>ETH REFUND: closed<br/>TNK CLAIM: open<br/>TNK REFUND: closed"]
      B --> C["ETH deadline E<br/>ETH CLAIM closes<br/>ETH REFUND opens"]
      C --> D["Safety interval Delta<br/>TNK CLAIM remains open<br/>TNK REFUND remains closed"]
      D --> F["TNK deadline M = E + Delta<br/>TNK CLAIM closes<br/>TNK REFUND opens"]

  The required relationship is:

  estimated time of TNK refundEpoch
      >= estimated time of ETH refundBlock + safety margin

  Example:

  ETH lock: refundBlock = currentBlock + 1,200   approximately 4 hours
  TNK lock: refundEpoch maps to approximately 8 hours
  Safety interval: approximately 4 hours

  If the maker claims ETH in the last valid Ethereum block, the preimage becomes public. The taker still has the safety interval to submit and finalize HTLC_CLAIM on MSB.

  The deadline applies at transaction inclusion, not submission. An ETH claim broadcast before refundBlock but included at or after it fails. Therefore, the safety margin must cover observation, congestion, confirmations/finality, MSB
  submission, and MSB finalization.

  At each boundary:

  Ethereum: block.number < refundBlock  -> CLAIM
  Ethereum: block.number >= refundBlock -> REFUND

  MSB: currentEpoch < refundEpoch       -> CLAIM
  MSB: currentEpoch >= refundEpoch      -> REFUND

  CrossDex must calculate and validate the cross-chain relationship. MSB only enforces its own epoch boundary.