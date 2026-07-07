---
package: '@flighthq/log'
status: partial
score: 40
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/log/src/log.ts
  - head/packages/log/src/log.test.ts
  - head/packages/types/src/Log.ts
  - changes.patch (packages/log + packages/types slices)
---

# log — Merge Review (integration b2824e3d8 vs approved base eb73c3d74)

## Verdict

**Reject as a merge into the approved baseline.** The candidate is an ambitious, mostly-idiomatic expansion of `@flighthq/log` (base: a ~116-line two-face emit/listener seam → head: an 813-line full logging library: 61 exported functions, 4 opaque sink tokens, multi-sink fan-out, level gates, formatters, redaction, tracing). On its own terms the design is largely sound. But **the integration head does not compile**: `log.ts` and `log.test.ts` import seven types from `@flighthq/types` that do not exist anywhere in the integration tree. This is a hard merge-gate failure independent of the design's merits — a non-building package cannot enter the approved floor. The committed `review.md` carried in the same patch claims `status: solid`, `score: 86`, and "7 new `@flighthq/types` files," but those files are absent from `b2824e3d8`. The score here reflects the build-blocking state of _this merge_, not the quality of the code in isolation.

## The blocker — undefined cross-package types (standards 6 + 7)

`b2824e3d8:packages/log/src/log.ts` lines 2–13 import:

```ts
import type {
  LogContext,
  LogDataProvider,
  LogFormatter,
  LogSignals,
  LogSink,
  LogSpan,
  LogTimer,
  LogTransportBackend,
} from '@flighthq/types';
```

Of these, only `LogSink` (and `LogData`, `LogEntry`, `LogLevel`) are defined. `head/packages/types/src/Log.ts` is **byte-identical to base** — it still defines only `LogLevel`, `LogData`, `LogEntry`, `LogSink`. A tree-wide grep finds **zero** definitions of `LogContext`, `LogDataProvider`, `LogFormatter`, `LogSignals`, `LogSpan`, `LogTimer`, `LogTransportBackend` anywhere under `head/packages/types/`. The integration patch _does_ add new `packages/types/src/*.ts` files (`FontMetrics`, `GlyphExtents`, `Notification`, `RenderViewport2D`, `ShapedRun`, `SpritesheetFormat`, `TextShaper`) — but none of the seven Log types. `b2824e3d8:packages/log/src/log.test.ts:2` likewise imports the undefined `LogSignals`.

Consequences, all in the delta (base had none of these imports):

- `tsc -b` fails for `@flighthq/log` and its consumers — the package cannot build, so `npm run check` / `npm run ci` cannot pass.
- This violates the codebase-map "types-first" rule directly: cross-package shapes must be authored in `@flighthq/types` _first_, then implemented against. Here the implementation landed and the header layer did not.
- The committed `b2824e3d8:agents/packages/log/review.md` asserts the capabilities are "Grounded in `67dc46d64:packages/log/src/log.ts` and `packages/types/src/Log*.ts`" — a state that exists at the source worktree `67dc46d64` but **not** at the integration head `b2824e3d8`. The merge dropped the types files; the as-claimed review now misrepresents the integrated tree.

This is the single decisive finding. Everything below is conditional on it being fixed.

## Secondary — structural divider comments (standard 6, source style)

`b2824e3d8:packages/log/src/log.ts` introduces three banner dividers the head's own Source Style rule forbids ("Avoid structural divider comments such as `// ---- setup ----`"):

```
29:// ---------------------------------------------------------------------------
30:// Emit side — multi-sink fan-out + level-gated emit
31:// ---------------------------------------------------------------------------
613:// ... Opaque tokens ...
639:// ... Internals ...
```

Base `log.ts` had none. The boundaries these draw are already carried by names and file position; the dividers add maintenance surface for no signal. Minor mislabel inside the first banner: the "Emit side" header sits directly above `addLogSink`, whose own docstring tags it "Listener side."

## What passes (judged on the delta, conditional on the blocker)

- **Naming (standard 2).** Full, unabbreviated type words throughout: `createBufferedLogSink`, `getMemoryLogSinkEntries`, `setLogTransportBackend`, `enableLogSignals`. `get*`/`is*` discipline holds; sink-creating functions are `create*`. No abbreviations. Globally self-identifying.
- **Tree-shaking / bundle invariant (standard 3).** `package.json` keeps the single root `.` export and `"sideEffects": false`; `index.ts` is a thin `export * from './log'`. No top-level registration or side effect. The emit gate (`_passesLevelGate`) runs before payload construction, and `LogData | LogDataProvider` thunks are invoked only past the gate, so a suppressed verbose emit allocates nothing — the listener-side combinators/formatters tree-shake away from an emit-only import. (The "tree-shakes to near-nothing" claim is asserted by inspection, not proven by `npm run size` — see Notes.)
- **Registry vs closed union (standard 4).** `registerLogSerializer` is a `__kind` string registry (last-write-wins, vendor-prefixed user kinds), not a closed `switch`. Correct fork-B shape.
- **Contract hygiene (standard 6), where types exist.** Sentinels not throws: `logAssert` never throws, `parseLogLevel`→`null`, `removeLogSink`→`false`, `getLogChannelLevel`→`null`. `dispose*` is correctly chosen over `destroy*` for `disposeLogSink`/`disposeFileLogSink` (they detach an interval timer / release a GC-managed backend, not a GPU/native handle). `_applyRedaction` shallow-copies before mutating (alias-safe). `Readonly<LogEntry>` on sink/formatter inputs.
- **Tests (standard 7).** Colocated `log.test.ts`, 61 `describe` blocks, alphabetized, mirroring the 61 exported functions one-to-one (the 4 exported interfaces are opaque tokens, not describe-bound). No dead exports; every exported function is imported and exercised. The suite nonetheless cannot run until the type blocker is fixed (`log.test.ts:2` imports `LogSignals`).

## Composition / bedrock (standard 1)

The file is large but is mostly a flat catalog of small free functions over shared module state, not a monolith of config-gated branches — closer to simple-by-composition than to a decomposition smell. The one real composition question (whether tracing — spans/groups/timers — is `log`'s bedrock or wants to be extracted into a `tracing`/`telemetry` neighbor) is a charter Open-direction fork, not a merge defect; routed to Notes, not raised as a must-fix.

## Standard 5 (subject triad / plurality guard)

No new format-codec or backend code is mis-homed here. The `LogTransportBackend` seam belongs in `@flighthq/types` (correct), and the parked `@flighthq/log-formats` reader split is gated on a second consumer — consistent with the plurality guard. No premature split. Pass.
