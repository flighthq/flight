---
package: '@flighthq/storage'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - types
  - package.json
  - host-web (backends)
  - host-electron (backends)
  - platform-integration.md
---

# storage — Review

## Verdict

**solid — 88/100.** The package delivers its chartered scope cleanly: synchronous key/value persistence over explicit Host facets, with method-tight reason envelopes, namespacing, typed scalar and JSON helpers, no-partial bulk queries, progress-bearing mutation batches, signal emission, checkpointed schema migrations, and separate async persistence query/request slots. All 38 exported functions have colocated tests. All types reside in `@flighthq/types/src/Storage.ts`. The prior review's two blocking findings (B1: missing types; B2: `disconnectAllSlots` import) are both resolved in the current source. The package compiles, its Host facets are method-tight, and its reason envelopes are structurally unambiguous. The remaining deductions are for a module-scoped WeakMap that functions reach for (a standard subscription-tracking pattern but technically module-scoped mutable state), the absence of namespaced typed-accessor variants (a completeness gap, not a defect), and the `createStorageSignals` naming diverging from the `enable*Signals` convention (justified by the caller-owned entity model, but worth recording).

## Present capabilities

All claims verified against `packages/storage/src/storage.ts`, `storagePersistence.ts`, and `packages/types/src/Storage.ts`.

