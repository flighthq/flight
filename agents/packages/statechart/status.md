# statechart — Status

Continuity log for `@flighthq/statechart`. See [charter](./charter.md) for the package boundary and blessed decisions.

## Current state — initial runtime complete (2026-08-04)

The package header and runtime are complete. The settled surface includes immutable chart data, mutable typed-array actors, concurrent regions, Boolean/Number/Trigger inputs, all-condition guarded transitions, reported blend progress, sentinel state/blend/name queries, an explain query, and opt-in standard signals stored only on instances. State kinds are open strings seeded with `Statechart.Atomic` and `Statechart.Nested`; core dispatch is kind-agnostic.

Exit time is settled as a two-way plain-number composition seam: core accumulates `regionElapsed`, composition supplies `regionDuration` through `setStatechartRegionDuration`, and transitions compare their ratio. Zero/unset duration coerces to no exit requirement while `MissingRegionDuration` explains the caller error and `enableStatechartGuards` warns when opted in.

## Verified boundaries

- No changes to `@flighthq/flow`.
- No animation, scene, renderer, geometry, or authoring-format dependency.
- Signal and guard modules shake out for a count/read-only consumer; the focused bundle probe confirms zero signal/log bytes in the core consumer, and `npm run size` passes.
- Authored `Statechart` data contains no callbacks and remains serializable/portable.

The package's 43 focused tests pass, along with its build, API report, portable-source, export, package-layer, documentation, and full size gates.
