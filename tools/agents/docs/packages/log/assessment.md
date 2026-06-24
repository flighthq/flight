---
package: '@flighthq/log'
updated: 2026-06-24
basedOn: ./review.md
---

# log — Assessment

The review verdict is `solid` (86/100): one builder pass closed the **entire** prior Bronze/Silver/Gold maturation roadmap — multi-sink fan-out, global + per-channel gates, lazy payloads, contextual loggers, pluggable formatters, the sink combinators, rate limiting/sampling, timers/groups/spans, the transport seam, redaction + custom serializers, and the signals group are all built and tested (114 tests, 61 exports). So the roadmap is **absorbed**, not pending: what remains is a thin residue of corrections plus a set of items each blocked on a stub-charter decision. Recommended is therefore small by design; most of the residual surface is genuinely parked on an Open direction, not sweep-safe.

The maturation roadmap (`reviews/maturation/depth/log.md`) is fully absorbed here and may be removed as one-time seed.

## Recommended

Sweep-safe: within `@flighthq/log` (+ the colocated `@flighthq/types` file it owns), no cross-package coupling, no breaking change, no open design decision.

- **Fix the stale `createHttpLogSink` docstring.** The doc comment on `createWebLogTransportBackend` (`packages/log/src/log.ts`) still describes the deferred HTTP sink ("ships entries to a remote HTTP endpoint via batched POST … flushed when the batch reaches `batchSize`") — an orphaned leftover sitting on the no-op web backend. Rewrite it to describe what actually shipped (the web default transport backend). — review.md#contract--docs-fit
- **Fix the `LogTransportBackend.ts` reference to `createHttpLogSink`.** The type doc in `@flighthq/types` likewise points at `createHttpLogSink`, which does not exist. Correct it to the shipped `createFileLogSink` / `LogTransportBackend` story. This is the colocated type file `log` owns, so it stays within the package's sweep. — review.md#contract--docs-fit

## Backlog

Parked: each waits on a charter Open direction, or is cross-package / larger than a sweep.

- **`createHttpLogSink` (batched-POST-with-retry remote sink).** Parked on **Open direction #1 (scope ceiling — seam or library?)**. Whether the canonical remote sink is owed or out of scope is precisely the boundary the stub charter has not set; the status doc argues the `LogTransportBackend` + `createBufferedLogSink` composition already covers it. Do not build until the scope ceiling is blessed. — review.md#gaps
- **Size/allocation proof (`npm run size` baseline + `log.bench.ts`).** Parked on **Open direction #6**. The headline claims (emit-only import carries only the gate + `LogLevel`; suppressed `logVerbose` allocates nothing) are implemented but unmeasured. Promoting them from prose-by-inspection to an enforced gate is a Decision the user should make, not a silent sweep — and it touches the root `size` baseline surface. — review.md#gaps
- **`flighthq-log` Rust crate (1:1 conformance).** Cross-package: lives in the Rust worktree, not `packages/log`. The charter front matter declares `crate: flighthq-log`, so the mirror is owed, but it should port a _settled_ API (after the scope ceiling and process-global questions resolve), and the intended mapping (`LogDataProvider`→`FnOnce`, `LogSink`→`Arc<dyn Fn + Send + Sync>`) is already recorded for that pass. — review.md#gaps
- **`disableLogSignals` + fast-path restoration.** Parked on **Open direction #3**. Today `enableLogSignals` is one-way (consistent with the rest of the `enable*` family) and permanently bypasses the empty-sinks fast path for the process lifetime. Whether to add a reversal is an API-symmetry decision against the house `enable*` convention, not a sweep. — review.md#gaps
- **Per-handle file-sink ownership.** Parked on **Open direction #2 (process-global as the model)**. `createFileLogSink` hands back distinct tokens that all write to — and all dispose — the single global `_transportBackend`; the per-handle token implies ownership it does not have. Giving each handle a real backend is a redesign of the process-global model, which the charter has not yet blessed. — review.md#gaps
- **`@flighthq/log-formats` neighbor (`parseLogEntry`, NDJSON/logfmt/CLF).** Parked: a new triad `-formats` cell, blocked by the **plurality guard** (held until a second `logs.jsonl` consumer appears) and surfaced as **Open direction #5** to confirm that bar. New-package scope, not within-package work. — review.md#gaps

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._

---

### Surfaced to the charter's Open directions (not edited here)

The review already enumerates six candidate Open directions; this assessment does not resolve them and does not touch the charter. They gate the Backlog above and should be settled in a direction session:

1. **Scope ceiling — narrow capture seam or full logging library?** (gates `createHttpLogSink`, sampling/spans breadth).
2. **Process-global state as the model** — eleven module-level mutable values foreclose multiple independent loggers (gates per-handle file-sink ownership).
3. **`enableLogSignals` irreversibility** — is enable-once-for-process-lifetime the rule? (gates `disableLogSignals`).
4. **Tracing-stack ambition** — is `log` the home for spans/groups/timers, or a future `tracing`/`telemetry` neighbor's job?
5. **`-formats` split trigger** — confirm the plurality-guard bar for `@flighthq/log-formats`.
6. **Size/bench gate as a Decision** — promote the zero-allocation / emit-only-import claims to an enforced baseline?
