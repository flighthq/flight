---
package: '@flighthq/layout'
updated: 2026-08-04
basedOn: ./review.md
---

# layout — Assessment

## Recommended

_None before a consumer exists._ The package's current boundary is deliberate; scene binding, Rive
translation, constraint solving, and richer table/grid behavior require consumer evidence or a separate
direction.

## Landed

1. Header-first flat-tree and numeric-buffer contracts in `@flighthq/types`.
2. Open, last-write-wins resolver registry and separate anchor/flex/grid registrars.
3. Allocation-free successful resolution, linear anchor propagation, sentinel diagnostics, and an
   opt-in guard.
4. Package exports limited to `.` and `./contract`, types-only dependency, bundle exclusion tests, and
   paired size fixtures.
5. Architecture findings for viewport N=1 composition, Rive/Yoga translation, constraint/text/table
   boundaries, and the shared numeric compute convention.

## Backlog

- Rectangle-to-node binding, Rive importer wiring, and constraint solving are explicitly outside this
  increment, not missing pieces of its contract.
