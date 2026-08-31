---
package: '@flighthq/storage'
role: package
crate: flighthq-storage
draft: false
lastDirection: 2026-08-29
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# storage — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Persistent storage over explicit Host facets. The synchronous key/value surface owns namespacing,
byte-size derivation, typed scalar and JSON helpers, no-partial bulk queries, progress-bearing mutation
batches, signals, and checkpointed schema migrations. Separate asynchronous bucket-policy commands use
`storage.persistenceQuery` and `storage.persistenceRequest`. Web supplies local/change plus Window
query/request and Worker query-only profiles; Electron supplies only a configured `storage.local`
factory. There is no ambient backend, sentinel, runtime capability probe, or quota API.

Every operation returns a method-tight reason envelope with `reason` as its sole discriminant. A mutation result of `{ reason: 'ok' }` promises that the new value is atomically visible through the provider and that any provider cache matches that visible value. It does not promise fsync or survival across sudden power loss.

## Decisions

- **[2026-08-29] Provider coverage determines the slots.** `storage.local` is Web + Electron; `storage.change` is Web only. Byte size is derived in core, not a provider slot.
- **[2026-08-29] Results preserve domain failures.** Reads distinguish an ordinary missing key (`value: null, reason: 'ok'`) from provider failure; queries return no partial payload on failure; mutation batches report completed work and the failed key.
- **[2026-08-29] Migration is resumable, not transactional.** All steps are validated before the version read, each successful callback is checkpointed immediately, callback exceptions propagate, and replay therefore requires idempotent callbacks. Earlier successful steps are not rolled back.
- **[2026-08-29] Change observation has an explicit lifetime.** `StorageSignals` and provider values are Entities. `attachStorage` retains the exact provider release, and `destroyStorage(host)` reaches the supplied `StorageChangeBackend.destroy()`.
- **[2026-08-30] Persistent bucket policy has query/request slots.** Query is available to Window and
  Worker profiles; request is Window only. Each call returns one snapshot containing independent
  bucket outcome and permission observation. `null` means the permission was not observed and never
  manufactures prompt. Web adapters use only injected functions and call `persist()` exactly once.
- **[2026-08-30] Bucket policy is not a broader storage claim.** Electron, Tauri, and Capacitor do not
  supply these slots. Quota, KV operations, IndexedDB, and OPFS remain outside the persistence-policy
  capability.
- **[2026-07-02] Signal opt-in convention applies.** Per the shared principles, signals (if any) should use `enable*Signals` gates rather than eager allocation. No package-specific exceptions.

## Open directions

- Whether an async storage path (IndexedDB, OPFS, native file-KV) belongs in a separate capability.
- Whether a future migration transaction primitive is justified in addition to the documented resumable checkpoint model.
