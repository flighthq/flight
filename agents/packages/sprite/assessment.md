---
package: '@flighthq/sprite'
updated: 2026-09-02
basedOn: null # the review this reasoned over was deleted with the cell's source
absorbed: '@flighthq/scene2d + @flighthq/quadbatch + @flighthq/tilemap + @flighthq/particleemitter'
---

# sprite — Assessment

`@flighthq/sprite` has no source in this repo; its code was absorbed into `@flighthq/scene2d`,
`@flighthq/quadbatch`, `@flighthq/tilemap`, and `@flighthq/particleemitter`, and is surveyed there.
The review this assessment reasoned over was deleted on 2026-09-02 under the no-local-code rule, and
the `Recommended` and `Backlog` sections went with it. This file is retained only because the
`Approved` ledger below is append-only and the cell still exists.

## Approved

- [2026-07-02 · picked] Add `@flighthq/signals` to sprite package.json — merge blocker B2
- [2026-07-02 · picked] Replace inline `{ x; y }` out-params with `Vector2Like` — charter Decision #4
- [2026-07-02 · picked] Add named constant for `0xffff` deletion sentinel — charter Decision #1
