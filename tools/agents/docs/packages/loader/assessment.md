---
package: '@flighthq/loader'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/loader

Merge-gate assessment of the `integration-b2824e3d8` delta against the approved `origin/main` (`eb73c3d74`). Verdict from `review.md`: **reject — 38/100**, because the delta does not compile in the integration state. The orchestration design is sound; the gate fails on a missing header layer, a wrong import name, and one dead feature. The work therefore splits into **must-fix-to-compile** (sweep-safe, within the loader's own surface, no design call) and **design-gated backlog** (the byte tier, the Rust cancel-token seam, report-model edges).

The structural forks barely bite, and the review confirms it: a loader holds no graph node and parses nothing, so **fork A (source-data vs graph)** and the **subject triad** do not apply — there is no `loader-formats` neighbor and none should exist. **Fork B (registry vs union)** is moot: the loader dispatches `() => Promise<T>` thunks, not `kind`-switched primitives. The one fork-shaped finding is a **within-unit composition** note (the 660-line monolith and the throttle branch inside `drainQueue`), routed to Open directions, not Recommended.

## Recommended

Sweep-safe: within `@flighthq/loader` and its own type files in `@flighthq/types`, no cross-package coupling, no breaking change to a _shipped_ signature (the delta is unmerged, so its own new surface is fair game), no open design decision.

- **Write the missing `@flighthq/types` header before merge.** `resourceLoader.ts` and its test import `ResourceLoaderOptions`, `ResourceLoadItem`, `ResourceLoadHandle`, `ResourceLoadReport`, `ResourceLoadItemStatus`, `ResourceLoaderItemSignals` from `@flighthq/types`, none of which exist in the bundle (`review.md` › Blocking 1). These are the loader's own header layer — one concept per file (`ResourceLoadHandle.ts`, `ResourceLoadItem.ts`, …), exported from the types barrel. This is types-first cleanup of the loader's own surface, not a cross-package reach: it is purely what makes the already-written implementation typecheck. Sweep-safe.
- **Extend the `ResourceLoader` interface with the new signals/payloads.** Add `onCancel`/`onPause`/`onResume` and change `onComplete` to carry `readonly ResourceLoadReport[]` and `onError` to carry `(error, key)`, matching what `createResourceLoader` assigns/emits and what the test reads (`review.md` › Blocking 2). Same file family, within-package. Sweep-safe.
- **Fix the `disconnectAllSlots` import to `disconnectAllSignals`.** `resourceLoader.ts:1` imports a non-existent signals export; the real name is `disconnectAllSignals` (`review.md` › Blocking 3). One-line rename across `disposeResourceLoader`'s ten calls. Sweep-safe.
- **Remove the false "tracking shim" comment (lines 490-493).** It claims `entry.onBytesProgress` is a shim that writes `entry.bytesLoaded`; no such shim exists and nothing calls `onBytesProgress` (`review.md` › Blocking 4). Pure in-source doc hygiene; deleting a false comment is non-breaking. (Making the feature _real_ is design-gated — Backlog.)
- **Add a rate-bound throttle test.** The one throttle test (`…test.ts:72-102`) only checks the second item is delayed within 50 ms; nothing asserts the _rate_ is bounded. Pin the present advisory behavior and document its limit. Test-only, within-package; does not commit to the hard-cap-vs-advisory decision.
- **Add a regression test for present fail-fast scope.** `cancelRemainingEntries` aborts only `pending` entries; in-flight peers run to completion. Pin that current behavior so it is not changed by accident. (Whether fail-fast _should_ abort in-flight peers is an Open direction, not changed here.)

## Backlog

Parked: gated on an Open direction (charter), cross-package coordination, or a breaking change.

- **Resolve the byte/bandwidth tier (Open direction).** Why parked: the fix is a design fork, not a sweep. `report.bytes` is dead (always `0`), `entry.onBytesProgress` is never invoked. Either (a) extend `load` to `(signal, ctx)` so the loader injects a `reportBytes` writer — a **source-breaking factory-signature change** — or (b) cut the dead `bytes`/`onBytesProgress`/`bytesHint`/`maxBytesPerSecond` surface. Both need a blessed stance on the throttle's advisory-vs-budget semantics.
- **Unknown-key sentinel for `getResourceLoadItemStatus`.** Why parked: changes the return type / status union (`'unknown'`/`'missing'` member, or `null`) — a small API-shape decision. Returns `'pending'` for an unknown key today, violating the sentinel rule (`review.md` › Non-blocking).
- **Aggregated error surface.** Why parked: adding a first-class `ResourceLoadError[]` / failure summary on `onComplete` is an API-surface addition worth a deliberate call. Today callers filter `reports[]` by `status === 'failed'`.
- **Fail-fast in-flight semantics (Open direction).** Why parked: whether `'fail-fast'` aborts in-flight peers (not just stops dispatch) needs a blessed decision and a type note. The Recommended test only pins _current_ behavior.
- **Extract the token bucket as a bedrock primitive.** Why parked: a generic rate limiter is not loader-specific, and pulling it out of `drainQueue` is a structural call (does it become a neighbor primitive, or stay an internal helper?) tied to the composition Open direction. Non-blocking; surfaced.
- **Rust crate `flighthq-loader`.** Why parked: cross-worktree (Rust port) work; the deterministic, GPU-free orchestration is the ideal early conformance target, but its cancel-token seam is coupled to the `AbortSignal`/`CancellationToken` Open direction.
- **`AbortSignal` / `DOMException` vs a Flight-neutral `CancellationToken` (Open direction).** Why parked: a `@flighthq/types`-level decision that blocks the Rust mirror, per the Rust-port async/`Send` guidance.
- **Loader example in the gallery.** Why parked: the status doc's `examples/batchloading/` is absent from this delta, and a real-batch example crosses into `@flighthq/resources`/`examples` — cross-package.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on that approval._

---

### Notes for the charter's Open directions (not edited here)

The charter is a `draft: true` stub (Decisions empty; North star / Boundaries / Open directions proposed-not-blessed). These questions the review had to assume past belong in the charter, not in Recommended:

- **Byte/bandwidth tier — finish vs cut**, and the throttle's advisory-vs-hard-cap stance.
- **`AbortSignal`/`DOMException` vs a neutral `CancellationToken`** in the `@flighthq/types` seam (blocks the Rust mirror).
- **Fail-fast scope** — stop-dispatch only, or abort in-flight peers too.
- **Within-unit composition** — should the token-bucket throttle be an extracted primitive (off the per-drain hot path when unused), and should the 660-line single file be split? Fork-shaped within-unit decomposition, not a wrong-package call.
- **`PendingEntry` pool ownership** — module-scoped (shared across all loaders) vs per-loader; record the chosen stance and why the global pool is safe (or move it per-loader).
- **Boundary with `@flighthq/resources`** — bless "loader stays type-agnostic; typed conveniences like `createImageResourceLoadItem(url)` live in `resources`, consuming the loader" as a non-goal.
- **No `loader-formats` neighbor** — record that the loader parses nothing, so the triad does not apply.
- **Process discipline (the real lesson here).** The delta shipped an implementation against a `@flighthq/types` header that was never committed, and a `@flighthq/signals` export that does not exist — i.e. it was never typechecked before bundling. The charter/contract should make "the delta must `tsc`-clean against the integration head" a non-negotiable gate, since the status doc's self-claims (types + example landed) were trusted as-claimed and were false.
