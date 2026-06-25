---
package: '@flighthq/log'
updated: 2026-06-25
basedOn: ./review.md
---

# log — Assessment

Reasoned over `review.md` (2026-06-25 merge review of integration `b2824e3d8` against the approved base `origin/main` `eb73c3d74`). The candidate cannot merge until it builds. Recommendations below are within-package, sweep-safe; the design forks the candidate surfaced are routed to the charter's Open directions, not into Recommended.

## Recommended (sweep-safe, within-package)

1. **Land the seven Log types in `@flighthq/types` before this merge.** Author `LogContext`, `LogDataProvider`, `LogFormatter`, `LogSignals`, `LogSpan`, `LogTimer`, `LogTransportBackend` as their own files under `packages/types/src/` (one concept per file, filename = type name), exported from the types barrel, then re-run `tsc -b`. This is the build blocker — `log.ts:2-13` and `log.test.ts:2` import them and the integration tree defines none. Non-negotiable for merge. (The source worktree `67dc46d64` reportedly had them; the carried-over types files were dropped in assembling `b2824e3d8`.)

2. **Remove the three banner divider comments** in `log.ts` (lines 29-31, 613-615, 639-641). They violate the Source Style "no structural divider comments" rule; names and file position already carry the boundaries. While there, fix the mislabeled docstring on `addLogSink` (tagged both "Emit side" by the banner above it and "Listener side" by its own comment).

3. **After the build is green, re-derive `review.md`'s status/score from the actually-integrated tree** rather than the as-claimed `solid`/86 inherited from `67dc46d64`. The carried review over-claimed against `b2824e3d8`.

## Backlog (parked, with why)

- **`npm run size` baseline + `log.bench.ts` for the emit-only / zero-alloc-suppressed claims.** Promotes the headline tree-shake claim from assertion-by-inspection to an enforced gate. Parked: it is a new enforcement mechanism (bundle-discipline fork), not a sweep, and is a charter Decision to bless first (Open direction 7).
- **Rust `flighthq-log` crate.** Charter front matter declares `crate: flighthq-log`, but no crate exists. Parked: cross-worktree, and gated on the TS scope ceiling settling (Open direction 8).
- **`@flighthq/log-formats` reader split** (`parseLogEntry`/NDJSON/logfmt). Parked: gated on a second `logs.jsonl` consumer per the plurality guard (Open direction 6). Not owed now.

## Approved

_None. Approval is the user's verbal gate; nothing is auto-approved by this assessment. This section is filled only when the user blesses an item in a direction session._

## Notes for the charter's Open directions

These are design forks the candidate touches — they belong in `charter.md › Open directions` (several already enumerated there), not in Recommended:

- **Scope ceiling — narrow capture seam vs. full logger** (charter dir. 1). This pass executed the full-library breadth (sampling, rate-limit, spans, contextual loggers). Whether that breadth is the blessed target is the user's call; the merge should not be read as blessing it.
- **Process-global state model** (charter dir. 3). Eleven module-level mutables; forecloses multiple independent loggers. Ambient-backend-vs-handle is an open fork, not a merge defect.
- **Tracing-stack ambition / bedrock** (charter dir. 5). Spans/groups/timers may want extraction into a `tracing`/`telemetry` neighbor; deciding this is where `log`'s bedrock lies.
- **File-sink handle ownership** (charter dir. 9). `createFileLogSink` hands out distinct handles that all write to and dispose the one shared `_transportBackend` — bless shared-backend or make handles own their transport.
- **`enableLogSignals` irreversibility** (charter dir. 4). No `disableLogSignals`; once enabled the empty-sinks fast path is bypassed for the process lifetime.
