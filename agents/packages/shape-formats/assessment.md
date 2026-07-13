---
package: '@flighthq/shape-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# shape-formats — Assessment

See [charter](./charter.md) for blessed direction and [review](./review.md) for the evidence.

## Recommended

Sweep-safe: within `@flighthq/shape-formats`, no cross-package coupling, no breaking change, no open design fork.

1. **Arity + positional-type validation in `parseShapeJson`** — validate each entry's arg count and per-position type (number/string/boolean/array/matrix/bitmap/null-allowed) against the known `ShapeCommandRegistry` tuple shapes before replaying, returning `null` on mismatch. Closes the corrupt-shape hole (review Gap 1) and *completes* the charter's own 2026-07-09 "sentinel `null` on malformed input" Decision — no new design needed.
2. **Complete the round-trip test to the full command vocabulary** — extend `createEveryNonBitmapCommandShape` (or add cases) so `drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, `drawTriangles`, and `lineGradientStyle` are byte-for-byte round-tripped, making the test name true (review Gap 2). Add wrong-arity/wrong-type malformed cases alongside.
3. **`explainShapeJsonParse` diagnostics query** — a shakeable `explain*` companion returning plain data (reason code, offending command index/key) for every `null` path, plus a count/list of dropped bitmap-bearing commands, per the diagnostics inversion rule (review Gap 3). Separately importable; costs the codec's bundle nothing.
4. **Non-finite number handling** — decide-and-implement the local rule within the existing strict contract: reject non-finite arg values on parse (they arrive as `null` in slots typed as number). Format-side, either pass through (garbage-in) or guard via the explain layer; the parse-side rejection is the sweep-safe half (review Gap 4).

## Backlog

Parked, with why:

- **SVG export/import (`formatShapeSvg` + import)** — charter Open direction 1, explicitly deferred at the 2026-07-09 direction session; awaits the user's bless-to-build. The meatiest coverage item, not sweep-safe by charter status.
- **Path-formats interplay** (SVG export emitting `d` strings via `@flighthq/path-formats`) — charter Open direction 2; rides on the SVG decision.
- **Stable bitmap references** (format-side `referenceBitmap` id hook instead of/alongside ordinals) — extends a blessed Decision's shape; needs a direction call (review Candidate 1).
- **Custom-command codec registry** (fork B: `registerShapeJsonCommand`-style per-key arg codec matching the declaration-merged `ShapeCommandRegistry`) — design fork; route to charter Open directions (review Candidate 2). Note item 1 above narrows the blast radius meanwhile (unknown object args become `null`, not bogus bitmaps).
- **Strict vs lenient parse / version-migration policy** — would revise the blessed strict-`null` Decision; a design fork for the charter (review Candidate 3).
- **Binary/compact form, streaming** — charter silent; scope call for the user (review Candidate 4).
- **Public command iterator in `@flighthq/shape`** (`forEachShapeCommand`) — cross-package; shape's cell owns it (review Candidate 5).
- **Charter Boundaries dep-list touch-up** (add `@flighthq/geometry`) — a charter edit, owned by the next direction session, not this assessment.

## Approved

None.
