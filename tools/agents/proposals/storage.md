---
id: storage
title: '@flighthq/storage'
type: depth
target: storage
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/storage.md
  - tools/agents/docs/reviews/depth/storage.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 78/100. A faithful, well-shaped, complete localStorage replacement over the platform command-backend seam; missing only the conventional extensions (namespacing, typed/bulk helpers, presence/size introspection, change notification) that a mature synchronous KV library provides — all expressible over the existing `StorageBackend` without breaking the synchronous, plain-string contract.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that delivers 80% of the value: presence checking, a typed convenience layer, and bulk reads. None require a backend change — they layer over the existing `StorageBackend` — so they are pure additions in `@flighthq/storage` with no `@flighthq/types` work.

- `hasStorageItem(key): boolean` — canonical presence accessor (`getItem(key) !== null`), resolving the absent-vs-stored-empty conflation and matching the codebase `has*` rule. Mirrors `getStorageItem`/`removeStorageItem` naming.
- `getStorageItemCount(): number` — count of stored keys (`keys().length`), so callers don't allocate the key array just to count. Returns `0` on denial.
- `getStorageEntries(): readonly (readonly [string, string])[]` — all key/value pairs in one pass (`idb-keyval`'s `entries`). Returns `[]` on denial; skips keys that read back `null` (concurrent removal).
- Typed JSON convenience layer (thin, over the string seam):
  - `getStorageJSON<T>(key): T | null` — `JSON.parse` of the stored string; returns `null` on absent **or** parse failure (sentinel, not throw — corrupt stored data is an expected-failure surface).
  - `setStorageJSON<T>(key, value): boolean` — `JSON.stringify` + `setStorageItem`; returns `false` on denial/quota **and** on a stringify failure (cyclic value).
- Tests for each new function: distinct + denied-backend cases, JSON round-trip, corrupt-string parse-failure path, empty-store entries.

Effort: small (1 source file's worth of additions; no types changes). This alone moves the verdict toward the high end of "solid".

### Silver

Competitive with `localforage` / `idb-keyval` / Capacitor `Preferences`: namespacing (the single biggest gap), multi-key batch ops, size accounting, and cross-tab/state change notification via the suite's event-capability pattern. This tier touches `@flighthq/types` (header-layer first) and adds an `enable*` signal group.

- **Namespacing / prefix scoping** — the highest-value Silver item:
  - `createStorageNamespace(prefix): StorageNamespace` — a plain-data descriptor (not a stateful object): `{ prefix }` plus the prefix-scoped free functions key off it. Per Flight rules this is a value type + free functions, not a method-bearing instance.
  - Scoped free functions taking the namespace as first arg: `getNamespacedStorageItem(namespace, key)`, `setNamespacedStorageItem(namespace, key, value)`, `removeNamespacedStorageItem(namespace, key)`, `hasNamespacedStorageItem(namespace, key)`, `getNamespacedStorageKeys(namespace)` (returns _unprefixed_ keys), `clearStorageNamespace(namespace)` (removes only keys under the prefix — must enumerate-and-filter, never `clear()` the whole store).
  - `StorageNamespace` type defined in `@flighthq/types` first.
- **Batch / multi-key ops** (over the existing backend; loop the single-key ops, returning aggregate `boolean`):
  - `setStorageItems(record: Readonly<Record<string, string>>): boolean` — `false` if any write fails (partial writes are possible — document it).
  - `getStorageItems(keys: readonly string[]): readonly (string | null)[]` — parallel-indexed reads (`idb-keyval` `getMany`).
  - `removeStorageItems(keys: readonly string[]): boolean`.
- **Size / quota introspection**:
  - `getStorageByteSize(): number` — UTF-16 byte estimate summed over entries (the localStorage cost model); `-1` on denial.
  - `getNamespacedStorageByteSize(namespace): number`.
- **Change notification** — event-capability group (mirrors `@flighthq/network`/`@flighthq/power` shape; opt-in via `enable*` so the signal cost tree-shakes when unused):
  - `StorageChange` payload type in `@flighthq/types`: `{ key: string | null; oldValue: string | null; newValue: string | null }` (`key === null` = whole-store clear, mirroring the DOM `storage` event).
  - `enableStorageSignals(): StorageSignals` — installs the `window 'storage'` listener (cross-tab) in the web backend and wires same-tab writes to emit; idempotent. `disableStorageSignals()` detaches.
  - `onStorageChange(listener): () => void` over the group's signal (`@flighthq/signals`), returning an unsubscribe disposer.
  - Same-tab writes (`setStorageItem` etc.) must also emit when signals are enabled — the DOM event only fires cross-tab, so the web backend has to synthesize the same-tab notification.
- **Backend seam extension**: add `byteSize?` / change-subscription hooks to `StorageBackend` as **optional** members so native backends can provide native usage/notification, with the web backend supplying defaults. Keep them optional to preserve the minimal core contract.
- Cross-backend consistency notes: document that namespacing/batch/JSON are pure SDK-layer helpers (identical across any backend), while byte-size and change events are backend-assisted.

Effort: medium. Namespacing and the event group are the substantial pieces; batch/size are mechanical. Order namespacing first (most value), event group last (most surface).

### Gold

Authoritative synchronous-KV reference: exhaustive ergonomics, migration/versioning, a real native default story, the `-formats` neighbor for import/export, and 1:1 Rust-port parity.

- **Schema / versioning & migration** (the feature mature KV stores add for app upgrades):
  - `StorageMigration` type in `@flighthq/types` (`{ version: number; migrate(...) }`) and `migrateStorage(namespace, migrations): number` returning the resulting version. Stores a reserved `__version` key per namespace; runs ordered migrations once. Sentinel `-1` on failure.
- **Typed accessors beyond JSON**: `getStorageNumber`/`setStorageNumber`, `getStorageBoolean`/`setStorageBoolean` with explicit, documented coercion and sentinel defaults — so the common scalar cases avoid `JSON` overhead and ambiguity.
- **Default-value reads**: `getStorageItemOr(key, fallback)` / `getStorageJSONOr<T>(key, fallback)` — fallback-returning variants, the single most common app-level pattern.
- **`@flighthq/storage-formats` neighbor package** (the `-formats` importer/parser pattern): `exportStorageSnapshot(namespace?): StorageSnapshot` and `importStorageSnapshot(snapshot, options)` — serialize/restore a whole keyspace (backup, test fixtures, dev seeding, cross-device transfer). Plain-data snapshot type; keeps the parse/serialize weight out of the core package.
- **Quota estimation** beyond raw byte size: `getStorageQuotaEstimate(): StorageQuota | null` (`{ used; available }`), bridging `navigator.storage.estimate()` in the web backend (async source folded into a cached sync read or documented as best-effort sentinel when unavailable).
- **Full edge-case + error coverage**: quota-exceeded partial-batch semantics, namespace-prefix collision rules, concurrent cross-tab mutation under signals, `JSON` reviver/replacer hooks, key-length limits, and explicit behavior when `setStorageBackend(null)` swaps mid-session with signals enabled (re-attach listeners).
- **Performance**: avoid re-enumerating the full keyspace per namespaced op (cache the prefix scan / invalidate on writes via the change signal); single-pass `getStorageEntries`/`getStorageByteSize`.
- **Docs**: a package README covering the seam, namespacing model, the enable-signals opt-in, and the JSON/versioning helpers; functional/integration coverage of cross-tab notification where the harness allows.
- **Rust-port parity — `flighthq-storage` crate**:
  - Mirror every TS export as snake_case free functions (`get_storage_item`, `has_storage_item`, `set_storage_json`, `create_storage_namespace`, …).
  - `StorageBackend` trait in `flighthq-types`; **native default backend in-crate** behind the `native` cargo feature (file-backed KV, per the Rust host-layer rule — TS has web-default, Rust has native-default).
  - `StorageNamespace`, `StorageChange`, `StorageMigration`, `StorageSnapshot` value types; `Option`/`bool`/`-1` sentinels matching TS; `Signal<StorageChange>` for the event group.
  - Record the namespacing/JSON-helper layer and the native-default-backend flip in the conformance divergence map.

Effort: large, but each item is independently shippable. Migration/versioning and the `-formats` neighbor are the genuine frontier; the Rust crate is a mechanical mirror once the TS surface is frozen.

## Sequencing & effort

Recommended order (each builds on the last; nothing here forces a contract break):

1. **Bronze, in-package, no types changes** — `hasStorageItem`, `getStorageItemCount`, `getStorageEntries`, `getStorageJSON`/`setStorageJSON`. Pure additions; ship first for immediate value. Run `npm run exports:check` (every new export needs a colocated test) and `npm run order` (keep alphabetized).
2. **Silver namespacing** — define `StorageNamespace` in `@flighthq/types` **first** (header-layer rule), then the `*Namespaced*` free functions. Highest-value Silver item; depends only on the existing backend.
3. **Silver batch + size** — `setStorageItems`/`getStorageItems`/`removeStorageItems`, `getStorageByteSize`. Mechanical; depends on nothing new beyond the backend.
4. **Silver change notification** — depends on `@flighthq/signals` (the `enable*` group pattern) and the `StorageChange` type in `@flighthq/types`. Build last in Silver: it adds the most surface and is the only piece requiring same-tab-emit synthesis in the web backend. Mirror `@flighthq/network`/`@flighthq/power` event-capability shape exactly.
5. **Gold** — versioning/migration → typed scalar + `*Or` accessors → quota estimate → `@flighthq/storage-formats` neighbor → Rust `flighthq-storage`. The Rust mirror should follow only after the TS surface is frozen at Gold.

Dependencies on other packages / types:

- `@flighthq/types`: add `StorageNamespace` (Silver), `StorageChange` (Silver), `StorageMigration` + `StorageSnapshot` + `StorageQuota` (Gold), and optional `StorageBackend` members for byte-size/subscription (Silver). Header layer first, every tier.
- `@flighthq/signals`: required for the `enableStorageSignals`/`onStorageChange` group (Silver step 4).
- `@flighthq/storage-formats`: new neighbor package (Gold) following the `-formats` pattern — copy a nearby package shape, run `npm run packages:check`.

Cross-package / design-decision items to surface (do not decide autonomously):

- **Optional vs required `StorageBackend` extensions.** Adding byte-size/subscription to the seam affects every host backend (`host-electron`, future native). Recommend keeping them **optional** with web-backend defaults so existing backends stay valid; confirm before changing the core interface shape.
- **Same-tab change emission.** The DOM `storage` event is cross-tab only; synthesizing same-tab notifications means write functions must know whether signals are enabled. Confirm this coupling (web backend emits on write) is acceptable, since it slightly thickens the otherwise-pure write path — gated behind `enableStorageSignals` so it stays zero-cost when unused.
- **Reserved key namespace.** Migration versioning needs a reserved key (`__version`) per namespace; agree the reserved-prefix convention so it can't collide with user keys.
- **Rust native-default backend** is a deliberate TS↔Rust divergence (TS web-default, Rust native-default) — record it in the conformance map rather than treating it as a bug.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/storage` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
