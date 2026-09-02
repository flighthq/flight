---
package: '@flighthq/sdk'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# sdk -- Review

> Full-tree survey of `packages/sdk/` and its supporting scripts (`scripts/sdk-policy.ts`,
> `scripts/packages.ts:checkSdkBarrelSync`). All claims verified against files on disk.

## Verdict

**Solid -- 82/100.** The barrel does its core job: 154 `export *` lines in `index.ts` re-export
every eligible `@flighthq/*` package, matched 1:1 by `package.json` dependencies (154 entries) and
`tsconfig.json` references (154 paths). Mechanical enforcement through `checkSdkBarrelSync` in
`packages:check` prevents drift. The package owns no code, types, or runtime, matching the charter's
"pure barrel, zero own code" north star. `"sideEffects": false` is declared.

Score is below the prior review's 90 for three structural issues that have widened since that
assessment: (1) the `.`/`./contract` lane gap now spans ten packages, not six; (2) the barrel sync
check still does not cover `contract.ts`, so the gap passes CI silently; and (3) both `index.ts` and
`contract.ts` remain unsorted with a UTF-8 BOM, and six of thirteen group files are also unsorted.

## Present capabilities

- **154-package barrel.** `src/index.ts` re-exports 154 packages via `export *`. Every re-exported
  package appears as a `"*"` dependency in `package.json` and as a `tsconfig.json` reference.
- **Contract lane.** `src/contract.ts` re-exports 144 packages. Four of these use the
  `@flighthq/<pkg>/contract` subpath (`gui`, `gizmo`, `selection`, `scene2d-resources`), exposing
  the contract surface of packages whose `.` lane differs from their `./contract` lane.
- **Thirteen categorized group subpaths.** `package.json` exports `./animation`, `./application`,
  `./core`, `./formats`, `./game`, `./interaction`, `./media`, `./platform`, `./rendering`,
  `./resources`, `./scene2d`, `./scene3d`, and `./text`. Each is backed by a source file in `src/`.
  The union of all thirteen group files exactly covers the 154 packages in `index.ts` -- every
  package appears in exactly one group, enforced by `checkSdkBarrelSync`.
- **Mechanical completeness enforcement.** `checkSdkBarrelSync` in `scripts/packages.ts` (lines
  675-797) reads every workspace `package.json`, applies `isSdkBarrelExcludedPackage` from
  `scripts/sdk-policy.ts`, and verifies: (a) every eligible package has an `export *` line in
  `index.ts` and a `"*"` dependency; (b) no excluded package appears in either; (c) every
  barrel export appears in exactly one group file.
- **Exclusion policy.** `sdk-policy.ts` excludes `@flighthq/sdk` itself, `@flighthq/host-*`,
  `@flighthq/tool-*`, and `*-rs` packages.
- **Spot-check test.** `src/index.test.ts` (112 lines, 21 `it` blocks across 10 inner `describe`
  blocks) verifies representative exports: `create*` functions are functions, `*Kind` constants
  carry expected string values. One test asserts `setCanvasRenderTransform2D`,
  `setGlRenderTransform2D`, and `setWgpuRenderTransform2D` are reachable through both `sdk` and
  the `./rendering` group barrel.

## Gaps

1. **Ten packages in `.` but not `./contract`.** `abc`, `compression`, `layout`, `physics2d`,
   `physics2d-abi`, `physics3d`, `physics3d-abi`, `skeleton2d-formats`, `swf`, and `tokens` are
   `export *` lines in `index.ts` with no counterpart in `contract.ts` (154 vs 144 lines). This
   inverts the lane rule everywhere else in the SDK, where `./contract` is the full surface and
   `.` is the cultivated subset. An intra-SDK consumer importing `@flighthq/sdk/contract` cannot
   reach ten packages the app lane exposes. The prior status recorded six; four more have
   appeared since.

2. **Barrel sync check does not cover `contract.ts`.** `checkSdkBarrelSync` parses only
   `src/index.ts` and `package.json` (lines 678-679, 693-702). It never opens `contract.ts`,
   which is why the ten-package gap above passes `packages:check` silently. The thirteen group
   files are checked against `index.ts` only.

3. **`index.ts` and `contract.ts` are unsorted.** `index.ts` has numerous alphabetical inversions:
   `@flighthq/abc` appears at line 19 (after `clock` at 18), `@flighthq/encoding` at line 23
   (between `compression` and `collision`), `@flighthq/scene2d*` block at lines 29-35 (between
   `dialog` and `easing`), `@flighthq/bitmap` at line 129 (between `swf` and `text`), among
   others. `contract.ts` has the same structural disorder. Six of the thirteen group files
   (`core.ts`, `formats.ts`, `game.ts`, `interaction.ts`, `rendering.ts`, `scene2d.ts`) are also
   unsorted. The dependency block in `package.json` is sorted; the barrel files it mirrors are
   not.

