---
package: '@flighthq/layout'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# layout — Review

## Verdict

**solid — 78/100.** The package delivers a well-bounded, allocation-free rectangle layout primitive
with an open resolver registry and three built-in policies (anchor, flex, grid). Types live in
`@flighthq/types`, the two export lanes are correct, the dependency is types-only, and bundle
isolation is proven by tree-shaking tests. The score drops from the prior 86 because the hardening
pass (status 2026-08-13) surfaced real gaps that were previously invisible, the item-level box model
remains absent, no external consumer exercises the API, and the failure-reporting model remains
single-slot. The code is clean, the contract is honored, and what it does it does well; the gaps are
in what it does not yet do.

## Present capabilities

### Core resolver loop (`resolveLayoutTree.ts`, 146 lines)

- `resolveLayoutTree(out, state, tree, intrinsicSizes, availableWidth, availableHeight)` validates
  buffer sizes and parent-before-child hierarchy, writes each root as the available rectangle, then
  dispatches each non-root child through its parent's registered resolver. Returns `boolean`; on
  failure stores a compact record on `LayoutState`.
- `explainLayoutResolution(state, tree, nodeIndex)` materializes a detached
  `LayoutResolutionExplanation` for the latest matching sentinel, or diagnoses
  hierarchy/registration at a given index without mutating state.
- Non-finite and negative available sizes are normalized to zero via `finiteSize`.
- Failure kinds: `OutputTooSmall`, `IntrinsicSizesTooSmall`, `InvalidHierarchy`,
  `UnregisteredKind`, `InvalidContainerStyle`, `InvalidItemStyle`.

### State and registry (`layoutState.ts`, 27 lines)

- `createLayoutState()` allocates the state with an empty `Map<string, LayoutResolver>` and no
  retained failure.
- `registerLayoutResolver(state, kind, resolver)` is open, last-write-wins, and accepts `null` to
  unregister. Built-in kind strings are `'AnchorLayout'`, `'FlexLayout'`, `'GridLayout'`; custom
  kinds use vendor prefixes (`acme.Flow`).

### Anchor resolver (`anchorLayout.ts`, 105 lines)

- `registerAnchorLayoutResolver(state)` installs the anchor policy.
- Supports natural or fixed size, four edge pins (`left`, `right`, `top`, `bottom`), opposing-pin
  stretch, and shared `ViewportAlign` positioning. Container style must be empty or null; item style
  is `AnchorLayoutItemStyle | null`.
- The resolver is a single linear pass per child with no intermediate allocation.
- Runtime validation (`isAnchorLayoutItemStyle`, `isAlign`, `isOptionalNumber`) rejects malformed
  descriptors with `InvalidItemStyle` / `InvalidContainerStyle` sentinels.

### Flex resolver (`flexLayout.ts`, 317 lines)

- `registerFlexLayoutResolver(state)` installs the flex policy.
- Supports `direction` (row/column and reverse), `gap`, four padding fields, `justify` (start, end,
  center, space-between, space-around, space-evenly), `align` (start, end, center, stretch), and
  `wrap` (nowrap, wrap, wrap-reverse).
- Item properties: `basis` (number or `'auto'`), `grow`, `shrink`, `alignSelf` (including `'auto'`
  fallback to container align).
- Weighted shrink uses a freeze loop (`getFlexShrinkScale`) that repeatedly freezes items whose
  reduction reaches zero and redistributes the remaining deficit, matching CSS flex shrink behavior
  without temporary arrays.
- `wrap-reverse` reverses cross-axis stacking and flips start/end alignment within reversed lines.
- Skips interleaved descendants when positioning later siblings (supports nested flex containers).
- All validation functions (`isFlexLayoutContainerStyle`, `isFlexLayoutItemStyle`) reject malformed
  enum values, negative numbers, and non-finite values.

### Grid resolver (`gridLayout.ts`, 229 lines)

- `registerGridLayoutResolver(state)` installs the grid policy.
- Tracks: `fixed` (absolute size), `fraction` (proportional to remaining space after
  fixed/auto/gaps), `auto` (sized to intrinsic content). Container requires non-empty `columns` and
  `rows` arrays plus optional `columnGap`, `rowGap`, and four padding fields.
- Item properties: `column`, `row` (zero-based, explicit or auto-assigned row-major), `columnSpan`,
  `rowSpan`.
- Auto-track sizing distributes a spanning item's remaining intrinsic demand (after deducting fixed
  tracks and gaps) equally across the auto tracks in the span.
- Fraction allocation deducts fixed tracks, auto tracks, and gaps before distributing proportionally.
- No temporary arrays; traverses siblings for ordinal and auto-size on each child.

### Guard layer (`enableLayoutGuards.ts`, 7 lines)

- `enableLayoutGuards(state, warningSink)` attaches a caller-owned `LayoutResolutionGuard` callback.
  The package does not choose a logging dependency; adapting to `@flighthq/log` is the caller's
  concern.

