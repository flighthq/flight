---
package: '@flighthq/filters'
status: partial
score: 70
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - source
---

# filters — Review

> **Merge-gate review.** Judges the **delta** (`integration-b2824e3d8` head vs the approved `origin/main` base `eb73c3d74`) as a gate, not a survey. The base — the 15 `create*` factories + `blurMath` — is the blessed floor and is **not** under review. Note: a prior `review.md` scored this package 88/100 against a _different, fuller_ worktree (`67dc46d64`) that contained a serialization spine, a full color-matrix preset library, convolution-kernel builders, and `shadowFilterOffset`. **None of that is in this integration delta.** This review is grounded only in `b2824e3d8` and supersedes the score for that branch.

## Verdict

partial — **70/100** for the delta as a merge candidate. The change is a clean, purely-additive descriptor-ops/metadata spine (6 new files, ~30 new exports, no deletions, no churn to the base factories) and the code itself is correct, well-documented, and alias-safe where it claims to be. But it ships **with zero colocated tests for any of the six new files**, which fails the `exports:check` gate the codebase map names as mandatory — a hard merge blocker on its own. Secondary issues: a public type (`BitmapFilterMargin`) is defined inline in the package rather than types-first in `@flighthq/types`; the per-kind guard set is asymmetric (7 of 14 kinds); and four files re-close the deliberately-open `BitmapFilter` contract with hardcoded `switch`/if-chains (fork B — an unblessed design question, not a blocker). The spine is the right idea and most of it is final-shape; it is not mergeable as-is because the test gate is unmet.

## What the delta adds

Grounded in `b2824e3d8:packages/filters/src`. All six files are new; `index.ts` gains re-exports only (existing exports retained — verified against the base `index.ts` and the patch hunk at `b2824e3d8:packages/filters/src/index.ts`).

- **Descriptor ops** (`bitmapFilterOps.ts`) — `cloneBitmapFilter`/`cloneBitmapFilterList`, `copyBitmapFilterInto` (alias-safe via deep-copy-then-`Object.assign`), `equalsBitmapFilter`/`…List` (structural, array-aware), `normalizeBitmapFilter` (per-kind canonical Flash defaults, idempotent), and nine `DEFAULT_FILTER_*` constants exported for backends.
- **Guards** (`bitmapFilterGuards.ts`) — `isBitmapFilter` (kind-discriminant check) plus **seven** per-kind narrowing guards (`isBevelFilter`, `isBlurFilter`, `isDropShadowFilter`, `isGradientBevelFilter`, `isGradientGlowFilter`, `isOuterGlowFilter`).
- **Validation** (`bitmapFilterValidation.ts`) — `isValidBitmapFilter` (kind-aware: color-matrix length, convolution `matrix.length === matrixX*matrixY`, gradient-array presence), `isValidBitmapFilterList` (sentinel `false` for non-array), `clampFilterQuality` (1–15), `clampFilterStrength` (0–255).
- **Margin** (`bitmapFilterMargin.ts`) — the `BitmapFilterMargin` interface and `getBitmapFilterMargin`: per-side pixel expansion, alias-safe out-param, never throws; expanding kinds (blur / drop-shadow / outer-glow / gradient-glow / bevel / gradient-bevel) vs zero-margin inner / pixel-transform kinds.
- **Quality bridge** (`blurQuality.ts`) — `getBlurPassCountForQuality` (quality 1 → 1 pass, 2–8 → 2, 9–15 → 3).
- **Constant** (`colorMatrixMath.ts`) — `COLOR_MATRIX_LENGTH = 20`, a two-line file.

Architecture/style holds: `package.json` is unchanged (single root `.` export, `sideEffects: false`, lone `@flighthq/types` dependency). The new code is import side-effect-free. Names are full and unabbreviated (`getBitmapFilterMargin`, `cloneBitmapFilterList`, `getBlurPassCountForQuality`); booleans use `is*`. Out-params are read-into-locals-first where they exist.

## Blocking findings

**1. No colocated tests for any of the six new files (HARD BLOCKER).** The codebase map states `exports:check` "confirm[s] every export has a colocated test," and "One test file per source file, colocated in `src/`, named `*.test.ts`" is a stated Testing rule. Every base source file has its `*.test.ts`; the delta breaks the invariant for ~30 new exports across `bitmapFilterOps.ts`, `bitmapFilterGuards.ts`, `bitmapFilterValidation.ts`, `bitmapFilterMargin.ts`, `blurQuality.ts`, and `colorMatrixMath.ts` — none has a sibling test. This is delta-introduced (the base was clean) and would fail `npm run check`. The math-bearing exports in particular (`normalizeBitmapFilter` idempotence, `getBitmapFilterMargin` per-kind expansion and `out === filter` aliasing, `getBlurPassCountForQuality` boundaries, `copyBitmapFilterInto` kind-mismatch throw, `equalsBitmapFilter` array-awareness) are exactly the behaviors a colocated test is supposed to pin. Must-fix before merge.

## Non-blocking findings

