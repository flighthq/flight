---
package: '@flighthq/debug'
updated: 2026-09-08
basedOn: ./review.md
---

# debug — Assessment

Sorted from the 2026-09-02 review (`review.md`). All 6 review gaps verified open against source 2026-09-08.

## Directed

_None._

## Recommended

Strictly sweep-safe: within `@flighthq/debug`, no unresolved design decision.

- **Fix `disableDebug` to restore only the channels the session touched** instead of calling `clearLogChannelLevels()` wholesale. The enable path already snapshots per-channel levels; `disableDebug` should restore from that snapshot rather than wiping all overrides.

## Depth gaps

1. **No introspection/explain surface.** No `getDebugSubsystemNames`, `explainDebugSession`, or `explain*` query exists. The silent-skip path for unregistered subsystem names has no diagnostics companion.
2. **`enableFlightDiagnostics` is one-way.** No `disableFlightDiagnostics` exists. Blocked on whether owning guard packages (`render`, etc.) grow `disable*Guards` counterparts — a cross-package decision.
3. **No first-party subsystem registrations.** The 8 seeded `DebugSubsystemName` values in `@flighthq/types` have no corresponding `registerDebugSubsystem` calls anywhere outside the debug package. The names read as promises without implementations. Needs a decision on whether adapters ship here or in each owning package.
4. **Single-flavor session.** One global level for all selected channels; reconfiguring requires `disableDebug()` first. Low urgency at current scale.
5. **No frame-budget aggregation.** Charter Open direction 2 explicitly defers this to devtools.

## Backlog

_None._

## Approved

_None._