### Tests (1,129 lines across 7 files, 104+ cases after hardening)

- `anchorLayout.test.ts` (82 lines): alignment for all 8 `ViewportAlign` values, opposing-pin
  stretch, single-axis pin override, nested propagation, invalid style rejection.
- `flexLayout.test.ts` (445 lines): growth distribution, weighted shrink with freeze loop, zero
  shrink preservation, basis-auto vs. explicit zero, all six justify modes, four directions including
  reverse, padding/gap interaction, wrapping, wrap-reverse with alignment inversion, nested
  column-from-asymmetric-parent, interleaved descendant skipping, invalid enum and field rejection,
  non-finite intrinsic normalization.
- `gridLayout.test.ts` (333 lines): fixed/fraction/auto track sizing, unequal fraction distribution,
  row-major auto-placement, spans with padding and independent gaps, intrinsic sharing across auto
  spans, deduction of fixed tracks/gaps from spanning intrinsic contributions, nested fractional
  grids, invalid container/item/span rejection.
- `resolveLayoutTree.test.ts` (173 lines): root rectangle writing, buffer-too-small sentinels,
  hierarchy validation, retained failure matching and clearing, unregistered-kind diagnostics,
  `FlightDocumentLayoutBinding` consumption.
- `layoutState.test.ts` (28 lines): initial state, last-write-wins and null-unregister behavior.
- `enableLayoutGuards.test.ts` (16 lines): structured explanation delivery through the guard.
- `layoutTreeShaking.test.ts` (52 lines): esbuild-based proof that anchor-only assembly excludes
  flex and grid, and that each registrar pulls only its own resolver.

### Bundle evidence

Size baseline: `layout:canvas` at 647 bytes (anchor-only), `layout:canvas:all` at 2634 bytes (all
three built-ins). Tree-shaking tests confirm each resolver is independently shakeable.

### Types (`@flighthq/types`)

All exported types live in `packages/types/src/Layout.ts` (125 lines) and
`packages/types/src/FlightDocumentLayout.ts` (25 lines). The layout package exports functions only,
conforming to the types-home rule. `FlightDocumentLayoutBinding` types demonstrate the inert
association pattern for scene-node binding.

## Gaps

### Item-level box model

`FlexLayoutItemStyle` carries only `alignSelf`, `basis`, `grow`, and `shrink`.
`GridLayoutItemStyle` carries only placement and spans. Neither kind has margin, min-width,
max-width, min-height, max-height, or aspect ratio. Padding and gap exist on the container only. A
caller wanting a clamped, spaced, or aspect-locked child has nowhere to express it. (Status confirms
this is known.)

### Flex `alignContent`

`FlexLayoutContainerStyle` has `align` (cross-axis alignment of items within a line) but no
`alignContent` (distribution of lines within the cross-axis space). Multi-line wrapping accumulates
line cross-sizes with no way to center, space, or stretch the line set. (Status confirms.)

### Percentage and relative units

All sizes are absolute floats. The only relative unit is the grid `fraction` track. No percentage
width/height, no `calc`-like expressions, no viewport-relative units. (Status confirms.)

### No external consumer

No package outside the test/size fixtures and the `sdk` barrel actually calls `resolveLayoutTree`.
The Rive translation in `scene2d-formats/src/riveLayout.ts` (669 lines) produces `LayoutNode`
descriptors and `FlexLayoutContainerStyle` / `FlexLayoutItemStyle` / `GridLayoutContainerStyle` /
`GridLayoutItemStyle` objects — it is a real producer of layout data — but nothing downstream wires
those descriptors into `resolveLayoutTree`. The `gui` package references `@flighthq/layout` only in
a tree-shaking test. The API contract is exercised by its own tests alone.

### Single-slot failure reporting

`LayoutState` retains a single `lastFailure*` record. A tree with multiple invalid nodes reports
only the first one encountered. `explainLayoutResolution` reads back the same single record. The
guard sees one failure per resolution call. For diagnostic completeness, a multi-failure accumulation
or callback-per-failure model would be needed. (Status confirms.)

### Internal duplication

`finiteSize(value: number): number` is duplicated identically across all four implementation files
(`anchorLayout.ts:91`, `flexLayout.ts:315`, `gridLayout.ts:227`, `resolveLayoutTree.ts:144`).
`isNonNegativeOptionalNumber` and `isNonNegativeNumber` are duplicated between `flexLayout.ts` and
`gridLayout.ts`. These are private file-scoped helpers (not exported), so there is no API issue, but
the duplication is a maintenance surface. The tree-shaking architecture may justify per-file copies
to keep each resolver independently shakeable; if so, a shared unexported module would not change
the bundle.

### Grid auto-placement limitations

Grid auto-placement is row-major only. There is no dense packing, no named lines, no implicit track
growth (items that exceed the explicit grid are rejected), and no auto-flow direction control. The
charter explicitly scopes this: "Grid is not a table engine." The question is whether the
deliberately smaller grid needs any of these for the Rive / application-UI use cases that are its
near-term consumers.

