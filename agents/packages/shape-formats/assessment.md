---
package: '@flighthq/shape-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# shape-formats — Assessment

See [charter](./charter.md) for blessed direction and [review](./review.md) for the evidence.

## Recommended

1. **`explainShapeJsonParse` diagnostics query — still open, but the prescription needs re-confirming before it is built.** The item predates the `ImportDiagnostic` crumb system, which has since become the way format parsers report what they dropped: `@flighthq/importdiagnostics` exists, `ImportDiagnostic` is in `@flighthq/types`, and four `-formats` packages have adopted it (`scene3d-formats` 9 sites, `particles-formats` 8, `skeleton2d-formats` 3, `scene2d-formats` 2) with more under active review. `shape-formats` is simply not migrated yet. Building a bespoke `explain*` here now would add public surface that the migration would then have to remove, so this needs a ruling: does a `-formats` parser report through crumbs, through `explain*`, or both — and if both, which failures belong to which? The AGENTS.md inversion rule ("every silent sentinel gets a shakeable `explain*`") and the crumb convention both plausibly claim this, which is exactly why it should not be guessed. Raised 2026-07-30 during the sweep that closed the other three items.

## Landed

- ~~**Arity + positional-type validation in `parseShapeJson`.**~~ Landed 2026-07-30 (`7d1c8836a`) as a table-driven spec mirroring the `appendShape*` signatures one-for-one, with `required`/maximum arity so a hand-written document may omit trailing optional args and let the appenders' own defaults apply.
- ~~**Complete the round-trip test to the full command vocabulary.**~~ Landed. `createEveryNonBitmapCommandShape` now exercises `drawCircle`, `drawEllipse`, `drawRectangle`, `drawRoundRectangle`, both `drawTriangles` forms (with and without indices/uv), and `lineGradientStyle`, alongside malformed-arity and wrong-type cases.
- ~~**Non-finite number handling.**~~ Landed as scoped: the parse-side rejection. Format-side is now documented rather than guarded — see [status](./status.md) for why that asymmetry is the honest one.

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
