---
package: '@flighthq/storage'
status: stub
score: 30
updated: 2026-06-25
ingested:
  - status.md
  - source
  - 'base=origin/main(eb73c3d74)'
  - 'evidence=integration-b2824e3d8 delta'
---

# storage — Review

> **Merge-gate review.** Baseline (approved, not under review): `incoming/integration-b2824e3d8/base/packages/storage/` = `origin/main` (`eb73c3d74`) — the 8-export synchronous KV floor. Candidate (judged): `incoming/integration-b2824e3d8/head/packages/storage/` = the integration branch (`b2824e3d8`). Delta = head vs base, plus the `packages/storage/` hunks of `changes.patch`. The charter is a stub, so the AAA codebase-map standard is the fallback rubric. This review **supersedes** the prior `solid — 88` survey, which was written against a _different_ bundle (`builder-67dc46d64`) where the supporting `@flighthq/types` change was present. In **this** integration bundle that type change is absent, which changes the verdict completely.

## Verdict

**stub / does-not-merge — 30/100.** The storage source delta is an excellent, broad KV surface in isolation (39 functions: presence/count/entries, JSON + typed-scalar accessors, default-value reads, prefix namespacing, bulk ops, byte-size accounting, same-tab + cross-tab change signals, versioned migrations, async quota). But **as integrated it does not compile**: the delta merged the source and test half (`packages/storage/` = 3 changed files) while its required `@flighthq/types` companion was dropped during integration (the `types` delta changed 8 files — `FontMetrics`, `GlyphExtents`, `Notification`, `RenderViewport2D`, `ShapedRun`, `SpritesheetFormat`, `TextShaper`, `index.ts` — and **not** `Storage.ts`). The head `types/src/Storage.ts` is byte-identical to base. Every type the new code imports (`StorageChange`, `StorageMigration`, `StorageNamespace`, `StorageQuota`, `StorageSignals`) is undefined anywhere in the head bundle, and the two `StorageBackend` members the code calls (`byteSize?`, `subscribeChanges?`) do not exist on the interface. A second, independent break: the delta imports `disconnectAllSlots` from `@flighthq/signals`, which exports the symbol as `disconnectAllSignals`. The work is good; the **integration is broken**, and the score reflects the integration state, not the builder's intent.

## Blocking findings (delta defects)

### B1 — The `@flighthq/types` Storage change is missing; the package does not typecheck

`b2824e3d8:packages/storage/src/storage.ts:1-9` imports five types from `@flighthq/types`:

```ts
import type {
  StorageBackend,
  StorageChange,
  StorageMigration,
  StorageNamespace,
  StorageQuota,
  StorageSignals,
} from '@flighthq/types';
```

In the head bundle, `incoming/integration-b2824e3d8/head/packages/types/src/Storage.ts` is **identical to base** and defines only `StorageBackend` (5 sync methods, no `byteSize`, no `subscribeChanges`). A whole-bundle search for `interface StorageSignals|StorageChange|StorageNamespace|StorageQuota|StorageMigration` (and the `type` forms) returns nothing; `grep byteSize|subscribeChanges packages/types/src/` returns nothing. The barrel still reads only `export * from './Storage'` (line 264, unchanged). So:

- `enableStorageSignals(): StorageSignals` (`storage.ts:126`) returns an undefined type.
- `migrateStorage(..., readonly Readonly<StorageMigration>[])` (`storage.ts:346`) names an undefined type.
- every `Readonly<StorageNamespace>` parameter (e.g. `getNamespacedStorageItem`, `storage.ts:174`) names an undefined type.
- `getStorageByteSize` calls `backend.byteSize()` (`storage.ts:213`) and `enableStorageSignals` calls `backend.subscribeChanges` (`storage.ts:131`) — members absent from the `StorageBackend` interface. `createWebStorageBackend` even _implements_ `subscribeChanges` (`storage.ts:97-104`), which the interface does not declare.

This is a hard `tsc -b` failure across most of the new surface, and it fails `exports:check` indirectly (the package will not build). **The fix is not in this package** — the integration must re-include the dropped `packages/types/src/Storage.ts` rewrite (the 5 new one-concept files / the `StorageBackend` extension with optional `byteSize?()` and `subscribeChanges?()`, plus their barrel exports) from the builder change this source half came from.

### B2 — `disconnectAllSlots` is not exported by `@flighthq/signals` (it is `disconnectAllSignals`)

`b2824e3d8:packages/storage/src/storage.ts:1`:

```ts
import { createSignal, disconnectAllSlots } from '@flighthq/signals';
```

