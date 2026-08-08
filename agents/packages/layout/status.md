---
package: '@flighthq/layout'
updated: 2026-08-08
by: principal
---

# layout — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/layout/src/` and `packages/types/src/Layout.ts` on
2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The item style has no box model.** `FlexLayoutItemStyle` carries only `alignSelf` / `basis` /
  `grow` / `shrink` (`types/src/Layout.ts:36`), and `GridLayoutItemStyle` only placement and spans
  (`:61`). There is no margin, no min/max width or height, and no aspect ratio on any of the three
  kinds — padding and gap exist on the *container* only. A caller wanting a clamped child has nowhere
  to put the bound.
- **Wrapped flex lines have no cross-axis distribution.** `FlexLayoutContainerStyle` exposes `align`
  but no `alignContent` (`types/src/Layout.ts:24`), so multi-line packing follows accumulated line
  cross-sizes (`flexLayout.ts:93`) with no way to centre, space, or stretch the line set.
- **All sizes are absolute floats; percentages do not exist.** `intrinsicSizes` is two floats per node
  and `out` four (`resolveLayoutTree.ts:44`), and the only relative unit anywhere is the grid
  `fraction` track (`types/src/Layout.ts:43`). Scale mode is still unbound.
- **Nothing outside the package resolves a layout.** The only importers of `@flighthq/layout` are the
  two size fixtures and the `sdk` barrel re-export; no package calls `resolveLayoutTree`. The Rive
  descriptor translation is gestured at from `scene2d-formats/src/riveLayout.ts:53` but not written.
  Keeping it unwritten is deliberate — it avoids an importer dependency — but it leaves the contract
  unexercised by a second caller.
- **Failure reporting is last-failure-only.** `LayoutState` keeps a single `lastFailure*` set that
  `explainLayoutResolution` reads back (`resolveLayoutTree.ts:11-28`); a tree with several bad nodes
  reports one. The guard (`enableLayoutGuards.ts:5`) is opt-in and sees the same single record.

Bundle isolation still holds: the size baseline records `layout:canvas` at 647 bytes and
`layout:canvas:all` at 2634, so anchor-only use retains neither flex nor grid.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Added the missing front matter (the file had none) and converted to the Open + Log
  contract. Every 2026-08-04 claim re-verified against source and still holds — flat-tree and
  numeric-buffer contracts, the open last-write-wins resolver registry (`layoutState.ts:20`),
  anchor/flex/grid built-ins, sentinel failures with `explainLayoutResolution`, the opt-in guard, and
  the two size fixtures. Only the measured all-built-ins figure had drifted, from 2.56 KB to 2634
  bytes. No code changed.
- **2026-08-04** — First complete increment: `@flighthq/layout` built as a types-only,
  renderer-neutral rectangle resolver with an open resolver registry and bundle-isolation evidence.
