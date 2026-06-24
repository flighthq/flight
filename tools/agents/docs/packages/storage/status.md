---
package: '@flighthq/storage'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# storage — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/storage

**Session date**: 2026-06-24 **Previous score**: 78/100 (solid) **Estimated new score**: 95/100 (authoritative)

## Implemented APIs

### Types added to `@flighthq/types`

- `StorageChange` (`StorageChange.ts`) — change event payload; `key: string | null` (null = whole-store clear), `oldValue`, `newValue`.
- `StorageMigration` (`StorageMigration.ts`) — versioned migration step: `{ version: number; migrate(namespace: string | null): void }`.
- `StorageNamespace` (`StorageNamespace.ts`) — prefix-scoped view: `{ prefix: string }`.
- `StorageQuota` (`StorageQuota.ts`) — quota estimate: `{ used: number; available: number }`.
- `StorageSignals` (`StorageSignals.ts`) — signals entity: `{ onChange: Signal<(change: StorageChange) => void> }`.
- `StorageBackend` updated — added optional `byteSize?(): number` and `subscribeChanges?()` members (fully optional; existing backends stay valid).

All new type files follow the one-concept-per-file convention and are exported from `@flighthq/types/src/index.ts` in alphabetical position.

### New exported functions in `@flighthq/storage`

**Bronze (presence, count, entries, JSON):**

- `hasStorageItem(key): boolean`
- `getStorageItemCount(): number`
- `getStorageEntries(): readonly (readonly [string, string])[]`
- `getStorageJSON<T>(key): T | null`
- `getStorageJSONOr<T>(key, fallback): T`
- `setStorageJSON<T>(key, value): boolean`

**Silver — namespacing:**

- `createStorageNamespace(prefix): StorageNamespace`
- `getNamespacedStorageItem(namespace, key): string | null`
- `setNamespacedStorageItem(namespace, key, value): boolean`
- `removeNamespacedStorageItem(namespace, key): boolean`
- `hasNamespacedStorageItem(namespace, key): boolean`
- `getNamespacedStorageKeys(namespace): string[]`
- `getNamespacedStorageEntries(namespace): readonly (readonly [string, string])[]`
- `clearStorageNamespace(namespace): boolean`

**Silver — batch ops:**

- `setStorageItems(record): boolean`
- `getStorageItems(keys): readonly (string | null)[]`
- `removeStorageItems(keys): boolean`

**Silver — size introspection:**

- `getStorageByteSize(): number`
- `getStorageItemOr(key, fallback): string`
- `getNamespacedStorageByteSize(namespace): number`

**Silver — change notification:**

- `enableStorageSignals(): StorageSignals`
- `disableStorageSignals(): void`
- `getStorageSignals(): StorageSignals | null`
- `setStorageItem`, `removeStorageItem`, `clearStorage` — emit `onChange` when signals are enabled (same-tab synthesis)
- `createWebStorageBackend` — now implements `subscribeChanges` (DOM `storage` event, cross-tab)
- `setStorageBackend` — re-wires cross-tab subscription when signals are active

**Gold — typed scalar accessors:**

- `getStorageBoolean(key): boolean | null`
- `getStorageBooleanOr(key, fallback): boolean`
- `setStorageBoolean(key, value): boolean`
- `getStorageNumber(key): number | null`
- `getStorageNumberOr(key, fallback): number`
- `setStorageNumber(key, value): boolean`

**Gold — default-value reads:**

- `getStorageItemOr(key, fallback): string` (added in Silver size tier, logically Gold ergonomics)

**Gold — versioning/migration:**

- `migrateStorage(namespace, migrations): number` — runs ordered versioned migrations, stores `__flight_storage_version` per namespace

**Gold — quota estimation:**

- `getStorageQuotaEstimate(): Promise<StorageQuota | null>` — bridges `navigator.storage.estimate()`, async, best-effort

### Dependency added

- `@flighthq/signals` added as a runtime dependency in `packages/storage/package.json`.

### Test coverage

- 81 tests, all passing.
- Every new exported function has at least one test; full distinct + sentinel + edge-case coverage.

## Deferred items and why

### `@flighthq/storage-formats` neighbor package

The Gold roadmap calls for `exportStorageSnapshot`/`importStorageSnapshot` in a `-formats` neighbor package. Deferred because: (1) it is a new package, requiring `packages:check` validation of the new manifest and cross-package plumbing; (2) the scope is self-contained and independently shippable; (3) no existing package work depends on it. Suggestion: copy shape from `@flighthq/spritesheet-formats` and add in a follow-on session.

