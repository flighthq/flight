---
package: '@flighthq/debug'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - status.md
  - source
---

# debug — Review

**Verdict:** solid — 80/100. All four charter Decisions are fully implemented: the import-boundary inversion, the `enableDebug`/`disableDebug` orchestration over `@flighthq/log`, the open subsystem registry, the session-gated timing spans/frame markers (2026-07-12), and the `enableFlightDiagnostics` render-state authoring switch (2026-07-30). Since the prior review (2026-07-13), the package gained the `enableFlightDiagnostics` entry point with its `@flighthq/render` dependency, robust rollback on failed enable transactions, and wide adoption across examples (226 call sites). What remains is the same class of gaps: introspection, session reversibility, and the empty subsystem registry.

## Present capabilities

Two source files (218 lines of implementation) and two colocated test files (28 test cases, 391 lines), types header-first in `packages/types/src/Debug.ts` (`DebugSubsystemName` open union with eight seeded names, `DebugSubsystemHooks`, `DebugOptions`).

- **Session core** (`debug.ts`, 172 lines): `enableDebug(options)` installs a text-formatted console `LogSink` (overridable via `options.sink`), saves and raises the global log level (default `LogLevel.Debug`), raises per-channel levels for the selected subsystems' channels plus explicit `options.channels`, and runs each selected subsystem's `enableGuards`. Idempotent (second call is a no-op). Full rollback on enable failure: if any subsystem's `enableGuards` throws, already-enabled guards are unwound in reverse order via `disableGuards`, the sink is removed, and per-channel levels are restored to their pre-enable values -- the original error propagates, not a rollback error. `disableDebug()` reverses all of it: runs `disableGuards` in insertion order, removes the installed sink, restores the saved global level, clears channel overrides. `isDebugEnabled()` reads the session flag.
- **Open registry**: `registerDebugSubsystem(name, hooks)` (last-write-wins, vendor-prefix convention documented) / `unregisterDebugSubsystem(name)` (boolean sentinel: `false` when nothing was registered under `name`). Omitting `options.subsystems` enables every registered subsystem; unregistered names are silently skipped.
- **Render-state diagnostics** (`enableFlightDiagnostics(state)`, added post-prior-review): the one-call authoring switch that enables the debug session, `enableColorAdjustmentGuards(state)`, and `enableRenderRegistryGuards(state)`. This is the deliberate narrow `@flighthq/render` dependency documented in the charter's 2026-07-30 Decision. Tested: one test verifies that all three effects are active after the call. Adopted by 226 call sites across the examples tree.
- **Timing tier** (`debugTiming.ts`, 46 lines): `beginDebugSpan(name, channel?)`/`endDebugSpan(timer)` (nullable `LogTimer` bracket; `-1` sentinel for "not measured"), `measureDebugSpan(name, fn, channel?)` (`fn` always runs; timing only when enabled; span closed on throw via `finally`), `markDebugFrame(label?, channel?)` (auto-numbered by a monotonic module counter; no-op with no counter advance when disabled). All gate on `isDebugEnabled()` so instrumentation left in shipping code costs one boolean check.
- **Dependencies**: `@flighthq/log`, `@flighthq/render`, `@flighthq/types` -- matches the charter's Boundary exactly. Nothing at module top level; `sideEffects: false`.
- **Export lanes**: `index.ts` re-exports from `./contract`; `contract.ts` re-exports from `./debug` and `./debugTiming`. The two-lane convention is followed. Ten exports total, all tested.

## Gaps