The signals package exports `disconnectAllSignals` (`packages/signals/src/slot.ts:34`), not `disconnectAllSlots`; `disconnectAllSlots` appears in no signals export (`index.ts` re-exports `emitter`, `signal`, `slot`, `throttle`). The base storage imported nothing from signals, so **this dangling reference is introduced by the delta** — `disableStorageSignals` (`storage.ts:118`) calls it. Independent compile failure. (Context for the integration worker: `packages/loader/src/resourceLoader.ts:1` in this same bundle _also_ imports `disconnectAllSlots` while signals still exports `disconnectAllSignals` — suggesting a half-landed signals rename across the integration branch. Resolve at the signals seam: either rename the signals export to `disconnectAllSlots` and update all callers, or fix storage's import to `disconnectAllSignals`. Storage must not merge until its import resolves.)

## Present capabilities (source delta, judged in isolation)

These are real and well-shaped _as written_ — they are blocked only by B1/B2, not by their own design. Should the types land, this is a strong surface.

- **Backend seam (unchanged from base):** `getStorageBackend` (lazy web default, never null), `setStorageBackend` (null restores web default; re-wires the cross-tab subscription when signals are active), `createWebStorageBackend` (try/catch-guarded `localStorage`; reads → `null`/`[]`, writes → `false`). New code _assumes_ the seam grew `byteSize?`/`subscribeChanges?` — see B1.
- **Core KV + ergonomics:** `hasStorageItem`, `getStorageItemCount`, `getStorageEntries`, `getStorageItemOr`, JSON helpers `getStorageJSON`/`getStorageJSONOr`/`setStorageJSON` (parse/stringify failure → sentinel, never throws).
- **Typed scalars:** `get/set` Boolean and Number families (`NaN` → parse failure; unrecognized boolean → null). All setters route through the signal-aware `setStorageItem`.
- **Namespacing:** `createStorageNamespace(prefix)` → `{ prefix }`; `get/set/has/remove` namespaced variants + `getNamespacedStorageKeys`/`Entries`/`ByteSize` + `clearStorageNamespace`. Unprefix on read is correct (`slice(prefix.length)`).
- **Bulk ops:** `setStorageItems`/`getStorageItems`/`removeStorageItems` (parallel-indexed reads; partial mutation possible on failure — documented).
- **Byte accounting:** `getStorageByteSize` (+ namespaced) at 2 bytes/UTF-16 code unit, delegating to `backend.byteSize()` when present (blocked by B1).
- **Change signals:** `enableStorageSignals`/`disableStorageSignals`/`getStorageSignals` (idempotent enable; wires cross-tab via the DOM `storage` event; same-tab writes synthesize `onChange`) — blocked by B1 (`StorageSignals`) and B2 (`disconnectAllSlots`).
- **Versioning:** `migrateStorage(namespace | null, migrations)` — ascending steps from `stored+1`, persists `__flight_storage_version`, returns new version or `-1` on throw/write failure (blocked by B1: `StorageMigration`).
- **Quota:** `getStorageQuotaEstimate(): Promise<StorageQuota | null>` — lone async export, best-effort, sentinel on absence (blocked by B1: `StorageQuota`).

## Non-blocking findings (delta, would survive the type fix)

- **Convention drift — `Signal.emit` method over the `emitSignal` free function.** `_emitStorageChange` calls `_signals.onChange.emit(change)` (`storage.ts:469`). The codebase convention (and the sibling event package `network`) uses the free function `emitSignal(signal, ...args)` from `@flighthq/signals` — the functions-not-methods path that respects the cancellation / `nullSignalEmit` machinery. Direct `.emit` is supported but off-convention. Single-callsite, behavior-preserving swap. This is the _same_ low-risk cleanup the prior approved review flagged; it is not a merge-blocker.
- **Async outlier.** `getStorageQuotaEstimate` is the only `Promise`-returning export in a capability whose `StorageBackend` doc explicitly frames storage as synchronous. Justified (the browser API is async) and well-typed; flagged as a contract-texture decision for the charter, not a defect.
- **Full-keyspace scans.** `clearStorageNamespace` and `getNamespacedStorageByteSize` each scan the whole store O(n) per call. Fine at expected sizes; a within-package single-pass cleanup is the only sweep-safe tightening (a cached prefixed key-set is invalidation-coupled and parked).

## Charter contradictions

None — the charter is a stub (only "What it is" seeded; North star / Boundaries / Decisions / Open directions all `TODO`). There is no stated principle to contradict. The semantic gaps below are therefore candidate Open directions, not violations. The _merge_ objections (B1, B2) are not charter matters — they are build-correctness facts.

## Contract & docs fit

Where it compiles, adherence is strong: full unabbreviated `Storage`/`NamespacedStorage` names; uniform sentinels (`null`/`false`/`-1`/`[]`/`0`); `Readonly<T>` on every object parameter; single-line root barrel; `sideEffects: false`; lazy/opt-in module state (no import-time side effect); `enable*`/`disable*` signal-group convention matching `enableDisplayObjectSignals`. The two convention drifts are the `.emit` call and the async outlier above.

The one **contract-hygiene failure** is the types-first rule itself: the integration ships the _implementation_ of cross-package shapes (`StorageChange`, `StorageNamespace`, …) with no corresponding definition in `@flighthq/types`. The header layer must lead the implementation; here the implementation arrived orphaned. `package.json` correctly adds the `@flighthq/signals` dependency (`b2824e3d8:packages/storage/package.json:30`), so the dependency manifest is not the problem — the missing **type definitions** are.

**Candidate doc revision (parked, cross-doc):** the Package-Map line "synchronous persistent key/value (web backend over localStorage)" undersells the realized surface (namespacing, migrations, signals, quota) — but only once the surface actually builds.

## Candidate open directions

Charter-silent semantic questions surfaced by the surface (unchanged from the prior survey; each presupposes B1/B2 are fixed and the surface builds):

1. **Signal-aware bulk ops — yes/no, and payload shape.** `setStorageItems`/`removeStorageItems`/`clearStorageNamespace`/`removeNamespacedStorageItem` emit no `onChange`. Per-key vs. one batch `StorageChange` (`key: null` whole-store shape exists).
2. **Reserved-key policy** for `__flight_storage_version` — hide from enumeration / reserved prefix / leave visible; and whether migration metadata counts toward `byteSize`.
3. **`storage-formats` neighbor** — is snapshot export/import in scope, and does it justify a `-formats` cell under the plurality guard (≥2 formats)?
4. **Sync boundary vs. one async exception** — keep / relocate / drop `getStorageQuotaEstimate`.
5. **`onStorageChange` convenience + auto-enable** — flat disposer wrapper; may it auto-enable signals against the explicit-cost `enable*` convention?
6. **Migration atomicity** — best-effort-forward vs. rollback-on-partial-failure.
7. **Rust `flighthq-storage`** — record the native file-KV default + namespacing/JSON layer in the conformance divergence map before the crate lands.
