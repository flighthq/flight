---
package: '@flighthq/signals'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/signals.md
  - source
---

# signals — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/signals/` (source + tests), `incoming/builder-67dc46d64/changes.patch` (delta), with cross-package types in `head/packages/types/src/Signal*.ts`. Findings cited as `67dc46d64:<path>`.

## Verdict

**solid — 90/100.** This pass closes nearly every depth-review gap that mattered: a real `SignalConnection` handle, a first-class `connectSignalOnce`, listener introspection (`getSignalSlotCount`/`hasSignalSlots`/`getSignalConnections`), per-connection pause/resume, scope-based bulk teardown, payload-preserving throttle + debounce, and the `disconnectAllSignals` → `disconnectAllSlots` rename. The work is clean, tree-shakable, well-tested (89 tests across 6 files), and faithful to the codebase's free-function / plain-data / `@flighthq/types`-first philosophy. It is held back from "authoritative" only by one unverified re-entrancy hazard in the dispatch loop, a thin spot in deferred/collect dispatch (deliberately deferred), and an accumulating set of deprecated aliases that pre-release policy says should simply be deleted.

The status doc's claimed jump (88 → 93) is largely substantiated against the diff; I land slightly lower at **90** because the headline "re-entrant emit is safe" guarantee is documented but not actually exercised by a nested-emit test, and because two deprecated aliases now carry zero callers yet remain (workaround-accumulation the codebase map explicitly forbids pre-release).

## Present capabilities

All grounded in `67dc46d64:packages/signals/src/`.

**Core slot/dispatch (`slot.ts`, `signal.ts`, `emitter.ts`, `internal.ts`):**

- `createSignal<T>()` — lazy: `data: null`, `emit: nullSignalEmit`. No arrays until first connect; emitting an empty signal is a genuine no-op, not a guarded branch (`internal.ts`).
- `connectSignal(signal, slot, options?)` → `SignalConnection<T>`. Priority-ordered linear-scan insert; `{ priority, once }` options. **This returned handle is the defining gap the depth review named, now closed.**
- `connectSignalOnce(signal, slot, options?)` → handle. First-class named verb; `options` is `Omit<…, 'once'>` so the flag can't be contradicted. Good API hygiene.
- `disconnectSignal(signal, slot)` — removes _all_ registrations of a slot function (reverse-scan splice); frees `data` to `null` on empty.
- `disconnectSignalConnection(connection)` → `boolean` — disconnect exactly one registration by handle identity. Idempotent (returns `false` if already gone), tombstone-safe mid-dispatch.
- `disconnectAllSlots(signal)` — clears all slots, marks every handle `connected: false`, resets to no-op state.
- `getSignalConnections(signal, out?)` — `out`-param accumulator of live handles; clears `out` first, allocates when omitted. Matches the out-param convention.
- `getSignalSlotCount(signal)` / `hasSignalSlots(signal)` — hot-path "is anyone listening?" introspection without reaching into `data`.
- `isSignalConnectionActive(connection)` / `isSlotConnected(signal, slot)` — handle-based and function-identity membership checks.
- `pauseSignalConnection` / `resumeSignalConnection` — per-connection pause via the `enabled` lane; dispatch checks `data.enabled[i]` before firing.
- `cancelSignal(signal)` (`emitter.ts`) — sets `cancelled`; the dispatch loop breaks after the current slot.

**Re-entrancy / mutation-during-dispatch (`makeDispatch` in `slot.ts`):** index walk that re-reads `data.slots.length` each iteration, so connect-during-dispatch is visited in the same pass; a `depth` counter guards a tombstone strategy so `disconnectSignalConnection` mid-dispatch nulls the entry and a post-outermost-dispatch cleanup purges tombstones. This is the genuinely hard part of a signal library and the single-level cases are correct and tested.

**Scope (`scope.ts`):** `createSignalScope`, `addSignalConnectionToScope`, `connectSignalInScope`, `connectSignalOnceInScope`, `disconnectSignalScope` — the canonical component-teardown bracket. `SignalScope` is plain data (`{ connections: [] }`) in `@flighthq/types`.

