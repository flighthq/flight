# flight-buffer

Canonical shared binary vocabulary for Flight contracts:

- `ArrayBuffer` owns fixed-length bytes through shared identity.
- `ArrayBufferView` aliases a bounded byte range of the same buffer and records its exact JavaScript view kind.
- `Blob` is an immutable shared record carrying provider-owned opaque payload through canonical `Unknown`.

The crate performs no Blob I/O and no platform work.

## Precision

This crate has no floating-point values; `Float32Array` and `Float64Array` are view-kind names only.
