---
package: '@flighthq/types'
updated: 2026-07-02
basedOn: ./review.md
---

# types — Assessment

Sorted from `review.md` (solid, 89/100), the depth review (solid, 82/100), and the direction session (2026-07-02). Six Decisions blessed. The package is the SDK's header layer — pure type declarations with no runtime logic. Approved work is within-types contract fixes and one cross-package consolidation that starts here.

## Recommended

Strictly sweep-safe: within `@flighthq/types`, no open design decision.

- ~~**Lift the notification seam to `id`.**~~ _Already done._ `notify` returns `Promise<string>` (the id), all subscribers use `id`. The seam is consistent. Per Decision #6 — verified landed.
- **Remove the "should become open" note from ParticleForce/ParticleCollider.** The note is outdated — these are intentionally closed for performance (Decision #4). Replace with a rationale comment: hot per-particle per-frame dispatch, closed by design.
- ~~**Fix DOM/Dom casing.**~~ _Already done._ Files are `DomRenderOptions.ts`, `DomStageRectangle.ts`. Consistent `Dom` PascalCase throughout.
- **Extract `TextDirection` alias.** `'LeftToRight' | 'RightToLeft'` is inline in both `ShapedRun.direction` and `ShapeRunOptions.direction`. Extract to a shared `TextDirection` type in its own file, reference from both.
- **Document `glyphCount` on `ShapedRun`.** Add a one-line comment explaining why `glyphCount` coexists with `glyphs.length` (over-allocated result buffer), or drop it if it is always `glyphs.length`.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Rectangle consolidation sweep.** _Parked — cross-package._ Per Decision #3: `RenderViewport2D` (in `render`), `SurfaceRegion` (in `surface`), `TextSelectionRectangle` (in `text`) should become `Rectangle` or `RectangleLike` at their callsites. `TextureAtlasRegion` should `extends Rectangle` (it adds fields). Starts in types (delete/alias the duplicate types) but touches consumer packages. Needs a coordinated builder sweep.
- **Type-level assertion tests.** _Parked — large scope, welcome but not mandated._ Per Decision #2: `expectTypeOf` tests for structural invariants (`*Like` strips runtime, quartets assignable, `kind` narrows, `EntityWithoutRuntime` behaves). Add opportunistically, not as blanket coverage. The builder's existing `Bitmap.test.ts` and `Signal.test.ts` are the model.
- **Signal conformance divergence documentation.** _Parked — Rust worktree._ Per Decision #5: record the `Signal<T>` generic shape divergence (TS: function-type parameterized; Rust: payload-parameterized) in the conformance map. Not a types-package change.
- **Self-containment assertion.** _Parked — tooling._ Charter Open direction #4. A within-package check that every import resolves locally, enforcing the "no implementation leaks" promise. Needs design (part of `packages:check` or standalone).

## Approved

- [2026-07-02 · picked] Lift notification seam to `id` — charter Decision #6. **Already landed** — verified `notify` returns `Promise<string>`, subscribers use `id`.
- [2026-07-02 · picked] Remove "should become open" note from ParticleForce/ParticleCollider — charter Decision #4
- [2026-07-02 · picked] Fix DOM/Dom casing — depth review naming note. **Already landed** — files already use `Dom` PascalCase.
- [2026-07-02 · picked] Extract `TextDirection` alias — review soft finding
- [2026-07-02 · picked] Document `glyphCount` on `ShapedRun` — review soft finding