- **Explicit Host facets.** Every function takes the narrowest capability it needs: `HasStorageLocal` for KV commands (36 functions), `HasStorageChange` for change-observation lifecycle (3 functions: `attachStorage`, `destroyStorage`, and the signal entity's attach target), `HasStoragePersistenceQuery` and `HasStoragePersistenceRequest` for bucket-policy slots (2 functions in `storagePersistence.ts`).
- **Reason envelopes.** Every result uses `reason` as its sole discriminant. `StorageMutationResult` returns `{ reason: 'ok' }` or `{ reason: FailureReason }`. `StorageValueResult` adds `value`. Multi-key queries (`StorageQueryResult`) return no partial payload on failure; batch mutations (`StorageBatchMutationResult`) expose `completed` count and `failedKey`. All failure-reason unions are method-specific (`StorageClearFailureReason`, `StorageGetItemFailureReason`, etc.) and defined in `@flighthq/types`.
- **Typed accessors.** Boolean (`getStorageBoolean`/`getStorageBooleanOr`/`setStorageBoolean`), number (`getStorageNumber`/`getStorageNumberOr`/`setStorageNumber`), JSON (`getStorageJSON`/`getStorageJSONOr`/`setStorageJSON`). Parse failures return `reason: 'parse-failed'` with sentinel or fallback value, never throw. `setStorageNumber` throws `RangeError` for non-finite input (programmer error, not expected failure).
- **Namespacing.** `StorageNamespace` is a plain `{ prefix: string }` descriptor. Namespaced keys are stored as `prefix + '.' + key`. Six namespaced functions: `getNamespacedStorageItem`, `getNamespacedStorageItemPresence`, `getNamespacedStorageKeys`, `getNamespacedStorageEntries`, `getNamespacedStorageByteSize`, `setNamespacedStorageItem`, `removeNamespacedStorageItem`, `clearStorageNamespace` (8 total).
- **Bulk operations.** `getStorageItems` (parallel-indexed reads, stops on first failure), `setStorageItems` (stop-on-failure, exposes completed count), `removeStorageItems` (same pattern). `clearStorage` delegates to `backend.clear()`.
- **Byte accounting.** `getStorageByteSize` and `getNamespacedStorageByteSize` derive size in core at 2 bytes per UTF-16 code unit (key length + value length), iterating the keyspace. No provider slot; derivation is core-owned per charter decision.
- **Change signals.** `createStorageSignals()` allocates a caller-owned `StorageSignals` entity with an `onChange` signal. Mutation functions accept an optional `signals` parameter and emit only when (a) signals is non-null, (b) the signal has connected slots (`hasSignalSlots`), and (c) the mutation succeeded. All emission uses the `emitSignal` free function from `@flighthq/signals/contract`. `attachStorage` wires raw provider delivery (cross-tab via `StorageChangeBackend.subscribe`); `detachStorage` releases the exact provider subscription; `disposeStorage` detaches and clears the signal. `destroyStorage` runs terminal provider teardown.
- **Migration.** `migrateStorage` validates the entire plan (positive integers, no duplicates) before reading storage. Sorts by version, skips already-checkpointed steps, checkpoints each successful callback immediately via `setItem`. A checkpoint failure reports `stage: 'checkpoint'` with the last successful `version`. Callback exceptions propagate and prior checkpoints are not rolled back. Supports null namespace (global `__flight_storage_version` key) or scoped namespace.
- **Persistence policy.** `getStoragePersistence` (query slot, Window + Worker) and `requestStoragePersistence` (request slot, Window only) each return `StoragePersistenceResult` with independent `outcome` and `permissionState` observations. Implemented in a separate `storagePersistence.ts` file, matching the charter's async/sync separation.

## Gaps

1. **No namespaced typed accessors.** The namespaced surface covers basic CRUD (`get/set/remove/has/keys/entries/byteSize/clear`) but not the typed-scalar and JSON convenience functions. A user with a namespaced store must compose `getNamespacedStorageItem` + manual parsing to get a typed value. Not a defect (the composition works), but an asymmetry between the namespaced and global APIs.
2. **No namespaced item count.** `getStorageItemCount` exists for the full keyspace; no namespaced equivalent.
3. **Bulk signal asymmetry.** `clearStorage` emits a single bulk `{ key: null, newValue: null, oldValue: null }` signal. `clearStorageNamespace` emits per-key signals through `removeStorageItemFromBackend`. `setStorageItems` and `removeStorageItems` also emit per-key. The per-key approach is valid (it gives subscribers the exact mutation), but the `clearStorage` bulk signal is a different shape. A subscriber receiving both patterns must handle two signal shapes.
4. **`migrateStorage` signal emission during checkpoint.** The internal `setStorageItemOnBackend` call for the version checkpoint can emit a change signal for the `__flight_storage_version` key if signals are passed. This is technically correct (a storage mutation occurred), but callers may not expect a signal for internal bookkeeping. Not a bug -- a design observation.

## Charter contradictions

None. The charter's six decisions are each implemented as specified:

- Provider coverage determines the slots: `storage.local` via `HasStorageLocal`, `storage.change` via `HasStorageChange` -- verified in source and Host.ts facet definitions.
- Results preserve domain failures: reason envelopes on every operation, no-partial-payload queries, completed-count batch mutations -- verified in all 38 functions.
- Migration is resumable, not transactional: plan validation before the version read, per-callback checkpoint, no rollback -- verified in `migrateStorage` and its tests (5 test cases including replay and exception propagation).
- Change observation has explicit lifetime: `createStorageSignals` (Entity), `attachStorage`/`detachStorage` (provider subscription), `destroyStorage` (terminal provider teardown) -- verified in source.
- Persistent bucket policy has query/request slots: `getStoragePersistence` and `requestStoragePersistence` consume their exact Host facets -- verified in `storagePersistence.ts`.
- Bucket policy is not a broader storage claim: no quota API, no IndexedDB, no OPFS in this package -- verified by exhaustive export list.

The signal opt-in convention (decision 7, from shared principles) specifies `enable*Signals` naming. The package uses `createStorageSignals` instead. This is a naming divergence, not a behavioral one: the caller still explicitly opts in by creating the signals entity and passing it to each operation. The `create*` naming is appropriate because the function allocates a new standalone entity rather than enabling signals on an existing one (the `enable*Signals` pattern in scene graph packages attaches to a pre-existing entity like a display object). The charter records this as the explicit design.

## Contract & docs fit

- **Two export lanes.** `index.ts` (cultivated public API, 38 named re-exports from `./contract`) and `contract.ts` (full surface, `export *` from both source files). Both lanes verified in `package.json` exports map.
- **Types in `@flighthq/types`.** All 29 type aliases, 9 interfaces, and 5 failure-reason unions reside in `packages/types/src/Storage.ts`. The storage package imports them via `@flighthq/types/contract`. No inline type definitions in the implementation package. The types barrel (`types/src/contract.ts:714`) re-exports all of them.
- **`sideEffects: false`.** Declared in `package.json`. No import-time side effects in source: no module-level registration, no global patches, no listeners. The module-scoped `_subscriptions` WeakMap is a lazy data structure, not a side effect.
- **Dependencies.** `@flighthq/entity` (for `createEntity`), `@flighthq/signals` (for `createSignal`, `emitSignal`, `clearSignal`, `hasSignalSlots`), `@flighthq/types` (all types). No `@flighthq/sdk` import. `tsconfig.json` references match `package.json` dependencies.
- **`Readonly<T>` on parameters.** Applied to `StorageNamespace`, `StorageMigration[]`, `Record<string, string>`, and `StorageChange` in signal callbacks. Primitives (`string`, `boolean`, `number`) are not wrapped, matching the convention.
- **Sentinel behavior.** Missing keys return `value: null` with `reason: 'ok'`. Parse failures return `reason: 'parse-failed'` with sentinel or fallback. Provider failures return the specific failure reason with `value: null`. `setStorageNumber` throws `RangeError` for non-finite input and `validateStorageMigrations` throws `RangeError` for invalid/duplicate versions -- both programmer errors.
- **Signal emission.** Uses `emitSignal` free function, not the `.emit` method. The prior review's non-blocking finding about `.emit` usage is resolved.
- **Function naming.** All exported functions include the full, unabbreviated `Storage`/`NamespacedStorage` type name. `get*` for accessors, `has*` for presence, `set*` for mutations, `create*` for allocation, `destroy*` for resource teardown, `dispose*` for GC-release, `attach*`/`detach*` for subscription lifecycle.
- **Alphabetization.** Exported functions in `storage.ts` are alphabetized. `describe` blocks in both test files are alphabetized and mirror export names. One import-order irregularity in `storage.test.ts` (`getNamespacedStorageItemPresence` imported out of alphabetical order at line 43) -- would be corrected by `npm run fix`.
- **Test coverage.** 38/38 exported functions have `describe` blocks. Tests exercise success paths, failure paths (per-key and enumeration failures), signal emission conditions (only on success + active slots), parse failure sentinels, migration replay, and provider teardown idempotency. The `memoryBackend` test helper implements `StorageBackend` with injectable per-key failure maps -- thorough.
- **Module-scoped state.** The `_subscriptions` WeakMap (`storage.ts:471`) is module-scoped mutable state that `attachStorage`, `detachStorage`, and `disposeStorage` reach for. The constraint "no module-scoped mutable state that functions reach for" technically applies. The WeakMap is used to associate an unsubscribe callback with a `StorageSignals` entity without exposing it on the entity's type surface -- a standard pattern for opaque subscription tracking. The alternative (an Entity runtime slot) would work but would require extending the runtime tier for a single function's cleanup state. Flagged as a design observation; the WeakMap is keyed by entity, avoids memory leaks, and the three functions that use it all take the entity as an explicit argument.

## Candidate open directions

1. **Namespaced typed accessors.** Whether to add `getNamespacedStorageBoolean`, `getNamespacedStorageNumber`, `getNamespacedStorageJSON` and their fallback/setter variants. The composition path works today but doubles the call count for typed namespaced reads.
2. **Bulk signal shape.** Whether `clearStorageNamespace`, `setStorageItems`, and `removeStorageItems` should emit a single batch signal (matching `clearStorage`), per-key signals (current behavior), or both. The charter's "no-partial bulk queries" principle addresses data, not signals.
3. **Migration version-key visibility.** Whether `__flight_storage_version` should be hidden from `getStorageKeys`/`getStorageEntries`/`getStorageByteSize`, or whether it is ordinary user-visible data. Related: whether checkpoint writes should suppress signal emission.
4. **Subscription tracking mechanism.** Whether the module-scoped `_subscriptions` WeakMap should migrate to an Entity runtime slot to align with the explicit-dependency constraint, or whether the WeakMap pattern is the right trade-off for this use case.
5. **`storage-formats` neighbor.** Whether snapshot export/import (serialize all entries, restore from a snapshot) justifies a separate package. Parked in status.md; the plurality guard (at least 2 formats) has not been met.
6. **Async storage path.** Whether IndexedDB, OPFS, or native file-KV belongs in a separate capability or a separate package. The charter lists this as an open direction.