**Temporal operators (`throttle.ts`):** `connectSignalAtFrameRate` (the renamed tick accumulator), payload-preserving `connectSignalThrottled` and `connectSignalDebounced` with `leading`/`trailing` edge control via `SignalThrottleOptions`. These close the depth review's "throttle is the only temporal operator, and it drops payload" gap.

**Types (`@flighthq/types`):** `SignalConnection<T>`, `SignalScope`, and an extended `SignalData<T>` (`enabled[]`, `connections[]`, `depth`) all live in the header layer with JSDoc, exactly as the contract requires. `SignalConnection` defaults its generic to `(...args: any[]) => void` so `SignalScope` can hold heterogeneous handles.

**Tests:** 89 across `signal`/`internal`/`emitter`/`slot`/`scope`/`throttle`. `slot.test.ts` carries a dedicated `dispatch ordering and stability` block: connect-during-emit appended-and-fired, disconnect-self, disconnect-next-slot-skipped, double-disconnect sentinel, pause-then-disconnect, no-op-after-`disconnectAllSlots`, and tombstone-purge assertion on `slots.length`. The status doc's pass-2 correction (slots added during dispatch DO fire in-pass) is real and is the assertion in `slots added during dispatch fire in the same pass`.

## Gaps

Measured against an authoritative signal/slot library and the AAA bar (charter is a stub — see Candidate open directions).

- **Nested re-entrant emit is documented-safe but untested, and has a real hazard.** `connectSignal`'s JSDoc promises "Re-entrant emit on the same signal is safe." No test emits the _same_ signal from within a slot. Worse, the `once`-slot path in `makeDispatch` removes its entry with a **direct `data.slots.splice(i, 1)` regardless of `depth`** (`slot.ts:297-301`), unlike `disconnectSignalConnection`, which tombstones when `depth > 0`. If an inner (nested) emit fires a `once` slot positioned _before_ an outer dispatch's current index, the outer loop's index now points one element too far and silently skips a slot. The tombstone discipline that protects the disconnect path does not protect the once-removal path. This is the one correctness concern keeping the package from authoritative; it needs either a nested-emit test that proves safety or a tombstone for once-removal mid-dispatch too.
- **Deferred / async / queued dispatch absent.** No `emitSignalDeferred`. Status doc defers it pending a flush-point design conversation — legitimate, but it is a named domain gap (Qt queued connections, RxJS schedulers).
- **No return-carrying / collect dispatch.** No `emitSignalCollect` / `CollectableSignal` for accumulator or veto chains. Deferred as an API-shape decision; the concrete consumer (`@flighthq/application` `onCloseRequest` veto) already exists, so this is a live, not hypothetical, gap.
- **No weak / auto-disposing connection.** No `connectSignalWeak`. Deferred for sound reasons (GC non-determinism, Rust `Weak<>` conformance divergence). Domain-canonical but reasonably parked.
- **Parallel-array storage is a five-lane footgun.** `SignalData` now has five synchronized arrays (`slots`/`priorities`/`repeat`/`enabled`/`connections`); every insert/splice/tombstone must touch all five in lockstep. Correct today, but the dense-storage / slotmap path the status doc parks is the real fix. Not urgent (perf only matters at hundreds of slots), but it is the structural risk behind the once-splice hazard above.
- **No `this`/context binding** — deliberate (free-function, C-portable). Now explicitly documented in the `connectSignal` JSDoc, which the depth review asked for. Closed-by-documentation.

## Charter contradictions

None — the charter (`North star`, `Boundaries`, `Decisions`) is entirely TODO/stub, so there is no stated principle to contradict. The one seeded line ("multi-listener notification with priority ordering, cancellation, and one-shot connections") is fully honored by the code. Every judgement above falls back to the codebase-map AAA standard per the rubric rule; the silences are collected below.

## Contract & docs fit

**Lives up to the contract:**

