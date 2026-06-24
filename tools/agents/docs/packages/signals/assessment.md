---
package: '@flighthq/signals'
updated: 2026-06-24
basedOn: ./review.md
---

# signals — Assessment

> Recommendation layer over [`review.md`](./review.md) (solid — 90/100) and the now-absorbed `reviews/maturation/depth/signals.md` Bronze/Silver/Gold roadmap. The builder pass at `67dc46d64` landed essentially all of Bronze + Silver; what remains is one correctness fix, a pre-release alias cleanup, and the Gold-tier operators (deferred / collect / weak), most of which ride on an open design decision and are parked.
>
> The maturation roadmap is fully absorbed here and is one-time seed — remove `tools/agents/docs/reviews/maturation/depth/signals.md` once this assessment is in place.

## Recommended

Sweep-safe: within `@flighthq/signals`, no cross-package coupling, no breaking change (no external consumers exist), no open design decision. A blanket "do all recommended" can safely bless this set.

- **Close the once-removal re-entrancy hazard.** In `makeDispatch` (`slot.ts`), the `once`-slot path does a direct `data.slots.splice(i, 1)` regardless of `depth`, unlike `disconnectSignalConnection` which tombstones when `depth > 0`. A nested emit that fires a `once` slot positioned before an outer dispatch's cursor shifts the outer index and silently skips a slot. Extend the existing tombstone discipline to once-removal mid-dispatch so the same protection covers both paths. Pure within-package correctness; keeps the hot loop lean (bundle invariant) — review.md#gaps.
- **Add a nested re-entrant emit test.** `connectSignal`'s JSDoc promises "Re-entrant emit on the same signal is safe," but no test emits the _same_ signal from within a slot. Add the missing nested-emit case (including the once-before-cursor case above) to `slot.test.ts` so the documented guarantee is actually exercised — review.md#gaps.
- **Delete the two zero-caller deprecated aliases.** `disconnectAllSignals` (`slot.ts`) and `connectSignalAtRate` (`throttle.ts`) are `@deprecated` shims for renames whose in-repo callers pass 2 already migrated; both now have zero callers. Pre-release policy is explicit ("no backwards-compat obligations … do not accumulate workarounds … rename, restructure, or remove"). Delete the aliases, their exports, and any alias-only tests. The _general_ deprecation-policy question is routed to the charter (below); deleting these two is mandated by already-blessed codebase-map policy, not awaiting a new decision — review.md#contract-and-docs-fit.

## Backlog

Parked: each waits on an Open direction, crosses a package boundary, or is larger/demand-driven scope. Reason given per item.

- **Move `SignalThrottleOptions` into `@flighthq/types`.** Declared inline in `throttle.ts` while its sibling `SignalConnectOptions` lives in the header layer. _Parked:_ touches the shared `@flighthq/types` header (cross-cell), and the review judged leaving it defensible since it does not yet cross a package boundary — fold it in when the types layer is next touched.
- **`emitSignalDeferred` (queued/async dispatch).** Gold-tier, named domain gap (Qt queued connections, RxJS schedulers). _Parked:_ needs the deferred-dispatch flush-point design decision (TS microtask vs. Rust host-driven `flushDeferredSignals`) blessed first — see charter Open direction. Must tree-shake out when unused (bundle invariant).
- **`emitSignalCollect` / `CollectableSignal` (return-carrying dispatch).** Accumulator / veto chains. _Parked:_ an API-shape decision (a return-typed signal diverges from the strict `void` slot contract) with a concrete cross-package consumer — `@flighthq/application`'s `onCloseRequest` veto. Co-design with `application`; route to charter Open direction. Keep strictly separate from the void-return `Signal<T>` so the common case stays zero-cost.
- **`connectSignalWeak` (weak / auto-disposing connections).** Domain-canonical (libsigc++ `trackable`). _Parked:_ carries GC non-determinism and a permitted TS `FinalizationRegistry` ↔ Rust `Weak<>` conformance divergence — a Boundary decision either way. Route to charter Open direction; must stay isolated so the registry cost never lands on the default bundle.
- **Dense / slotmap dispatch storage.** Replace the five synchronized parallel arrays (`slots`/`priorities`/`repeat`/`enabled`/`connections`) with swap-remove + tombstone or a slotmap free list. _Parked:_ larger scope and intersects a Decision about the intended end-state (the structural risk behind the once-splice hazard). Perf only matters at hundreds of slots; record the end-state as a charter Decision before rewriting.
- **Gold perf benchmarks + allocation docs.** Connect/emit/disconnect baselines at 1/10/100/1000 slots committed via `npm run size`, plus a short note on lazy allocation and handle vs. raw-slot cost. _Parked:_ demand-driven Gold polish; follows the storage decision.
- **Rust-crate conformance for the new surface.** `flighthq-signals` must mirror the now-widened TS surface (connection handles, pause/resume, scopes, introspection, throttle/debounce) and record any intentional divergence (e.g. `WeakRef` vs `Weak<>` finalization timing) in the conformance map. _Parked:_ cross-package (the Rust crate), tracked as downstream conformance debt.
- **Refresh the Package Map line for signals.** `index.md`'s entry still reads "multiple listeners, priority, and cancellation," understating the handle / pause-resume / scope / introspection / throttle-debounce surface now present. _Parked:_ edits the shared codebase map (cross-cell) and the review flags it as a user-gated doc revision.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

## Routed to the charter's Open directions

Not assessment work — surfaced for an explicit direction conversation; the charter is the user's to edit. These mirror the review's candidate open directions:

- **Synchronous-only as a Boundary, vs. `emitSignalDeferred` in scope** (and its flush-point seam).
- **Return-carrying `emitSignalCollect` / `CollectableSignal` in scope, vs. the `void` slot contract** — with the `application` `onCloseRequest` veto as the live consumer.
- **Weak / auto-disposing connections in or out** — and the permitted Rust `Weak<>` divergence.
- **Storage strategy as a Decision** — parallel-array vs. dense slotmap; record whether the tombstone discipline should extend to once-removal as the blessed end-state.
- **Deprecation policy** — whether the package keeps _any_ `@deprecated` alias or always hard-renames pre-release (a one-line Decision settles the recurring alias question).
- **Throttle/debounce clock & home** — whether wall-clock temporal control (`Date.now()`/`setTimeout`) is a signals concern or belongs with a timer/tween package; clarifies whether `throttle.ts` is core or a convenience annex.
