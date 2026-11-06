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
| `md` | Optional opaque application metadata, containing 1–1024 bytes when present. MSB does not interpret its contents. |
| `ss`, `th` | Ordered signer public keys and required signature count. |

`ss[0]` must be the locker public key decoded from `address`. The remaining keys
are unique and sorted by raw bytes. The locker signs `tx` in `is`; additional
signatures appear in `cs` in signer-set order. Every supplied signature must
verify, and `1 + cs.length >= th`. Up to eight signers are supported. `tx` is
the BLAKE3 hash of the canonical signing message. Validator completion adds
`va`, `vn`, and `vs` without changing the signed lock terms.

## Application metadata

The builder accepts `lock.metadata` through `setHtlcMetadata()`. It accepts
binary bytes (`Buffer` or `Uint8Array`) or an even-length hexadecimal string.
The operation carries those bytes as `hlo.md`; JSON output represents `md` as
hex. For example, the builder input `{metadata: "68656c6c6f"}` produces
`{md: "68656c6c6f"}` in the JSON lock body, representing five bytes (`hello`).

Omit the field, or pass `undefined`, when no metadata is needed. If supplied,
it must contain **1–1024 bytes**, as defined by
`HTLC_METADATA_MAX_BYTE_LENGTH`. Empty buffers, empty strings, `null`, malformed
hex, and values exceeding the limit are rejected. All byte values are allowed,
including an entirely zero-filled buffer. The limit applies to decoded bytes:
1024 bytes use 2048 hex characters in JSON. MSB does not require text, JSON, or
any application-specific structure. Signer keys and signatures have separate
fields and do not consume the metadata allowance.

## Canonical signing message

[`createHtlcLockSigningMessage`](../src/utils/htlcLock.js) concatenates these
fields in order, using their binary representations:

```text
uint32BE(networkId)
|| lockerAddress
|| txv || ca || ra || am || fa
|| (fr, or address-length zero bytes when absent)
|| hl || re
|| uint32BE(metadataByteLength) || metadataBytes
|| uint8(ss.length) || ss[0] || ... || ss[n-1]
|| th || in
|| uint32BE(HTLC_LOCK)
```

`th` is one byte. Metadata are included directly, preceded by their four-byte
unsigned big-endian length. With no `md`, the length is `00000000` and no
metadata bytes follow. For `md: "00aaff"`, this part of the message is
`00000003 00aaff`. The zero-length representation is internal to the signing
message; it does not allow an explicitly supplied empty `md` field.

Changing, adding, or removing metadata changes `tx` and requires new authorizer
signatures. The signing message excludes `is`, `cs`, and the validator completion
fields. Completion preserves the signed metadata bytes.

## Settlement and state

The locker pays `am + fa` into escrow plus the separate MSB network fee. Claim
allocates `am` to `ca` and `fa` to `fr`; refund returns `am + fa` to `ra`.
Any submitter may claim with the correct preimage before the refund epoch, or
request a refund at or after that epoch. Settlement does not require a new
locker, cosigner, or operator signature; the submitter and validator still sign
the claim or refund transaction.

`re` must be at least `HTLC_MIN_LOCK_DURATION_EPOCHS` after the current epoch
when the lock is admitted and applied. An application must independently ensure
the external asset's refund deadline is earlier by a sufficient safety margin.

Escrow is stored at `/htlc/escrow/<tx hex>` using `state.EscrowEntry` from
[`escrow_entry.proto`](../proto/state/escrow_entry.proto). It records the
settlement fields and status; nonce, signer set, and signatures remain in the
lock transaction. `State` copies `hlo.md` into the escrow's optional `metadata`
field. Claim and refund preserve the metadata bytes and their presence without
evaluating them. A CrossDex-style application must verify its own policy and
external-chain conditions before relying on the native lock.

The stored representation and the state helper's decoded result differ when
metadata are absent:

| Lock input | Stored protobuf escrow | `escrowEntry.decode()` result |
| --- | --- | --- |
| `md` omitted | `metadata` omitted | `metadata: null` |
| `md` contains bytes | `metadata` contains the same bytes | `metadata` contains those bytes |

The `null` value is an output convention of the state helper, not a valid
metadata input. The low-level protobuf codec preserves field omission.

## V1 transport size checks

The partial transaction data limit is 3072 bytes
(`MAX_PARTIAL_TX_PAYLOAD_BYTE_SIZE`). The entire V1 message, including its
envelope, must fit within 4096 bytes (`V1_PROTOCOL_PAYLOAD_MAX_SIZE`).

The [transport regression tests](../tests/unit/network/protocols/validators/v1/htlcTransportLimits.test.js)
cover 1024 metadata bytes, eight signer public keys, eight authorizer signatures
(the locker plus seven cosigners), a non-zero surcharge and its recipient, and
validator completion. Requests use a 64-character message ID and the currently
advertised capabilities.

| Encoded data | Mainnet | Testnet | Limit |
| --- | ---: | ---: | ---: |
| Partial transaction | 2277 bytes | 2293 bytes | 3072 bytes |
| Complete transaction | 2445 bytes | 2465 bytes | Included in the response proof |
| V1 request | 2479 bytes | 2495 bytes | 4096 bytes |
| Largest response in the tested scenarios | 3450 bytes | 3470 bytes | 4096 bytes |

Response tests generate and verify real Hypercore publication proofs containing
Autobase-encoded transactions. They check every transaction in batches of up to
`BATCH_SIZE` (currently 10), at writer log lengths of 1, 1023, and 4095 blocks.
Proof sizes depend on the writer history and encoded block overhead; these
measurements do not establish an upper bound for every possible log or network
configuration.
