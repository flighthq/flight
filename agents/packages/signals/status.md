---
package: '@flighthq/signals'
updated: 2026-09-01
by: manager
---

# signals — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/signals/src/` and `packages/types/src/Signal*.ts` on 2026-09-01, after
the tracked-connection/scope commission landed (`9b3d32962`, `aa7a2bc4d`, `48cd6146c`, `5bb7e2d43`).
A file:line here is a claim about this tree. `SignalData` is `slots: (T | null)[]` / `priorities` /
`repeat` / `cancelled` / `depth` (`types/src/Signal.ts:12`).

- **`clearSignal` during dispatch still does not stop the in-flight walk, and now nothing does.**
  `clearSignal` nulls `signal.data` and restores `nullSignalEmit` (`slot.ts:7-10`), but
  `makeDispatch` closed over the `data` object (`slot.ts:87`), so the running loop keeps draining
  the detached array. `cancelSignal` sets `data.cancelled` only when `signal.data` is non-null
  (`emitter.ts:5`), so after a mid-dispatch `clearSignal` it is a no-op and the walk runs to
  completion. Compaction handles the aliasing correctly — it detaches only while `signal.data === data`
  (`slot.ts:128`) — so this is a stop-the-dispatch gap, not a corruption. Needs a ruling on whether
  `clearSignal` mid-dispatch should imply cancel.
- **No introspection or diagnostics surface.** `hasSignalSlots` (`slot.ts:64`) and `isSlotConnected`
  (`slot.ts:81`) remain the whole query surface: no live slot count, no connection listing, and no
  `enable*Guards` / `explain*` module, in a package whose failure mode is a silently skipped or
  never-fired slot. The tombstone discipline widens this — `isSlotConnected` uses `indexOf`
  (`slot.ts:82`), which answers correctly but cannot distinguish "never connected" from
  "tombstoned during the dispatch you are inside".
- **`review.md` and `assessment.md` are stale on the handle/scope surface.** Both record that
  `SignalConnection`/`SignalScope` were claimed by an earlier pass but absent from the source tree
  (`assessment.md` line 31; `review.md`'s 2026-07-31 correction). That is no longer true — the
  surface is built and blessed by the 2026-09-01 charter Decision. They are stage outputs of surveys
  that ran before the commission, so they are not edited in place; a re-survey supersedes them.
- **Deferred, collecting, and weak dispatch are absent and stay absent.** The earlier entry here
  read them as gaps needing an API-shape ruling. They already have one: charter Decisions #1, #2,
  and #3 rule out `emitSignalDeferred`, `emitSignalCollect`, and `connectSignalWeak` as blessed
  non-goals. Not open work.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Tracked connections, scopes, snapshot emission, and tombstone dispatch safety
  landed; charter Decisions recorded and the dispatch-during-dispatch direction resolved. Three of
  the four `Open` items above died: `disconnectSignal` no longer skips the shifted slot, `once`
  slots tombstone instead of splicing under a nested emit, and the header's
  `SignalConnection`/`SignalScope` types now have an implementation to call. Pause is a wrapper
  slot, not an `enabled` lane, so `SignalData` kept its three parallel lanes.

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
