---
package: '@flighthq/signals'
updated: 2026-08-08
by: principal
---

# signals — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/signals/src/` and `packages/types/src/Signal*.ts` on
2026-08-08. A file:line here is a claim about this tree, not about a session. The package is eleven
exported functions over four files; `SignalData` is the lean parallel-array form
(`types/src/Signal.ts:8`: `slots` / `priorities` / `repeat` / `cancelled`).

- **`disconnectSignal` during dispatch skips the next slot.** `makeDispatch` walks a live cursor
  `i` over `data.slots` (`slot.ts:73-87`); `disconnectSignal` splices all four parallel arrays
  in place (`slot.ts:44-48`). A slot that disconnects a later slot shifts everything down under the
  cursor, and the shifted-into-position slot is never visited in that pass. There is no `depth`
  counter and no tombstone discipline to extend — a fix needs a new field on `SignalData`
  (cross-package, `@flighthq/types`) plus a compaction pass, so it is a dispatch-semantics decision
  before it is code.
- **The same cursor hazard reaches `once` slots through nested emits.** A `repeat: false` slot is
  spliced out at `slot.ts:82-85` after it fires. A re-entrant emit re-traverses the shared arrays
  from index 0 and may remove an entry below the outer cursor, after which the outer loop's `i`
  refers to a different slot than the one it just invoked.
- **`clearSignal` during dispatch does not stop the in-flight walk.** `clearSignal` nulls
  `signal.data` and restores `nullSignalEmit` (`slot.ts:7-10`), but `makeDispatch` closed over the
  `data` object (`slot.ts:72`), so the running loop keeps draining the detached array. `cancelSignal`
  (`emitter.ts:5`) is the only working mid-dispatch stop, and it is a no-op once `data` is null.
- **`SignalConnection` and `SignalScope` are header types with no implementation here.**
  `types/src/SignalConnection.ts:11` and `types/src/SignalScope.ts:11` document
  `connectSignalOnce`, `createSignalScope`, `disconnectSignalScope`, and per-connection
  pause/resume; none exists in this package, `connectSignal` returns `void` (`slot.ts:12`), and
  `SignalData` has no `enabled` lane. Either build the handle surface or retire the two types —
  today the header advertises an API a consumer cannot call.
- **No introspection or diagnostics surface.** `hasSignalSlots` (`slot.ts:56`) and `isSlotConnected`
  (`slot.ts:67`) are the whole query surface: no slot count, no live-slot listing, and no
  `enable*Guards` / `explain*` module, in a package whose failure mode (a silently skipped slot) is
  exactly what a guard would report.
- **Deferred and collecting dispatch are absent** — no `emitSignalDeferred`, no `emitSignalCollect`
  / `CollectableSignal`, no `connectSignalWeak` anywhere in `packages/`. The veto chain
  `@flighthq/application`'s close-request pattern wants is the concrete consumer for the second;
  each needs an API-shape ruling (flush point, return-typed signal, GC-timing divergence) first.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract, verified against source. Two headline
  claims died in opposite directions. The 2026-06-24 entry's entire "implemented" list —
  `SignalConnection` handles, `scope.ts`, `depth`, tombstones, `disconnectSignalConnection`,
  `getSignalConnections`, `getSignalSlotCount`, `pauseSignalConnection` — is absent from
  `packages/signals/src/`, which holds only `emitter.ts`/`signal.ts`/`slot.ts`/`throttle.ts`. But
  the 2026-06-25 entry's correction over-swept: it stated that `connectSignalThrottled` and
  `connectSignalDebounced` are not present (they are, `throttle.ts:102` and `:50`) and that
  `connectSignalAtRate` "exists but is a live, non-deprecated, tested, exported function" (it does
  not exist; the export is `connectSignalAtFrameRate`, `throttle.ts:20`). The Rust-parity item also
  went — there is no `rust/` tree in this repo.
- **2026-06-25** — Added two nested re-entrant emit cases to `slot.test.ts` under `connectSignal`.
- **2026-06-24** — Throttle/debounce and the frame-rate connector landed in `throttle.ts`.