**2. `BitmapFilterMargin` is defined inline, not types-first.** `b2824e3d8:packages/filters/src/bitmapFilterMargin.ts:25` declares `export interface BitmapFilterMargin { … }`, and `index.ts:11` re-exports it from the package root. The contract is explicit: "Shared types … that cross package boundaries belong in `@flighthq/types` … Do not define cross-package types inline." This type exists precisely so backends can size their intermediate surfaces — its doc says "Backends use this to size their intermediate surfaces" — so it is cross-package by intent. No backend consumes it yet (grep finds it only inside `filters`), so pre-release latitude permits deferring the move until first consumed; but as the final shape it belongs in the header. Should-fix.

**3. The per-kind guard set is asymmetric (7 of 14 kinds).** `bitmapFilterGuards.ts` exports narrowing guards for only Bevel, Blur, DropShadow, GradientBevel, GradientGlow, OuterGlow — omitting `isColorMatrixFilter`, `isConvolutionFilter`, `isDisplacementMapFilter`, `isInnerGlowFilter`, `isInnerShadowFilter`, `isMedianFilter`, `isPixelateFilter`, `isSharpenFilter`. `isBitmapFilter` itself enumerates all 14 kinds (`b2824e3d8:packages/filters/src/bitmapFilterGuards.ts:23-41`), so the catalog knows the full family; the public guard surface only covers the half this delta happened to need. For an AAA descriptor library the guard family should be complete and symmetric. Within-package; Recommended.

**4. Four closed switches re-close the open `BitmapFilter` contract (fork B — open question, not a blocker).** `BitmapFilter` is deliberately an _open contract_ in this base — `b2824e3d8:packages/types/src/BitmapFilter.ts` reads `interface BitmapFilter { readonly kind: Kind }` with the comment "A new filter is added by defining its interface … no central union to edit here." Yet the delta adds four implementation-side closed dispatchers over the 14-kind family: `normalizeBitmapFilter`'s `switch (filter.kind)` (`bitmapFilterOps.ts:85`), `isBitmapFilter`'s `switch (kind)` (`bitmapFilterGuards.ts:23`), `isValidBitmapFilter`'s `switch (filter.kind)` (`bitmapFilterValidation.ts:23`), and `getBitmapFilterMargin`'s `is*`-chain (`bitmapFilterMargin.ts:54-103`). A vendor-prefixed custom filter kind therefore cannot normalize, validate (returns `false`), or get a margin — the open-contract type promises extensibility the implementation does not honor. Per fork B the default is an open registry keyed by kind, with a closed-union exception for a tight loop in a closed system. This is a blessed-decision-shaped fork (charter Open direction #2 already parks it), so it is **routed to Open questions, not demanded as a must-fix.** Note: unlike the prior `67dc46d64` review, there are **no `*Kind` constants** in this base to reference — the whole package uses string literals consistently — so the "literals-vs-constants" sub-finding from that review does **not** apply here and is dropped.

**5. Bevel margin omits the distance offset (open question).** `getBitmapFilterMargin` expands bevel / gradient-bevel by blur radius only (`bitmapFilterMargin.ts:86-103`), the same as a glow, whereas drop-shadow adds the `distance`-projected offset (`:67-84`). An OpenFL bevel paints highlight+shadow offset by `distance`, so an offset bevel could clip. Not clearly wrong (bevels are often treated as centered), and no test pins the intended behavior — surfaced as a correctness question for the margin model, not a blocker.

## Passing axes

- **Composition / bedrock** — each file is a single bedrock concern (ops, guards, validation, margin, quality, a constant); no feature is bundled as a config-gated branch. Pass.
- **Naming** — full unabbreviated type words throughout; `is*` for booleans, `get*` for accessors, `clone*`/`copy*` for allocation/in-place. Pass.
- **Tree-shaking / bundle invariant** — `package.json` unchanged, single root `.` export, `sideEffects: false`, no eager registration, no top-level side effects. Per-function importability preserved. Pass.
- **Contract hygiene (partial)** — sentinels-not-throws honored for expected failure (`isValidBitmapFilter*` → `false`, clamps don't throw, `getBitmapFilterMargin` never throws); `copyBitmapFilterInto`'s throw on kind mismatch is a defensible API-misuse precondition. `Readonly<>` used on inputs. Out-params alias-safe and documented. The one real miss is finding #2 (types-first). Pass with the one exception.

## Charter fit

The charter (`charter.md`, still `draft: true`) already anticipates this delta: Open direction #2 is exactly finding #4 (registry vs closed union), and the "What it is" line lists "clone/equals/normalize/serialize/validate spine … blur sigma↔box-radius math and quality→passes bridge … `getBitmapFilterMargin`." The delta delivers the clone/equals/normalize/validate/quality/margin parts of that vision but **not** the serialize spine, the color-matrix preset library, the convolution-kernel builders, or `getShadowFilterOffset` the charter also names — so the package remains below the charter's described surface. That is a completeness gap, not a contradiction (the charter is unblessed). No blessed decision is contradicted.
