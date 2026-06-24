---
package: '@flighthq/storage'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - source
---

# storage — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/storage/` (source + tests), `incoming/builder-67dc46d64/head/packages/types/src/Storage*.ts` (types), and the bundle `changes.patch`. No prior `reviews/depth/storage.md` exists — this is the first survey, so the codebase-map AAA standard is the fallback rubric (the charter is a stub). Status doc claims are verified against source below.

## Verdict

**solid — 88/100.** A genuinely broad, well-shaped synchronous KV capability over the platform-suite backend seam: presence/count/entries, JSON convenience, typed scalar accessors, default-value reads, prefix namespacing, bulk ops, byte-size accounting, same-tab + cross-tab change signals, versioned migrations, and async quota estimation. Every export is sentinel-not-throw, `Readonly<T>`-correct, alphabetized, and colocated-tested (81 tests). It is short of the worker's self-estimated 95 mainly because two real seams are knowingly half-wired (bulk ops bypass signals; the `Signal.emit` method is used where the codebase's free-function `emitSignal` is the convention), the migration version key is an unenforced soft convention, and the `-formats` neighbor + Rust crate are absent. None of these is a defect of what shipped; they are honest edges. The status doc's claim list is accurate — every function it lists exists in source with the signature it states.

## Present capabilities

All in `storage.ts` (single file, 39 exported functions) unless noted; types in `@flighthq/types`.

**Backend seam.** `getStorageBackend` (lazy web default, never null), `setStorageBackend` (install native host backend; null restores web default), `createWebStorageBackend` (try/catch-guarded `localStorage` adapter; reads → `null`/`[]`, writes → `false` on denial). `StorageBackend` (`types/src/Storage.ts`) gained two optional members — `byteSize?()` and `subscribeChanges?()` — both additive, so prior backends stay valid. Verified.

**Core KV + ergonomics (Bronze).** `getStorageItem`/`setStorageItem`/`removeStorageItem`/`clearStorage`/ `getStorageKeys`, plus `hasStorageItem`, `getStorageItemCount`, `getStorageEntries`, `getStorageItemOr`, and JSON helpers `getStorageJSON`/`getStorageJSONOr`/`setStorageJSON` (parse/stringify failure → sentinel, never throws — corrupt data treated as expected-failure, per the design rule).

**Typed scalar accessors (Gold).** `getStorageBoolean`/`getStorageBooleanOr`/`setStorageBoolean` (`'true'`/`'false'`; unrecognized → null), `getStorageNumber`/`getStorageNumberOr`/`setStorageNumber` (`NaN` treated as parse failure). The scalar and JSON setters all route through the signal-aware `setStorageItem`, so they emit `onChange` when signals are enabled — verified in source.

**Namespacing (Silver).** `createStorageNamespace(prefix)` → `{ prefix }`; keys stored as `prefix + '.' + key`. `get/set/has/remove` namespaced variants plus `getNamespacedStorageKeys`/`getNamespacedStorageEntries`/ `getNamespacedStorageByteSize`/`clearStorageNamespace`. Unprefixing on read is correct (`slice(prefix.length)`).

**Bulk ops (Silver).** `setStorageItems(record)`, `getStorageItems(keys)` (parallel-indexed, null for absent), `removeStorageItems(keys)`. Write/remove return `false` if any element fails (partial mutation possible — documented).

**Byte accounting (Silver).** `getStorageByteSize` (delegates to `backend.byteSize()` when present, else `keys()+getItem()` enumeration at 2 bytes/UTF-16 code unit) and the namespaced variant.

**Change notification (Silver).** `enableStorageSignals`/`disableStorageSignals`/`getStorageSignals` over the `StorageSignals` entity (`{ onChange: Signal<(change) => void> }`). `enable*` is idempotent and wires the backend's `subscribeChanges` for cross-tab events; the web backend implements it over the DOM `storage` event. Same-tab writes synthesize `onChange` with `oldValue`/`newValue`. `setStorageBackend` correctly re-wires the cross-tab subscription when signals are active.

**Versioning (Gold).** `migrateStorage(namespace | null, migrations)` runs ascending-version steps from `stored+1`, persists the resulting version under reserved key `__flight_storage_version`, returns the new version or `-1` on any migration throw / write failure. Verified.

**Quota (Gold).** `getStorageQuotaEstimate(): Promise<StorageQuota | null>` bridges `navigator.storage.estimate()`; the only async export, clearly typed, best-effort, sentinel on absence.

**Types.** Six new files in `@flighthq/types`, one concept each, alphabetized in the barrel (lines 393–398): `StorageChange`, `StorageMigration`, `StorageNamespace`, `StorageQuota`, `StorageSignals`, plus the `Storage` (backend) update. Header-first convention honored.

**Tests.** `storage.test.ts`: 81 `it`s across 39 alphabetized `describe` blocks mirroring every export (verified one-to-one). `exports:check` will pass.

## Gaps

Measured against AAA completeness for a mature KV library (the charter is silent, so this is the fallback bar):