### `onStorageChange(listener): () => void` convenience function

The roadmap mentions a flat convenience wrapper that returns an unsubscribe disposer (hiding `connectSignal`). Not added because: the SDK exposes `connectSignal` from `@flighthq/signals` as the canonical way to subscribe, and a redundant wrapper buys little over `connectSignal(getStorageSignals().onChange, listener)`. It also introduces a subtle API question — should it auto-enable signals? Deferred pending a design decision on whether auto-enable is acceptable.

### Cross-tab notification for `removeStorageItem` and `setStorageItem` with `setStorageItems`

`setStorageItems` calls the backend directly (bypassing the signal-aware `setStorageItem`) to avoid repeated reads of `oldValue`. This means `setStorageItems` and `clearStorageNamespace`/`removeNamespacedStorageItem` do not emit `onChange`. This is intentional and documented: bulk ops are not signal-aware — callers who need change events on bulk ops should call the individual signal-aware functions. If needed, making bulk ops signal-aware is a future enhancement.

### Rust `flighthq-storage` crate

Deferred per the Rust port rule: "The Rust mirror should follow only after the TS surface is frozen at Gold." The TS surface is now at Gold; the Rust port is the natural next step for a subsequent Rust-focused session. Key divergences to record in the conformance map: (1) native-default backend (file-backed KV) under `native` cargo feature; (2) `StorageBackend` as a trait; (3) `Signal<StorageChange>` via `flighthq-signals`.

### Reserved key convention for migrations

`migrateStorage` uses `__flight_storage_version` as the version key per namespace. This is a convention choice. If a future session decides on a different reserved-prefix convention, this key should be updated. Noted here rather than surfaced to the user as a breaking change since this is pre-release.

## Concerns / surprises

- **`setStorageItems` bypasses signal emission**: the batch write path calls `backend.setItem` directly rather than through the signal-aware `setStorageItem`, so `onChange` is not emitted per-key during batch writes. This is a conscious tradeoff (reading `oldValue` per key in batch ops is wasteful) and is documented. If signal-aware batch writes are needed, callers should loop `setStorageItem`.
- **`getStorageQuotaEstimate` is async**: this is a Gold-tier function that departs from the otherwise synchronous contract of the package. It is the only async export. The `navigator.storage.estimate()` API is inherently async; a sync wrapper would require polling or caching, both of which add complexity. The function is clearly typed `Promise<StorageQuota | null>` and does not break tree-shaking.
- **`migrateStorage` with a `null` namespace uses the global keyspace** but cannot distinguish between "user wrote a key called `__flight_storage_version`" and the migration version key. The convention is documented in the function's JSDoc comment; the reserved-prefix convention (`__flight_storage_version`) is a soft reservation (no enforcement) consistent with the pre-release posture.

## Suggestions for future sessions

1. **`@flighthq/storage-formats`**: add `exportStorageSnapshot(namespace?): StorageSnapshot` and `importStorageSnapshot(snapshot, options?)`. Snapshot is plain data (JSON-serializable object). Keep parse/serialize weight out of the core package.
2. **Signal-aware `setStorageItems`**: if callers need `onChange` per key during batch writes, add a `setStorageItemsSignaled` variant (or document the loop pattern). The current `setStorageItems` is intentionally fast.
3. **`onStorageChange` convenience**: `onStorageChange(listener): () => void` wrapper over `connectSignal(enableStorageSignals().onChange, listener)` — auto-enables signals, returns unsubscribe. Decide whether auto-enable is acceptable before adding.
4. **Rust `flighthq-storage`**: mirror all TS exports as snake_case free functions; `StorageBackend` trait; `native` feature for file-backed KV default; record divergences in the conformance map.
5. **Performance** — `clearStorageNamespace` and `getNamespacedStorageByteSize` both enumerate the full keyspace. If a namespace is expected to be large, a cached key-set (invalidated on writes) would improve performance. Deferred until profiling shows it matters.

## Estimated score

**95/100** — authoritative. The package now covers the full synchronous KV-storage domain: presence/count, JSON convenience, typed scalar accessors, default-value fallbacks, namespacing, bulk ops, byte-size accounting, cross-tab and same-tab change notification, versioned migrations, and quota estimation. The only Gold items not yet implemented are the `-formats` neighbor package (a new package, not an API gap) and the Rust port (intentionally follows frozen TS surface). All existing conventions are preserved: sentinel-not-throw, `Readonly<T>` everywhere, alphabetized exports, colocated tests, `sideEffects: false`.
