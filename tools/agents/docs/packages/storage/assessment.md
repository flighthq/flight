---
package: '@flighthq/storage'
updated: 2026-06-24
basedOn: ./review.md
---

# storage — Assessment

Sorted from `review.md` (score `solid — 88`) and the prior `reviews/maturation/depth/storage.md` roadmap (Bronze and most of Silver/Gold already shipped — the roadmap is now largely absorbed; what remains are its Gold frontier items and the review's honest edges). The charter is a stub — North star, Boundaries, Decisions, and Open directions are all `TODO` — so "what good means here" past the AAA fallback is itself undecided. That keeps `Recommended` deliberately small: the genuinely sweep-safe items are one convention drift and one low-risk perf cleanup. Every remaining gap is either a charter semantic decision (signal-aware bulk ops, reserved-key policy, the async outlier) or crosses a package boundary (`-formats` neighbor, the Rust crate, the Package-Map line), so it is routed to Backlog and the closing Open-directions notes rather than into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/storage`, no cross-package coupling, no breaking change, no open design decision.

- **Drift 1 — route `_emitStorageChange` through the `emitSignal` free function.** `_emitStorageChange` calls `_signals.onChange.emit(change)` directly; the sibling event package `network` uses `emitSignal(net.onChange, status)` from `@flighthq/signals`. The free-function form is the functions-not-methods convention and (per `signals/src/slot.ts`) is the path that respects the cancellation / `nullSignalEmit` machinery — calling `.emit` directly is supported but off-convention. An in-package, behavior-preserving swap at a single callsite. — review.md (Contract & docs fit, Drift 1).

- **Single-pass the namespaced full-keyspace scans, within current behavior.** `clearStorageNamespace` and `getNamespacedStorageByteSize` each do an O(n) scan over the whole store per call. This is a within-package micro-optimization (one enumeration pass, no caching, no API change) that preserves the current semantics — it does _not_ require the cached prefixed key-set the roadmap gestures at (that one is invalidation-coupled to the change signal and is a representation decision, parked below). Add/keep a colocated test pinning the post-cleanup byte-size and key-set. — review.md (Gaps: full-keyspace scans).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Signal-aware bulk ops** (`setStorageItems` / `removeStorageItems` / `clearStorageNamespace` / `removeNamespacedStorageItem` emit no `onChange`). **Parked:** the largest open semantic question — emit or not, and per-key vs. one batch `StorageChange` (the `key: null` whole-store shape already exists conceptually). The worker made silence a deliberate perf tradeoff; blessing or rejecting it is a North-star ruling, not a sweep. Routed to Open directions.

- **Reserved-key policy for `__flight_storage_version`.** The migration version key (and the per- namespace version) leak into `getStorageKeys`/`getStorageEntries`/`getStorageItemCount`/ `getStorageByteSize` and the namespaced variants. **Parked:** hiding it (filter on read, or a reserved prefix the public reads strip) is a visible behavior change that also settles whether migration metadata counts toward `byteSize` — a charter decision, not a silent sweep. Routed to Open directions.

- **`@flighthq/storage-formats` neighbor — `exportStorageSnapshot` / `importStorageSnapshot`.** **Parked:** cross-package (a new triad `-formats` cell) and gated by the **plurality guard** (fork: the subject triad) — one JSON snapshot format may not yet justify a separate cell. Needs the bedrock test run against it and a home decision coordinated with the types-layout owner. Routed to Open directions.

- **`onStorageChange` flat subscribe convenience.** A disposer-returning wrapper over `enableStorageSignals().onChange`. **Parked:** it carries an open auto-enable design question (may a convenience auto-enable signals, against the `enable*` convention that makes the cost opt-in explicit?). Decide that before building it. Routed to Open directions.

- **Migration atomicity / rollback.** `migrateStorage` is best-effort-forward — a throw mid-sequence leaves earlier steps applied and returns `-1`, with no transaction or rollback. **Parked:** whether best-effort-forward is acceptable or atomicity is a goal is a charter ruling a mature migration system usually states; reshaping to transactional is larger than a sweep. Routed to Open directions.

- **`getStorageQuotaEstimate` async outlier.** The lone async export in a package framed as synchronous. **Parked:** justified (the browser API is async) but it is a contract-texture decision — keep it, move it behind the backend seam, or remove it — so a later agent does not "fix" it. Routed to Open directions (Drift 2).

- **Cached prefixed key-set for namespaced ops.** The roadmap's full Gold perf item: cache the prefix scan and invalidate on writes via the change signal. **Parked:** larger than the single-pass cleanup above and invalidation-coupled to the signal group — a representation decision tied to the bulk-ops / reserved-key resolutions, Gold-tier.

- **Rust `flighthq-storage` crate.** Intentionally deferred until the TS surface freezes. **Parked:** cross-package; the three recorded divergences (native file-KV default under the `native` feature, `StorageBackend` trait, `Signal<StorageChange>`) must land in the conformance map before the crate, and the `crate: flighthq-storage` front matter currently implies a mirror that does not exist.

- **Widen the Package-Map line for `@flighthq/storage`.** The map still reads "synchronous persistent key/value (web backend over localStorage)" — an undersell that predates namespacing, migrations, change signals, and quota. **Parked:** the edit lives in `tools/agents/docs/index.md`, not in this package cell — it belongs to the codebase-map owner.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these as candidate Open directions; the assessment confirms they are the decisions keeping the bulk of the backlog parked. The charter is a full stub, so the first need is simply to author North star and Boundaries — every item below presupposes that bar exists.

1. **North star / Boundaries** — author them (the AAA synchronous-KV bar, the sync-string-in/string-out contract, the platform-suite backend-seam shape). Every fork below resolves against this bar.
2. **Signal-aware bulk ops — yes/no, and payload shape.** Bless the current silence as an intentional perf tradeoff, or require emission (per-key vs. one batch `StorageChange`). The largest open semantic question.
3. **Reserved-key policy.** Hide `__flight_storage_version` (and future bookkeeping) from enumeration, a reserved prefix the public reads strip, or leave it visible — and whether migration metadata counts toward `byteSize`.
4. **`storage-formats` neighbor scope.** Is snapshot export/import in scope, and is the `@flighthq/storage-formats` split the home (subject-triad fork)? Run the plurality guard — split only on ≥2 formats; one JSON snapshot may not yet justify the cell.
5. **Sync boundary vs. one async exception.** Keep `getStorageQuotaEstimate` as an async outlier, move it behind the backend seam, or drop it. Settles Drift 2.
6. **`onStorageChange` convenience + auto-enable.** Add the flat disposer wrapper, and may it auto-enable signals (a cost-assumption the `enable*` convention otherwise makes explicit)?
7. **Migration ergonomics — atomicity.** Is best-effort-forward acceptable, or is rollback-on-partial- failure a goal? A mature migration system states this.
8. **Rust divergences + conformance map.** Record the native-default-backend flip and the namespacing/ JSON-helper layer in the conformance divergence map before `flighthq-storage` lands.