- **Bulk ops are not signal-aware.** `setStorageItems`, `removeStorageItems`, `clearStorageNamespace`, and `removeNamespacedStorageItem` call the backend directly and emit no `onChange`. A user with signals enabled gets per-key events from `setStorageItem` but silent batch writes — an asymmetry a listener must know about. The worker calls this a deliberate perf tradeoff (avoiding per-key `oldValue` reads) and documents it; it remains a real surface gap, not a bug. A `*Signaled` variant or a batch `StorageChange` (`key: null` already models "whole store" — a batch payload shape exists conceptually) would close it.
- **Migration version key is an unenforced soft reservation.** `__flight_storage_version` lives in the same keyspace as user data and is reported by `getStorageKeys`/`getStorageEntries`/`getStorageItemCount`/ `getStorageByteSize`. A namespace's migration version also appears in `getNamespacedStorage*` results. No filtering hides it. For a library claiming AAA polish, reserved bookkeeping leaking into enumeration is a visible seam.
- **No snapshot export/import.** `exportStorageSnapshot`/`importStorageSnapshot` (the `-formats` neighbor) is absent — deferred, reasonably, as a new package. This is the one clear _feature_ gap a mature store has (backup/restore/seed).
- **No `onStorageChange` flat subscribe convenience.** Subscribing requires `connectSignal(enableStorageSignals().onChange, listener)`. Other event-style packages expose the signals entity the same way, so this is consistent — but the convenience disposer wrapper the roadmap gestures at is unbuilt (and carries an open auto-enable design question).
- **No Rust `flighthq-storage` crate.** Intentionally deferred until the TS surface freezes; the divergences (native file-KV default under `native` feature, `StorageBackend` trait, `Signal<StorageChange>`) are noted in status but not yet in the conformance map.
- **`clearStorageNamespace` / `getNamespacedStorageByteSize` are full-keyspace scans.** O(n) over the whole store per call. Fine at expected sizes; a cached prefixed key-set would matter only under profiling. Noted, not pressing.

## Charter contradictions

None — the charter is a stub (only "What it is" seeded; North star / Boundaries / Decisions / Open directions all `TODO`). There is no stated principle to contradict. Every gap above is therefore a **candidate Open direction** (see below) rather than a violation.

## Contract & docs fit

Strong adherence, two minor convention drifts:

- **Types-first / header layer:** honored. All cross-package shapes in `@flighthq/types`, one per file, filename = type name, alphabetized barrel. ✓
- **Full unabbreviated names:** every function carries the full `Storage` / `NamespacedStorage` type word; globally self-identifying. ✓
- **Sentinels not throws:** uniform — `null`/`false`/`-1`/`[]`/`0` across the surface, try/catch around every host-boundary call. ✓
- **`Readonly<T>`:** applied to every object parameter (`Readonly<StorageNamespace>`, `Readonly<StorageChange>`, `Readonly<Record<…>>`, `readonly Readonly<StorageMigration>[]`). ✓
- **Single root export, `sideEffects: false`:** `index.ts` is a one-line `export * from './storage'`; manifest declares `sideEffects: false`. Module-level mutable state (`_backend`, `_signals`, `_signalsActive`, `_crossTabUnsubscribe`) is lazy/opt-in — no top-level side effect; signals stay inert until `enableStorageSignals`. Matches the "no shared top-level mutable state at import" rule. ✓
- **`enable*`/`disable*` signal-group convention:** matches the codebase-map's `enableDisplayObjectSignals` example exactly. ✓
- **Drift 1 — `Signal.emit` method vs `emitSignal` free function.** `_emitStorageChange` calls `_signals.onChange.emit(change)`. The sibling event package `network` uses the free function `emitSignal(net.onChange, status)` from `@flighthq/signals`. The free-function form is the functions-not-methods convention and — per `signals/src/slot.ts` — is the path that respects the cancellation/`nullSignalEmit` machinery; calling `.emit` directly is supported but off-convention. Candidate cleanup, low risk.
- **Drift 2 — async export in a "synchronous" capability.** `getStorageQuotaEstimate` returns a `Promise`, the lone async export in a package whose `StorageBackend` doc explicitly frames storage as synchronous. Justified (the underlying browser API is async) and well-typed, but it is a contract texture worth a charter note so a later agent does not "fix" it.

**Candidate doc revisions:** the Package Map line for `@flighthq/storage` ("synchronous persistent key/value (web backend over localStorage)") is now an undersell — it predates namespacing, migrations, change signals, and quota. Worth widening to reflect the realized surface. The `crate: flighthq-storage` front-matter in the charter implies a Rust mirror that does not yet exist; accurate as intent, but the conformance map should carry the three recorded divergences before the crate lands.

## Candidate open directions

The charter is silent on all of these; each is something this review had to assume to judge the package, so each is a question for the charter rather than an assumption to bake in:

1. **Signal-aware bulk ops — yes/no, and the payload shape.** Should `setStorageItems` / `clearStorageNamespace` emit? Per-key, or one batch `StorageChange`? This is the largest open semantic question; the current silence is a tradeoff the charter should bless or reject.
2. **Reserved-key policy.** Is `__flight_storage_version` (and any future bookkeeping) hidden from enumeration, namespaced under a reserved prefix the public reads filter out, or left visible as today? A North-star ruling here also settles whether migration metadata counts toward `byteSize`.
3. **`-formats` neighbor scope.** Is snapshot export/import in scope for `storage`, and is the `@flighthq/storage-formats` split (per the subject-triad fork) the intended home? Plain-data `StorageSnapshot` keeps parse weight out of core — but the plurality guard says split only on ≥2 formats; one JSON snapshot format may not yet justify the cell.
4. **Sync-with-one-async-exception, or a hard sync boundary.** Should quota estimation stay an async outlier, move behind the backend seam, or leave the package? Settles drift 2.
5. **`onStorageChange` convenience + auto-enable.** Add the flat disposer wrapper, and may it auto-enable signals (a cost-assumption the `enable*` convention otherwise makes explicit)?
6. **Migration ergonomics.** `StorageMigration.migrate(namespace)` takes the prefix string and calls storage functions ambiently — no transaction, no rollback on partial failure (a throw mid-sequence leaves earlier steps applied and returns `-1`). Is best-effort-forward acceptable, or is atomicity a goal? A mature migration system usually states this.
