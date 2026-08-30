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

Synchronous persistent key/value storage over an explicit `HasStorageLocal` Host facet. The core package owns namespacing, byte-size derivation, typed scalar and JSON helpers, no-partial bulk queries, progress-bearing mutation batches, signals, and checkpointed schema migrations. Providers own only the five primitive storage operations; Web supplies the `storage.local` and `storage.change` slots, while Electron supplies a configured `storage.local` factory. There is no ambient backend, sentinel, runtime capability probe, or quota API.

Every operation returns a method-tight reason envelope with `reason` as its sole discriminant. A mutation result of `{ reason: 'ok' }` promises that the new value is atomically visible through the provider and that any provider cache matches that visible value. It does not promise fsync or survival across sudden power loss.

## Decisions

- **[2026-08-29] Provider coverage determines the slots.** `storage.local` is Web + Electron; `storage.change` is Web only. Byte size is derived in core, not a provider slot.
- **[2026-08-29] Results preserve domain failures.** Reads distinguish an ordinary missing key (`value: null, reason: 'ok'`) from provider failure; queries return no partial payload on failure; mutation batches report completed work and the failed key.
- **[2026-08-29] Migration is resumable, not transactional.** All steps are validated before the version read, each successful callback is checkpointed immediately, callback exceptions propagate, and replay therefore requires idempotent callbacks. Earlier successful steps are not rolled back.
- **[2026-08-29] Change observation has an explicit lifetime.** `StorageSignals` and provider values are Entities. `attachStorage` retains the exact provider release, and `destroyStorage(host)` reaches the supplied `StorageChangeBackend.destroy()`.

## Open directions

- Whether an async storage path (IndexedDB, OPFS, native file-KV) belongs in a separate capability.
- Whether a future migration transaction primitive is justified in addition to the documented resumable checkpoint model.
