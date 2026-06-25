---
package: '@flighthq/storage'
updated: 2026-06-25
basedOn: ./review.md
---

# storage — Assessment

Sorted from `review.md` (merge-gate verdict `stub / does-not-merge — 30`, judging the `integration-b2824e3d8` delta against the approved `origin/main` (`eb73c3d74`) floor). The delta is a strong KV surface that, as integrated, **does not compile**: its `@flighthq/types` companion was dropped (B1) and it imports a non-existent signals symbol (B2). Those two are not "within-package sweeps" you may take autonomously — B1's fix lives in `@flighthq/types` and B2's lives at the `@flighthq/signals` seam (a half-landed rename), both cross-package. They go to the integration dispatch brief (`outgoing/integration/storage.md`), not into Recommended. The charter is still a full stub, so "what good means" past the AAA fallback is itself undecided, keeping Recommended to the two genuinely sweep-safe, in-package, build-independent cleanups.

## Recommended

Strictly sweep-safe: within `@flighthq/storage`, no cross-package coupling, no breaking change, no open design decision. **Note:** these only become testable once the cross-package blockers (B1, B2 — see the dispatch brief) are resolved and the package builds; do them in the same pass that unblocks it.

- **Drift 1 — route `_emitStorageChange` through the `emitSignal` free function.** `storage.ts:469` calls `_signals.onChange.emit(change)` directly; the convention (and sibling `network`) uses `emitSignal(signal, ...args)` from `@flighthq/signals` — the functions-not-methods path that respects the cancellation / `nullSignalEmit` machinery. Single-callsite, behavior-preserving. — review.md (Non-blocking findings; Contract & docs fit).
- **Single-pass the namespaced full-keyspace scans, within current behavior.** `clearStorageNamespace` and `getNamespacedStorageByteSize` each scan the whole store O(n) per call. A within-package single-enumeration tightening (no caching, no API change) that preserves semantics — distinct from the cached prefixed key-set (parked, invalidation-coupled). Pin post-cleanup byte-size + key-set with a colocated test. — review.md (Non-blocking findings: full-keyspace scans).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **B1 — missing `@flighthq/types` Storage change (does-not-compile).** **Parked here / routed to dispatch:** the fix is in `@flighthq/types` (re-include the 5 new one-concept files + the `StorageBackend` `byteSize?`/`subscribeChanges?` extension + barrel exports), not in this package cell. It is a merge-blocker, so it is the headline MUST-FIX in `outgoing/integration/storage.md`, not a within-package Recommended item.
- **B2 — `disconnectAllSlots` not exported by `@flighthq/signals`.** **Parked here / routed to dispatch:** a half-landed signals rename (`disconnectAllSignals` is the actual export; `loader` imports the same wrong name). Resolution lives at the signals seam and spans callers — cross-package. MUST-FIX in the dispatch brief.
- **Signal-aware bulk ops** (`setStorageItems`/`removeStorageItems`/`clearStorageNamespace`/`removeNamespacedStorageItem` emit no `onChange`). **Parked:** the largest open semantic question — emit or not, per-key vs. one batch `StorageChange`. A North-star ruling, not a sweep. Routed to Open directions.
- **Reserved-key policy for `__flight_storage_version`.** Leaks into `getStorageKeys`/`Entries`/`ItemCount`/`ByteSize` and the namespaced variants. **Parked:** hiding it is a visible behavior change that also settles whether migration metadata counts toward `byteSize` — a charter decision. Routed to Open directions.
- **`@flighthq/storage-formats` neighbor — `exportStorageSnapshot`/`importStorageSnapshot`.** **Parked:** cross-package `-formats` cell gated by the plurality guard (≥2 formats) — one JSON snapshot may not justify the cell. Routed to Open directions.
- **`onStorageChange` flat subscribe convenience.** **Parked:** carries an open auto-enable design question (may a convenience auto-enable signals against the explicit-cost `enable*` convention?). Routed to Open directions.
- **Migration atomicity / rollback.** `migrateStorage` is best-effort-forward (throw mid-sequence leaves earlier steps applied, returns `-1`). **Parked:** transactional reshape is larger than a sweep and a charter ruling. Routed to Open directions.
- **`getStorageQuotaEstimate` async outlier.** Lone async export in a sync-framed package. **Parked:** a contract-texture decision (keep / relocate behind the seam / drop). Routed to Open directions.
- **Cached prefixed key-set for namespaced ops.** **Parked:** invalidation-coupled to the change signal — a representation decision tied to the bulk-ops / reserved-key resolutions. Larger than the single-pass cleanup above.
- **Rust `flighthq-storage` crate.** **Parked:** deferred until the TS surface freezes; the three divergences (native file-KV default under `native`, `StorageBackend` trait, `Signal<StorageChange>`) must land in the conformance map first; `crate: flighthq-storage` front matter currently implies a mirror that does not exist.
- **Widen the Package-Map line for `@flighthq/storage`.** **Parked:** the edit lives in `tools/agents/docs/index.md` (codebase-map owner), and only after the surface builds.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a full stub, so the first need is to author North star and Boundaries — every item below presupposes that bar exists **and** that the merge blockers (B1, B2) are resolved so the surface compiles.

1. **North star / Boundaries** — author them (the AAA synchronous-KV bar, the sync-string-in/string-out contract, the platform-suite backend-seam shape). Every fork below resolves against this bar.
2. **Signal-aware bulk ops — yes/no, and payload shape** (per-key vs. one batch `StorageChange`). The largest open semantic question.
3. **Reserved-key policy** for `__flight_storage_version`, and whether migration metadata counts toward `byteSize`.
4. **`storage-formats` neighbor scope** — snapshot export/import; run the plurality guard.
5. **Sync boundary vs. one async exception** — keep / relocate / drop `getStorageQuotaEstimate`.
6. **`onStorageChange` convenience + auto-enable.**
7. **Migration ergonomics — atomicity** vs. best-effort-forward.
8. **Rust divergences + conformance map** before `flighthq-storage` lands.
