---
package: "@flighthq/spring"
updated: 2026-09-01
by: manager
---

# spring — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Checked against `packages/spring/src/` on 2026-09-01, after the impulse/preset/angle work landed in
`c96536bae`. The charter's Open-direction list is now empty; what follows is tree state, not
direction.

- **The angle spring is scalar only.** `updateSpringAngle` has no `2D`/`3D` mirror, unlike
  `updateSpring`, `applySpringImpulse`, and `resetSpring`, which all do. That is deliberate — an
  angular spring per vector component is not what a rotation target means — but it makes the mirror
  set deliberately asymmetric, and a reader scanning for `updateSpringAngle3D` should know it is
  absent by choice rather than by omission.
- **Presets are three points, and the naming does not match the charter's earlier sketch.** The open
  direction had guessed at four (gentle / wobbly / stiff / slow); what shipped is
  `SpringPresetBouncy`, `SpringPresetGentle`, `SpringPresetStiff`. Nothing is wrong here, but any
  doc or example written against the old four-name sketch is stale.
- **No guard module and no `explain*` query.** `updateSpringAngle` treats a non-positive or
  non-finite `fullTurn` as inert, and `updateSpring` no-ops on `deltaTime <= 0`. Both are silent
  sentinels with no `enableSpringGuards` seam and no `explain*` counterpart, in a package where the
  visible symptom of either is "the spring does not move" — the hardest kind of nothing to debug.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-09-01** — Impulse (`applySpringImpulse` + 2D/3D mirrors), frozen presets, and
  `updateSpringAngle` landed in `c96536bae`; charter Decision recorded and all three Open directions
  closed. Status rewritten to the `Open`/`Log` contract from the old append-only log stub.
