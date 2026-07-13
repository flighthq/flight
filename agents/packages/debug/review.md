---
package: '@flighthq/debug'
status: solid
score: 78
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# debug — Review

_No `status.md` exists in this cell yet; evidence is the live source plus the charter's Decisions (which record both the 2026-07-10 first build and the 2026-07-12 timing addition)._

**Verdict:** solid — 78/100. The charter's deliberately narrow orchestration scope — the opt-in import boundary, `enableDebug`/`disableDebug`, the open subsystem registry, and now the session-gated timing spans/frame markers — is fully delivered and well-tested. What remains is introspection (no query surface over the registry or the active session), a couple of session-semantics sharp edges, and the charter's own next-tier open directions.

## Present capabilities

Two source files, types header-first in `packages/types/src/Debug.ts` (`DebugSubsystemName` open union, `DebugSubsystemHooks`, `DebugOptions`):

- **Session core** (`debug.ts`): `enableDebug(options)` — installs a text-formatted console `LogSink` (overridable via `options.sink`), saves and raises the global log level (default `LogLevel.Debug`), raises per-channel levels for the selected subsystems' channels plus explicit `options.channels`, and runs each selected subsystem's `enableGuards`. Idempotent (second call is a no-op). `disableDebug()` reverses all of it — runs `disableGuards`, removes exactly the installed sink, restores the saved global level, clears channel overrides. `isDebugEnabled()` reads the session flag.
- **Open registry**: `registerDebugSubsystem(name, hooks)` (last-write-wins, vendor-prefix convention documented) / `unregisterDebugSubsystem` (boolean sentinel). Omitting `options.subsystems` enables every registered subsystem; unregistered names are silently skipped.
- **Timing tier** (`debugTiming.ts`, 2026-07-12): `beginDebugSpan`/`endDebugSpan` (nullable `LogTimer` bracket; `-1` sentinel for "not measured"), `measureDebugSpan(name, fn)` (fn always runs; timing only when enabled; span closed on throw via `finally`), `markDebugFrame(label?)` (auto-numbered by a monotonic module counter, no-op with no counter advance when disabled). All gate on `isDebugEnabled()` so instrumentation left in shipping code costs one boolean check — orchestration only, emission staying in `@flighthq/log` exactly per the Decision.
- Deps exactly `@flighthq/log` + `@flighthq/types` (charter Boundary); nothing at module top level; the sole `console` touch is inside the default dev sink with an explicit lint-suppression rationale. 26 tests across both files, including guard enable/disable ordering, idempotence, sink restoration, and disabled-session no-ops.

## Gaps

Judged against the charter (deliberately an orchestration cell — most "missing" diagnostics features are other cells' by design):

1. **No introspection/`explain*` surface.** Nothing lists the registered subsystems (`getDebugSubsystemNames`) or describes the active session (which subsystems/channels/level `enableDebug` actually applied — useful when `subsystems` names were silently skipped as unregistered). The silently-skipped-name path is a silent sentinel with no `explain*`, per the diagnostics rule.
2. **`disableDebug` clears *all* channel overrides.** `clearLogChannelLevels()` wipes per-channel levels a user set outside the debug session, not only the ones `enableDebug` raised. The source comments this as deliberate ("debug owns per-channel verbosity for the duration of a session"), but save/restore of pre-existing overrides would make the session truly reversible.
3. **Single-flavor session.** One global level for all selected channels (no per-subsystem level), and reconfiguring requires `disableDebug()` first (documented). Fine at this size; will pinch when subsystems multiply.
4. **No frame-budget aggregation** — the markers/spans emit raw entries only; the per-frame breakdown is charter Open direction 2 (explicitly out of this cell's first build).
5. **Nothing registers subsystems yet** — the registry has no first-party producers (the thin per-package debug adapters are charter Open direction 1), so `enableDebug(['render'])` does nothing in a stock app until the app registers hooks itself.

## Charter contradictions

None. Every Decision — the import-boundary inversion, the orchestrate-over-log shape, the open registry, and the 2026-07-12 timing-span ruling (including "fn still runs when debug is off" and the devtools boundary) — is implemented as written.

## Contract & docs fit

- Full unabbreviated names (`registerDebugSubsystem`, `measureDebugSpan`), boolean sentinels, `Readonly<>` params, types header-first, module state below exports, single root export, `sideEffects: false`, every export tested. Clean.
- Package Map line ("per-channel subsystem logging, guard checks, a dev console sink, timing/markers") matches the built surface.
- `crate: flighthq-debug` reserved; no Rust source yet (expected).

## Candidate open directions

1. **Session reversibility policy** — should `disableDebug` restore pre-session per-channel overrides (snapshot on enable) rather than clearing all? Today's behavior is documented but lossy; a ruling either way belongs in Decisions.
2. **Registry introspection** — bless a small query surface (`getDebugSubsystemNames`, an `explain*` for skipped/unknown subsystem names) or keep the registry opaque?
3. **Who seeds the built-in subsystems?** The `DebugSubsystemName` union seeds eight names, but no package registers hooks. Decide the adapter delivery shape (charter Open direction 1) before the seeded vocabulary reads as false advertising.