- **Types-first:** `Signal`, `SignalData`, `SignalConnection`, `SignalScope`, `SignalConnectOptions` all in `@flighthq/types`; the package re-exports them. Header layer is navigable alone.
- **Full unabbreviated names:** every export carries the `Signal`/`SignalConnection`/`SignalSlot` type word. `disconnectAllSignals` → `disconnectAllSlots` fixes the one naming error the depth review flagged (it clears one signal's _slots_, not many signals).
- **Out-params:** `getSignalConnections(signal, out?)` follows the clear-then-fill convention.
- **Sentinels not throws:** `disconnectSignalConnection` returns `false` rather than throwing on double-disconnect; empty-signal ops are no-ops. No error-wrapping types.
- **Single root export, `sideEffects: false`:** `index.ts` is a thin barrel over five files; `package.json` declares `sideEffects: false` and a single `.` entry. No top-level side effects (no eager registration).
- **`SignalThrottleOptions` placement — minor deviation.** This interface is declared _inline_ in `throttle.ts` (`67dc46d64:packages/signals/src/throttle.ts:10`), not in `@flighthq/types`. It does not currently cross a package boundary, so it is defensible, but the contract's "shared types belong in `@flighthq/types`" rule and the symmetry with `SignalConnectOptions` (which _is_ in types) argue for moving it. Flag as a small contract-fit drift.

**Where docs/contract are stale against the work (candidate revisions — user's gate):**

- **Package Map line is now understated.** `index.md`'s `@flighthq/signals` entry still reads "signals support multiple listeners, priority, and cancellation." The package now also offers connection handles, pause/resume, scopes, introspection, and throttle/debounce. Candidate: refresh the Package Map sentence to reflect the handle + scope + temporal surface.
- **Deprecated aliases violate the pre-release no-workarounds rule.** `disconnectAllSignals` (`slot.ts:95`) and `connectSignalAtRate` (`throttle.ts:55`) are kept as `@deprecated` aliases. The codebase map is explicit: "There are no published consumers… do not accumulate workarounds for past choices… rename it, restructure it, or remove it." Pass 2 migrated all in-repo callers off `disconnectAllSignals`, so both aliases now have **zero callers** and exist only to soften a rename that has no audience. Candidate revision: delete both aliases (and their exports/tests) rather than carry them. The status doc itself lists this as a suggested cleanup.

**Rust-crate mirror:** `flighthq-signals` exists; the status doc records the mapping (`connections`→per-slot arena field, `enabled`→flag, `depth`→`Signal` counter, `SignalConnection`→`SlotId`). The Rust port's own signals decision (`Signal<T>` parameterized by _payload_, `Arc<dyn Fn>`) already diverges structurally from the TS function-typed `Signal<T>`; the new handle/pause/scope surface widens what the port must mirror. Out of scope for this review but a real downstream conformance debt.

## Candidate open directions

The charter is a stub; each item below is a question this review had to assume an answer to, surfaced for the user to settle into the charter's `North star` / `Boundaries` / `Open directions`.

1. **Is synchronous-only dispatch a Boundary, or is `emitSignalDeferred` in scope?** The package leans synchronous-by-design (render-loop intent) but the JSDoc never states it as a boundary. If deferred dispatch is wanted, the flush-point (TS microtask vs. Rust host-driven `flushDeferredSignals`) is a design fork that needs blessing before building.
2. **Is a return-carrying signal (`emitSignalCollect` / `CollectableSignal`) in scope, or does the void-return contract hold?** A return-typed `Signal` diverges from the strict `void` slot contract. The `@flighthq/application` `onCloseRequest` veto is a concrete consumer pushing on this; decide whether the veto chain lives here or in the caller.
3. **Weak/auto-disposing connections — in or out?** They carry GC-nondeterminism and a permitted Rust `Weak<>` conformance divergence. Worth a Boundary line either way.
4. **Storage strategy as a Decision.** Parallel-array vs. dense slotmap is currently an implicit internal choice; given the once-splice hazard it touches correctness, not just perf. Worth recording the intended end-state (and whether the tombstone discipline should extend to once-removal) as a Decision.
5. **Deprecation policy.** Given pre-release "no backwards-compat obligations," should the package keep _any_ `@deprecated` alias, or always hard-rename? A one-line Decision would settle the recurring alias question for this and future renames.
6. **Throttle/debounce clock & home.** `connectSignalThrottled`/`Debounced` use `Date.now()`/`setTimeout` — host-time-coupled, unlike the rest of the package. Is wall-clock temporal control a signals-package concern, or does it belong with a timer/tween package? A Boundary line would clarify whether `throttle.ts` is core or a convenience annex.
