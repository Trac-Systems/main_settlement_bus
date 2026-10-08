# HTLC lock operation

This document explains the lock fields and authorization rules discussed in
[PR #796](https://github.com/Trac-Systems/main_settlement_bus/pull/796).
The PR provides operation setup: encoding, message construction, validation,
protocol routing, and escrow-entry helpers. It does **not** implement the lock
apply handler or complete the claim/refund operation flows. Payouts below describe
the escrow helpers' settlement results, not balance changes already wired into apply.

## Settlement boundary

MSB validates native TNK settlement terms and signatures. It does not register
marketplace operators, enforce their governance, or verify an external-chain lock.
An application can require an operator to cosign, but MSB treats that key as an
ordinary cosigner authorized by the locker.

Once funds are locked, claim/refund must use the stored recipients and the native
hashlock/epoch conditions. Neither path may require fresh cosigner approval or an
application policy check. Permissionless submission does not guarantee execution
during a network halt.

## Payload fields

The outer operation contains `type` and the locker `address`; `hlo` contains the
fields below. Addresses use the configured MSB address encoding. Amounts and
epochs are unsigned, fixed-width, big-endian buffers in TNK base units and MSB
epochs respectively. They are not floating-point TNK values or wall-clock timestamps.

| Field | Bytes | Meaning |
| --- | --- | --- |
| `tx` | 32 | BLAKE3 hash of the canonical lock terms; also the lock ID. |
| `txv` | 32 | Existing MSB transaction-validity reference. |
| `ca` | Address length | Stored recipient of the principal on claim. |
| `ra` | Address length | Stored recipient of the full escrow on refund. |
| `am` | 16 | Positive principal amount. |
| `fa` | 16 | Additional TNK surcharge; explicitly zero for a fee-free lock. |
| `fr` | Address length | Surcharge recipient; required exactly when `fa > 0`, otherwise omitted. |
| `hl` | 32 | SHA-256 hash of the secret preimage. |
| `re` | 8 | Refund epoch; claim requires `currentEpoch < re`, refund requires `currentEpoch >= re`. |
| `ph` | 32 | Optional, non-zero, opaque application policy/agreement hash. |
| `ss` | 32 per key | Between 1 and 8 distinct signer public keys; locker at index 0. |
| `th` | 1 | Total required authorizer signatures, including the locker; `1 <= th <= ss.length`. |
| `cs` | 64 per signature | Additional cosigner signatures in relative signer-set order; may be empty. |
| `in` | 32 | Locker nonce, included in the signed terms. |
| `is` | 64 | Mandatory locker signature over `tx`. |
| `va` | Address length | Validator address, absent in partial transactions and required in complete ones. |
| `vn` | 32 | Validator nonce, absent in partial transactions and required in complete ones. |
| `vs` | 64 | Validator signature, absent in partial transactions and required in complete ones. |

The partial network validator requires an initialized current epoch, a refund
epoch at least `HTLC_MIN_LOCK_DURATION_EPOCHS` ahead (currently 1 epoch), valid
recipient addresses, and sufficient locker balance for `am + fa +` the MSB network fee.
The apply implementation must enforce state-dependent conditions again at execution.
Signer and cosigner-signature array sizes are checked before schema item validation.
Signer-key uniqueness and one-byte threshold handling use byte values consistently
for both `Buffer` and `Uint8Array` inputs.

Claim/refund validation is not implemented in this setup PR. Their broadcast routes
reject with `OPERATION_TYPE_UNKNOWN` before constructing a complete transaction;
they must remain disabled until their own operation validation is implemented.

## Fees: principal plus a surcharge

`fa` implements the surcharge model agreed for this prototype. It is not the MSB
network fee, an external-chain gas estimate, or an amount deducted from `am`.
There is one surcharge recipient for now; MSB does not infer who represents the
marketplace or who should pay its fee.

For `am = 100` and `fa = 5`:

- The locker reserves 105 TNK base units for escrow, plus the separate MSB lock transaction fee.
- Successful claim allocates 100 to `ca` and 5 to `fr`.
- Refund allocates the entire 105 to `ra`; the surcharge is not earned on a refund.

`fa = 0` requires `fr` to be omitted. Both `fa` and `fr` are signed lock terms;
they cannot be increased or redirected after signatures are collected. An
application must show the total and recipients before signing. Network fees for
later claim/refund submissions follow their operation rules and are not represented
by this surcharge field.

## `ph`: application policy commitment

The application defines and hashes its policy using a documented canonical format.
The policy could describe a marketplace version, acceptable external fees, or
external-chain confirmation requirements. An application can also define it to
commit to the complete external swap agreement, including the chain/network,
asset, amount, recipient, and external lock terms. The application must define the
digest algorithm, unambiguous encoding, and domain/version; raw JSON without defined
canonicalization is insufficient. `ph` is optional metadata binding the lock to
that agreement; it is not an MSB policy registry, executable rule set, or proof
that the external asset was locked.

MSB validates its format and signature binding, not the policy's contents. Changing
the policy changes its hash and requires new lock signatures. The application must
check the actual policy against `ph` and evaluate its rules before taking an action
such as authorizing the lock or revealing the secret.

MSB does not verify external-chain amounts, finality, or deadlines. The application
must verify the external swap agreement against the exact MSB lock before proceeding,
whether or not it uses `ph`. No dedicated counterparty commitment is required by
the native lock operation.

A `maxFee` hidden inside `ph` cannot make MSB reject a higher external gas fee or
an off-ledger marketplace charge: MSB has neither the policy contents nor evidence
of that fee. The explicit `fa`/`fr` fields are the native surcharge MSB can enforce.
No later policy violation may prevent an otherwise eligible native claim or refund.

## Signature threshold and ordering

`th` counts **all** lock authorizers, including the mandatory locker signature `is`.
It does not count only the additional signatures in `cs`.

| Policy | `th` | Minimum `cs` entries |
| --- | --- | --- |
| Locker only | 1 | 0 |
| Locker plus one cosigner | 2 | 1 |
| Locker plus two cosigners | 3 | 2 |

Consequently `th = 0` is invalid, while `th = 1` with `cs = []` is valid, even if
`ss` lists optional cosigners. The locker is always required; a 2-of-3 lock means
the locker plus at least one of the other two keys, not any arbitrary pair.

`ss[0]` must match the public key encoded by the locker address. The remaining keys
are sorted by raw public-key bytes. `cs` contains plain signatures, not signature
objects, signer indexes, or empty placeholders. Verification scans the cosigner
keys forward, matching each supplied signature to a later key. This permits skipped
optional signers but rejects reversed ordering, unmatched signatures, and counting
the same signer twice. All supplied signatures must verify, and `1 + cs.length`
must satisfy `th`.

This relative-order approach follows the principle described for Bitcoin
[multisignature verification](https://developer.bitcoin.org/devguide/transactions.html).
It does not adopt Bitcoin's key format, script engine, or signature algorithm.

The transaction hash commits to the MSB network ID, locker address, operation type,
and all lock terms: `txv`, recipients, principal, surcharge, hashlock, refund epoch,
optional policy hash, signer-set size and keys, threshold, and locker nonce. Optional `fr`
and `ph` use fixed zero-filled slots when absent. Signatures and validator metadata
are excluded so applications can compute `tx` before collecting signatures.
Cosigned builder calls must supply the nonce used when collecting those signatures.

The draft wire schema, signing message, and escrow layout have been updated to
remove the counterparty commitment. Protobuf fields remain sequentially numbered.
This operation has no live apply handler yet; older draft payloads and collected
signatures must be rebuilt rather than reused with the updated format.

## Partial versus complete transactions

The application creates a partial transaction with `is` and the required `cs`.
The selected MSB validator verifies it and constructs the complete transaction,
preserving the signed terms and adding all three of `va`, `vn`, and `vs`.
The validator signs the BLAKE3 hash of the network ID, lock transaction hash,
validator nonce, and operation type.

The shared state schema supports both stages: validator fields are absent together
or present together. Complete broadcast-response validation additionally requires
all three. Validator completion is a separate network responsibility, not an
application operator signature and not part of `th`.

## Escrow storage

The persisted settlement entry uses the `state.EscrowEntry` protobuf message in
[`proto/state/escrow_entry.proto`](../proto/state/escrow_entry.proto). Run
`npm run protobuf` to regenerate its encoder and decoder in
`src/codecs/state/state.generated.cjs`, alongside the existing protocol codecs.
The storage schema is separate from the signed `HTLC_LOCK` payload.

The stored account fields are `lockerAddress`, `claimRecipientAddress`,
`refundRecipientAddress`, and optional `additionalFeeRecipientAddress`. These contain
the canonical MSB address bytes, not raw public keys. State-helper callers provide
the configured address prefix; initialization and decoding validate the encoding,
checksum, network prefix, and non-zero decoded public key. Settlement helper results
return address bytes for account lookup rather than public keys.
Initialize with `init(fields, config.addressPrefix)` and read with
`decode(storedBytes, config.addressPrefix)`.

`additionalFeeAmount` is the explicit 16-byte surcharge, separate from the network
fee. Zero disables the surcharge and requires `additionalFeeRecipientAddress` to be
omitted. Non-zero surcharge amounts require that recipient. The signed payload's
`fa`/`fr` fields and its builder inputs remain unchanged.

Protobuf encode/decode wrappers live in
[`src/codecs/state/escrowEntryCodec.js`](../src/codecs/state/escrowEntryCodec.js).
Throwing and safe variants follow the existing codec pattern; safe encoding returns
an empty buffer on failure, and safe decoding returns `null`. These wrappers check
protobuf structure, while the state helper retains settlement validation. Decoded
byte fields are copied so they cannot mutate the stored input.

Amounts, hashes, and refund epoch retain their fixed-width byte values. Schema
version and status are numeric protobuf fields. Optional additional fee recipient,
policy hash, and unclaimed preimage are omitted rather than zero-padded; the helper's
decoded API returns `null` for absent optional values. Entry size is variable, and
there is no fixed `ESCROW_ENTRY_SIZE`.

Nonce, signer set, threshold, and signatures remain in the lock transaction
identified by `lockId`. They authorize creation, not later settlement, and are not
duplicated in escrow storage. Removing the stored nonce does not remove `in` from
the signed operation or change its transaction hash.

Decoding validates required-field presence, byte lengths, fee/recipient pairing,
principal-plus-surcharge overflow, supported version/status, and preimage presence
only for a claimed entry. Protobuf decoding alone does not enforce these rules.
Claim/refund re-encode the updated entry without mutating the original stored bytes.
Amounts, secret hashing, and epoch boundaries remain unchanged. These are existing
pure escrow helpers, not live claim/refund operation handlers: they return proposed
state/payout data and do not credit accounts, append transactions, or emit events.
Claim/refund broadcast paths remain disabled until their separate implementation.

The protobuf storage format is version 3 after changing public keys to address bytes
and removing the nonce. Earlier draft fixed-layout version 1 and protobuf version 2
entries are rejected, not silently reinterpreted. There is no live lock apply handler
or runtime escrow-helper caller in this branch, so this change does not implement a
migration; any stores created externally with the old draft need rebuilding or an
explicit migration before deployment.

## Secret hashing: current choice and proposed extension

Secret verification currently uses `SHA256(preimage) == hl`; the preimage is a
non-zero 32-byte value. BLAKE3 is separately used for the lock transaction hash.
The hashlock bytes alone do not identify an algorithm, and applications must not
submit a BLAKE3 or Keccak hash as if it were a SHA-256 hashlock.

SHA-256 is an interoperability choice, not a limitation of MSB's transaction
hashing. EVM contracts can use SHA-256 even though Keccak-256 is also available.
[Solidity documents both functions](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#mathematical-and-cryptographic-functions).
Compatibility still depends on the particular external HTLC contract accepting
the same algorithm and preimage bytes.

Configurable secret hashing is proposed in the review but is **not implemented
by this PR**. Before adding it, agree on the supported algorithms and stable IDs.
The extension must include the algorithm ID in the signed lock terms and stored
escrow, reject unknown IDs without fallback, and verify claims using the stored
choice. It also needs deterministic test vectors on Node and Bare and an explicit
escrow-format version/migration decision. Having a BLAKE3 API locally does not by
itself establish external-chain compatibility.

## Implementation references

- [Wire schema](../proto/applyOperations/messages/htlc_lock_operation.proto)
- [Canonical signing and ordered signature verification](../src/utils/htlcLock.js)
- [Message builder](../src/messages/state/ApplyStateMessageBuilder.js)
- [Shared state schema](../src/core/state/validators/StateValidationSchema.js)
- [Partial lock validator](../src/core/network/protocols/shared/validators/PartialHtlcValidator.js)
- [Complete broadcast-response validator](../src/core/network/protocols/v1/validators/V1BroadcastTransactionResponse.js)
- [Escrow encoding and claim/refund helpers](../src/core/state/utils/escrowEntry.js)
- [Escrow storage schema](../proto/state/escrow_entry.proto)
- [Escrow codec wrappers](../src/codecs/state/escrowEntryCodec.js)