4. **UTF-8 BOM on `index.ts` and `contract.ts`.** Both files begin with `0xEF 0xBB 0xBF`. No
   other source file in `packages/sdk/src/` has a BOM. The BOM is harmless but inconsistent.

5. **`tsconfig.json` references are unsorted.** The 154 reference paths in `tsconfig.json` have
   the same sort-order issues as `index.ts` (identical insertion pattern).

6. **No collision or namespace-size guard.** The sole test file is `index.test.ts` with 21 spot
   checks. `completeness.test.ts` and `collision.test.ts` do not exist. Nothing guards the
   runtime namespace against a silent `export *` shadowing -- the case `tsc` cannot catch. The
   `checkSdkBarrelSync` covers presence of a package, not survival of its names.

7. **Stale reference in `sdk-policy.ts`.** Line 8 of `scripts/sdk-policy.ts` names
   `packages/sdk/src/completeness.test.ts` as a consumer. That file does not exist and has never
   existed in the current tree. The comment is a dead reference.

8. **Duplicate `it` blocks in `index.test.ts`.** `createSprite` and `SpriteKind` are each tested
   under both "display object domain" (lines 22-25, 33-36) and "sprite domain" (lines 84-91).
   The duplication is harmless but the "21 tests" count is inflated by two redundant assertions.

9. **No tree-shake conformance proof.** Nothing asserts that `import { X } from '@flighthq/sdk'`
   shakes to the same bytes as importing `X` from its owning package -- the central promise of
   the barrel.

10. **`entity` public lane now contributes two functions.** The prior status claimed
    `export * from '@flighthq/entity'` contributes nothing. As of the current tree, the entity
    package's `.` lane exports `getEntityUid` and `setEntityUid`, so this claim is stale.

## Charter contradictions

None. The charter says "pure barrel, zero own code" and the package satisfies that. The charter
blesses `packages:check` completeness enforcement, which is implemented. The charter's decision
"[2026-07-02] No blood-from-stone tests" aligns with the current single spot-check test file.

The one tension is architectural rather than a charter violation: the charter says `./contract`
should be the full surface (it carries 144 packages vs. 154 in `.`), but the barrel inverts that
relationship. The charter does not explicitly address `./contract` parity, so this is a gap, not
a contradiction.

## Contract & docs fit

- **`"sideEffects": false`** -- declared in `package.json` (line 252). The package contains only
  `export *` re-exports, so this is accurate.
- **Two-lane rule.** `package.json` exports `.` and `./contract` plus thirteen categorized
  groups. AGENTS.md says "no other subpath is allowed," aimed at file-mirroring subpaths. The SDK
  is explicitly exempted in `packages:check` (line 565: `name === '@flighthq/sdk'`). Whether the
  groups are a blessed exception or the rule's wording needs a carve-out is unresolved; the prior
  status recorded this as a user question.
- **Test file naming.** One test file `index.test.ts` colocated with `index.ts` in `src/`.
  `describe` blocks are alphabetized. Matches the testing convention.
- **No imports from `@flighthq/sdk`.** Verified; no circular self-import.
- **`sdk-policy.ts` stale comment.** The comment naming `completeness.test.ts` as a consumer
  (line 8) is a documentation defect. The file does not exist.

## Candidate open directions

1. **Close the contract-lane gap.** Add the ten missing packages to `contract.ts` and extend
   `checkSdkBarrelSync` to verify `contract.ts` in parallel with `index.ts`. This is the
   highest-value fix: it restores the lane invariant that `./contract` is a superset of `.`.

2. **Sort all barrel files.** Alphabetize `index.ts`, `contract.ts`, the six unsorted group files,
   and the `tsconfig.json` references. Strip the two BOMs. A single `npm run fix` pass may handle
   the sort if the ordering rule covers `export *` lines; otherwise a targeted sweep.

3. **Remove stale `completeness.test.ts` reference.** Delete line 8 of `scripts/sdk-policy.ts`.

4. **Deduplicate test assertions.** Remove the redundant sprite-domain `describe` block whose
   two `it` entries duplicate the display-object-domain block's `createSprite` and `SpriteKind`
   checks.

5. **Add a collision/namespace-size guard.** A test that imports `* as sdk from './index'` and
   asserts `Object.keys(sdk).length >= N` plus a set of sentinel names would catch silent
   `export *` shadowing. The charter's "no blood from stone" decision scopes this to a
   proportionate spot-check, not an exhaustive snapshot.

6. **Tree-shake conformance proof.** Add a `size-runner.ts` mode comparing barrel-import bytes
   to direct-import bytes for a representative set of exports. This validates the barrel's
   central promise.