Judged against the charter (deliberately an orchestration cell -- most "missing" diagnostics features are other cells' by design):

1. **No introspection/`explain*` surface.** Nothing lists the registered subsystems (`getDebugSubsystemNames`) or describes the active session (which subsystems/channels/level `enableDebug` actually applied -- useful when `subsystems` names were silently skipped as unregistered). The silently-skipped-name path is a silent sentinel with no `explain*` companion, per the diagnostics-inversion rule. `@flighthq/render`'s `explainRenderRegistryMisses` exists for its own guards but there is no `explainDebugSession` or `explainDebugSubsystems` equivalent for the debug registry itself.
2. **`disableDebug` clears all channel overrides.** `clearLogChannelLevels()` wipes per-channel levels a user set outside the debug session, not only the ones `enableDebug` raised. The source comments this as deliberate ("debug owns per-channel verbosity for the duration of a session"), but save/restore of pre-existing overrides would make the session truly reversible.
3. **`enableFlightDiagnostics` is one-way.** There is no `disableFlightDiagnostics`. `disableDebug()` removes the sink and restores log levels, but the two render guard activations (`enableColorAdjustmentGuards`, `enableRenderRegistryGuards`) have no disable counterparts in `@flighthq/render`, so they persist on the `RenderState` after `disableDebug()`. The charter's North star says "all reversible where the owning guard supports reversal" -- since the render guards do not support reversal, this is technically consistent, but it means the state left after `enableFlightDiagnostics` + `disableDebug` is not the state before `enableFlightDiagnostics`.
4. **Single-flavor session.** One global level for all selected channels (no per-subsystem level), and reconfiguring requires `disableDebug()` first (documented). Fine at this size; will pinch when subsystems multiply.
5. **No frame-budget aggregation.** The markers/spans emit raw entries only; the per-frame breakdown is charter Open direction 2 (explicitly out of this cell's first build).
6. **Nothing registers subsystems yet.** The registry has no first-party producers (the thin per-package debug adapters are charter Open direction 1), so `enableDebug({ subsystems: ['render'] })` does nothing in a stock app until the app registers hooks itself. The `DebugSubsystemName` open union seeds eight names that currently have no corresponding registrations.

## Charter contradictions

None found. Every Decision is implemented as written:

- The import-boundary inversion (2026-07-10) holds: `@flighthq/debug` is side-effect-free and zero-cost when not imported.
- The `enableDebug`/`disableDebug` orchestration-over-log shape (2026-07-10) is faithful: all log primitives come from `@flighthq/log`, the debug package only drives them.
- The open subsystem registry (2026-07-10) is in place with last-write-wins and vendor-prefix convention.
- The timing spans and frame markers (2026-07-12) match the Decision exactly, including "fn still runs when debug is off" and the devtools boundary.
- The `enableFlightDiagnostics` one-call authoring switch (2026-07-30) enables the console session plus the five registry-miss and color-adjustment guard categories named in the Decision. The `@flighthq/render` dependency is the "deliberate narrow" one the Decision blesses.

## Contract and docs fit

- Full unabbreviated names (`registerDebugSubsystem`, `measureDebugSpan`, `enableFlightDiagnostics`), boolean sentinels (`unregisterDebugSubsystem` returns `false`), numeric sentinel (`endDebugSpan` returns `-1`), `Readonly<>` on params and hooks, types header-first in `@flighthq/types`, module state below exports, two-lane export, `sideEffects: false`, every export tested. Clean.
- Package Map in AGENTS.md lists `debug` under Application. The description matches the built surface.
- `crate: flighthq-debug` reserved in the charter; no Rust source yet (expected).
- **Candidate revision**: the charter's Boundaries section says "Depends on `@flighthq/log`, `@flighthq/render`, and `@flighthq/types` only." This is accurate, but the prior version of the review (2026-07-13) says "Deps exactly `@flighthq/log` + `@flighthq/types`" -- the `@flighthq/render` dependency was added after that review and the charter's Boundaries were updated to match. No stale doc to fix.

## Candidate open directions

1. **Render guard reversibility.** `enableFlightDiagnostics` enables render guards that have no disable path. Should `@flighthq/render` grow `disableColorAdjustmentGuards`/`disableRenderRegistryGuards`, or is one-way enablement accepted for authoring-only guards? The answer determines whether `disableFlightDiagnostics` is even possible.
2. **Session reversibility policy.** Should `disableDebug` restore pre-session per-channel overrides (snapshot on enable) rather than clearing all? Today's behavior is documented but lossy; a ruling either way belongs in Decisions.
3. **Registry introspection.** Bless a small query surface (`getDebugSubsystemNames`, an `explain*` for skipped/unknown subsystem names) or keep the registry opaque? The silent-skip path has no diagnostics companion.
4. **Who seeds the built-in subsystems?** The `DebugSubsystemName` union seeds eight names (`animation`, `audio`, `input`, `loader`, `connectivity`, `particles`, `render`, `text`), but no package registers hooks for any of them. Decide the adapter delivery shape (charter Open direction 1) before the seeded vocabulary reads as false advertising.
