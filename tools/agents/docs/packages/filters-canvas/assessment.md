---
package: '@flighthq/filters-canvas'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/filters-canvas (merge gate — integration-b2824e3d8 delta)

The review verdict is **partial — 58/100, revise before merge**. The delta adds a convenience dispatcher (`applyCanvasFilter`) and a CSS-expressibility predicate (`canUseCanvasFilterCssFor`) on top of the approved 3-leaf CSS base. The shape is reasonable, but the change **does not build in the integrated tree** (it imports `createSvgFilterDataUri`/`svgFeColorMatrix` from `@flighthq/filters-css`, whose `svgFilterUrl.ts` is absent and whose `index.ts` carries an unresolved merge-conflict marker), duplicates three existing leaves, ships a wrong export order, and re-homes CSS-expressibility knowledge that belongs to `filters-css`. The build blocker is cross-package; the rest are within-package sweeps. Prior `assessment.md` content described the unrelated `builder-67dc46d64` 14-leaf state and is superseded here.

## Recommended

Sweep-safe: within `@flighthq/filters-canvas`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this whole set.

1. **Fix the `index.ts` export order.** Move `export { applyCanvasFilter, canUseCanvasFilterCssFor } from './canvasFilterDispatch';` above the `applyDropShadowFilterToCanvas` line — alphabetical order is Blur → Canvas → DropShadow → OuterGlow. Mechanical; `npm run order:fix` does it. Currently fails `order:check`. — review.md#7-tests--honesty
2. **Drop the `as number[]` cast in the `ColorMatrixFilter` arm.** `canvasFilterDispatch.ts:77` casts `f.matrix` (typed `ReadonlyArray<number>`) to a mutable `number[]` for a read-only use. Remove the cast and let `svgFeColorMatrix` accept `ReadonlyArray<number>`. Default-to-`Readonly` rule. — review.md#6-contract-hygiene
3. **Compose the three CSS arms over the existing leaves instead of re-implementing them.** The Blur/DropShadow/OuterGlow arms in `applyCanvasFilter` (`:36-73`) are verbatim copies of `applyBlurFilterToCanvas` / `applyDropShadowFilterToCanvas` / `applyOuterGlowFilterToCanvas`. Re-route those arms through the leaves so the dispatcher is the thin re-router the charter North star calls for. Note the contract gap to reconcile: the leaves `return false` on no-CSS, while the dispatcher pass-through-draws and returns `true` (see Backlog 2 / Open question). Within-package. — review.md#1-composition--bedrock
4. **Delegate the CSS-expressibility predicate to `filters-css` rather than re-deriving it.** `canUseCanvasFilterCssFor` (`:114-118`) re-encodes blur isotropy with a magic `?? 4` default. Source the rule and default from `filters-css` (it is already in `dependencies`) so they live in one place. No new dependency, no design decision — kept Recommended. — review.md#6-contract-hygiene

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Each notes why.

1. **Unblock the `ColorMatrixFilter` arm — land `filters-css` `svgFilterUrl.ts`.** The dispatcher's `ColorMatrixFilter` arm imports `createSvgFilterDataUri`/`svgFeColorMatrix`, which do not exist in the integrated `@flighthq/filters-css` (missing source file + merge-conflict marker in its `index.ts`). This is the hard merge blocker (B1). Cross-package: it must be fixed in `filters-css`, not here. Until then the delta cannot build and the arm cannot be tested for real. — review.md#hard-blocker
2. **Decide the pass-through return signal.** `applyCanvasFilter` returns `true` for the 10 natively-unsupported kinds even though it only blits `source` unchanged. A caller cannot distinguish "applied" from "silently skipped," which defeats backend fall-through. Whether to return `false` (or a tri-state) is a contract decision gated on whether cross-backend fall-through is in scope — routed to Open directions. — review.md#7-tests--honesty
3. **Pixel-path delegation to `filters-surface`.** The charter North star says non-CSS filters delegate to `filters-surface`, but the integrated package has no such dependency and degrades them to pass-through. Adding the dependency + bridge is a substantial buildout (the `builder-67dc46d64` state had it; this integration state does not) — out of scope for this delta, and gated on the charter ruling whether this cell carries pixel realization at all. Cross-package, large. — review.md#what-the-delta-actually-is
4. **`testHelper.ts` naming + packaging.** Bare-generic name diverges from the sibling convention (`glTestHelper.ts`, `wgpuTestHelper.ts`), and it is excluded from the published `files` glob (`src/**/*.test.ts`), so a tarball test cannot resolve it. Low priority; parked because it touches packaging policy rather than behavior. — review.md#7-tests--honesty

## Open directions (for the charter — not edited here)

These are decisions the review had to assume past or that fork SDK-wide. Route to the charter's **Open directions** for an explicit conversation; not Recommended.

1. **Dispatcher: closed `switch(filter.kind)` vs open registry (structural fork B).** `applyCanvasFilter` is a 14-arm closed switch on the canonical filter growth surface. Not a hot loop, so fork B's "closed is fine when not hot" leans toward keeping it — but it is the switch fork B says to revisit on growth, and the ruling should be consistent across all four backend cells. Charter Open #6/#7 already track this. — review.md#4-registry-vs-closed-union
2. **Backend fall-through contract.** Should `applyCanvasFilter` signal "I could not really apply this" so a caller falls to `filters-surface`/`filters-gl`, or is silent pass-through the blessed Canvas behavior? Governs Backlog 2 and the leaf-vs-dispatcher return-value reconciliation in Recommended 3. — review.md#7-tests--honesty
3. **Does this cell own pixel realization, or is it CSS-only?** The charter North star assumes `filters-surface` delegation; the integration state is CSS-only with pass-through. The charter should declare whether `filters-canvas` is a CSS-expressibility shim or a full Canvas realizer — that ruling gates Backlog 3. — review.md#what-the-delta-actually-is

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._
