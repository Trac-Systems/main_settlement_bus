# HTLC lock operation

`HTLC_LOCK` moves TNK into an escrow keyed by the lock transaction hash (`hlo.tx`).
MSB enforces native custody, signatures, fees, and its epoch deadline. It does not
identify marketplace operators or verify an external-chain swap.

## Signed lock terms

The outer operation supplies the locker `address`. The canonical signing message
includes the MSB network ID, operation type, that address, and these `hlo` fields:

| Field | Meaning |
| --- | --- |
| `txv`, `in` | Transaction-validity reference and locker nonce. |
| `ca`, `ra` | Claim and refund recipient addresses. |
| `am`, `fa`, `fr` | Principal, optional TNK surcharge amount, and its recipient. `fa` is zero and `fr` absent for a fee-free lock. |
| `hl`, `re` | SHA-256 preimage hash and MSB refund epoch. |
| `ph` | Optional opaque application-policy hash; MSB does not execute its rules. |
| `ss`, `th` | Ordered signer public keys and required signature count. |

`ss[0]` must be the locker public key decoded from `address`. The remaining keys
are unique and sorted by raw bytes. The locker signs `tx` in `is`; additional
signatures appear in `cs` in signer-set order. Every supplied signature must
verify, and `1 + cs.length >= th`. Up to eight signers are supported. `tx` is
the BLAKE3 hash of the canonical signing message. Validator completion adds
`va`, `vn`, and `vs` without changing the signed lock terms.

## Settlement and state

The locker pays `am + fa` into escrow plus the separate MSB network fee. Claim
allocates `am` to `ca` and `fa` to `fr`; refund returns `am + fa` to `ra`.
Claim and refund must remain permissionless and must not require a new locker,
cosigner, or operator signature. Their apply handlers are separate work.

`re` must be at least `HTLC_MIN_LOCK_DURATION_EPOCHS` after the current epoch
when the lock is admitted and applied. An application must independently ensure
the external asset's refund deadline is earlier by a sufficient safety margin.

Escrow is stored at `/htlc/escrow/<tx hex>` using `state.EscrowEntry` from
[`escrow_entry.proto`](../proto/state/escrow_entry.proto). It records the
settlement fields and status; nonce, signer set, and signatures remain in the
lock transaction. A CrossDex-style application must verify its own policy and
external-chain conditions before relying on the native lock.
