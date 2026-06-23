# Depth Review: @flighthq/storage

**Domain**: Synchronous persistent key/value storage (a `localStorage`-shaped capability over a swappable web/native backend), part of the platform-integration suite.

**Verdict**: solid — 78/100

The package map scopes this capability narrowly and precisely: "synchronous persistent key/value (web backend over localStorage)." Judged against that canonical seam — not against a general-purpose database — the package covers the full `Storage` interface surface and the backend-seam pattern used by the rest of the platform suite. It is small by design, not by omission. It loses points only where a mature key/value capability would reasonably extend (namespacing, change notification, byte/size accounting) without breaking the synchronous, plain-string contract.

## Present capabilities

The complete `web Storage`-equivalent CRUD surface plus the platform backend seam:

- `getStorageItem(key): string | null` — read, null sentinel on absent/denied.
- `setStorageItem(key, value): boolean` — write, false on denied/quota.
- `removeStorageItem(key): boolean` — delete one key.
- `clearStorage(): boolean` — remove all keys.
- `getStorageKeys(): string[]` — enumerate keys (the abstraction over `localStorage.length` + `key(i)`); `[]` on denial.
- `createWebStorageBackend(): StorageBackend` — the lazily-installed default; each operation try/catch-guarded for private-mode / disabled-storage / quota failure, returning sentinels (`null`/`false`/`[]`) rather than throwing.
- `getStorageBackend()` / `setStorageBackend(backend | null)` — the swap seam; `null` restores the web default. Always a live backend ("there is always a backend").

This matches the suite's "command capability" shape exactly (`get*Backend`/`set*Backend`/`createWeb*Backend` + flat free functions), and the sentinel-not-throw discipline is applied consistently. Storage is correctly modeled as synchronous (returns values, not Promises), which is the right call for the localStorage-shaped contract and a deliberate divergence from async OPFS-style APIs. The `StorageBackend` interface lives in `@flighthq/types` per the header-layer rule.

## Gaps vs an authoritative key/value-storage library

These are the capabilities a mature, industry-recognized synchronous KV library is expected to provide. Most are missing-by-omission within the package's stated scope (an extension of the same seam, not a contradiction of it):

- **No namespacing / prefix scoping.** `localforage`, `idb-keyval` instances, and Capacitor `Preferences` all support named stores or key prefixes so two features don't collide in one global keyspace. There is no `createStorageNamespace(prefix)` or scoped read/write here. This is the single biggest gap for a "robust" KV library — the global flat keyspace is the raw `localStorage` model with no isolation.
- **No typed/JSON convenience layer.** Everything is `string`-in/`string`-out. A canonical KV library offers `getStorageJSON<T>` / `setStorageJSON` (or number/boolean coercions) so callers don't hand-roll `JSON.parse(getStorageItem(...) ?? 'null')` at every callsite. The plain-string seam is correct for the backend; a thin typed helper layer over it is conventional and absent.
- **No `hasStorageItem(key): boolean`.** Presence-checking via `getStorageItem(key) !== null` works but conflates "absent" with "stored null/empty"; a dedicated `has*` is the canonical accessor (and matches the codebase's own `has*`/`is*` naming rule).
- **No change notification.** The DOM `storage` event (cross-tab sync) and most KV libraries' subscribe/watch hooks have no analogue. There is no `onStorageChange` signal even though the suite has an established event-capability pattern. For a UI SDK, cross-tab/state-change observation is a reasonable expectation; its absence is a real depth gap.
- **No size / quota introspection.** No `getStorageByteSize()`, `getStorageItemCount()` (callers must `getStorageKeys().length`), or quota estimate. Mature stores expose usage to let apps manage the quota that `setItem` can fail on.
- **No entries/values bulk reads or multi-key ops.** `getStorageKeys()` exists but there is no `getStorageEntries(): [string, string][]`, batch `setStorageItems(record)`, or `removeStorageItems(keys)`. Industry KV APIs (`idb-keyval`'s `entries`/`setMany`/`getMany`) provide these.
- **No default native backend in-crate (Rust note).** Within TS this is correct (web default only). Worth noting against the Rust port's stated "native default in-crate behind a `native` feature" rule — out of scope for this TS review but the seam is the right shape to support it.

Nothing here requires breaking the synchronous, plain-data contract — namespacing, `has*`, JSON helpers, entries, byte size, and a change signal are all expressible over the existing `StorageBackend` (or as a thin layer above it).

## Naming / API-shape notes

- Names are canonical and fully self-identifying: every function carries the `Storage` type word (`getStorageItem`, not `getItem`), per the unabbreviated-naming rule. Exports are alphabetized.
- The seam trio (`getStorageBackend` / `setStorageBackend` / `createWebStorageBackend`) matches the platform suite's command-capability convention exactly — good cross-package symmetry.
- The `StorageBackend` interface mirrors the web `Storage` shape but improves on it: `keys()` returns an array instead of the awkward `length`+`key(i)` index protocol, and writes return `boolean` so callers can react to quota/denial. This is a deliberate, well-judged redesign rather than a 1:1 mirror.
- Sentinel discipline is consistent and documented inline (the comments correctly justify try/catch as private-mode/quota handling, not invariant guarding).
- One minor naming asymmetry to flag if `has*` is added: keep it `hasStorageItem` to mirror `getStorageItem`/`removeStorageItem`.

## Recommendation

Keep the verdict at **solid**. The package is a faithful, well-shaped, complete implementation of the _narrow_ capability the map describes, and it is missing nothing required to be a correct localStorage replacement. To reach **authoritative** for the broader KV-storage domain, add, within the same synchronous plain-data seam: (1) key namespacing/prefix scoping — the highest-value gap; (2) `hasStorageItem`; (3) a typed JSON convenience layer (`getStorageJSON`/`setStorageJSON`); (4) bulk reads (`getStorageEntries`) and multi-key ops; (5) size/count introspection (`getStorageByteSize`, `getStorageItemCount`); and (6) an `onStorageChange` event capability using the suite's existing event-capability pattern. All six are extensions of the current backend, not departures from it.