## Charter contradictions

None. The code faithfully implements every stated principle:

- **Flat numeric-buffer boundary** (Decision 2026-08-04): `LayoutTree.nodes` is parent-before-child,
  `intrinsicSizes` is two floats per node, `out` is four floats per node, both caller-owned.
  Confirmed in `resolveLayoutTree.ts:47-54`.
- **Container and item roles stay distinct** (Decision 2026-08-04): `containerStyle` on the node
  arranges its children; `itemStyle` is interpreted by the parent's resolver. Confirmed in all three
  resolver implementations.
- **Open resolver registry; opt-in built-ins** (Decision 2026-08-04): `registerLayoutResolver` is
  last-write-wins, accepts null. Three separate `register*LayoutResolver` functions. Confirmed in
  `layoutState.ts:20-27` and the three resolver modules.
- **Viewport alignment is shared vocabulary** (Decision 2026-08-04): Anchor items reuse
  `ViewportAlign`; `ViewportScaleMode` is absent. Confirmed in `anchorLayout.ts:1,34`.
- **Expected failures use sentinels plus a shakeable explanation** (Decision 2026-08-04):
  `resolveLayoutTree` returns `false`, `explainLayoutResolution` materializes detail,
  `enableLayoutGuards` is separate. Confirmed in `resolveLayoutTree.ts:11-42,47-104` and
  `enableLayoutGuards.ts:5-7`.
- **Depends only on `@flighthq/types`** (Boundary): `package.json` dependencies list only
  `@flighthq/types`. No imports from any other `@flighthq/*` package. Confirmed.
- **No constraint solving, text measurement, or display-node binding** (Boundaries): None present.

## Contract and docs fit

### Package to contract

- **Types in `@flighthq/types`**: All exported interfaces and type aliases live in
  `types/src/Layout.ts` and `types/src/FlightDocumentLayout.ts`. The layout package exports
  functions only. Fully conforming.
- **Full unabbreviated names**: `resolveLayoutTree`, `explainLayoutResolution`,
  `registerAnchorLayoutResolver`, `registerFlexLayoutResolver`, `registerGridLayoutResolver`,
  `createLayoutState`, `registerLayoutResolver`, `enableLayoutGuards`. All use full, globally
  self-identifying names. Fully conforming.
- **Out-parameters**: `resolveLayoutTree` writes to a caller-owned `Float32Array out`. Conforming.
- **Sentinels not throws**: Resolution returns `false`; no exceptions thrown for expected failures.
  Conforming.
- **Two export lanes**: `index.ts` (public, curated 8 exports) and `contract.ts` (full surface via
  re-exports). Conforming.
- **`sideEffects: false`**: Declared in `package.json`. No module-level side effects; all resolvers
  require explicit registration. Conforming.
- **Readonly parameters**: All `tree`, `intrinsicSizes`, `containerStyle`, `itemStyle` parameters
  are `Readonly<>`. `state` in `registerLayoutResolver` and `enableLayoutGuards` takes
  `Readonly<LayoutState>` despite mutating `state.resolvers` and `state.guard` — this works because
  `Readonly` is shallow and `Map.set`/`Map.delete` mutate the map value without reassigning the
  property, but it is semantically misleading. The function does mutate state; the `Readonly`
  wrapper suggests it does not.

### Contract/docs to package

- **Package Map line**: `layout` is listed under "Core" in `AGENTS.md`. This is accurate; it has no
  rendering dependency and sits at the core layer.
- **`crate: flighthq-layout`**: Charter declares the Rust crate name. No Rust code exists yet.
  Placeholder is correct per convention.

### Candidate contract revisions

- `registerLayoutResolver` and `enableLayoutGuards` accept `Readonly<LayoutState>` but mutate the
  state through its `resolvers` Map and `guard` property. The shallow `Readonly` is technically
  valid but violates the spirit of the codebase constraint ("Use `Readonly<T>` everywhere mutation
  is not intended"). These functions intend mutation; they should accept `LayoutState`, not
  `Readonly<LayoutState>`.

## Candidate open directions

These are questions the charter does not answer that this review had to assume:

1. **Should the item-level box model (margin, min/max dimensions, aspect ratio) be part of this
   package or a separate consumer concern?** The status identifies the gap; the charter is silent on
   whether the package should grow to include it or whether consumers should compose it externally.
2. **Should failure reporting accumulate multiple failures per resolution, or is single-failure
   sufficient for the expected use cases?** The charter's Decision on sentinels says "stores a
   compact failure record" (singular). The status notes the limitation but does not settle whether
   multi-failure reporting is a goal.
3. **What is the intended path for exercising the API through a real consumer?** The Rive importer
   produces layout descriptors; the `FlightDocumentLayoutBinding` type exists; but no package wires
   them together through `resolveLayoutTree`. The charter's Open direction #1 (scene2d binding)
   gestures at this, but no timeline or trigger is stated.
