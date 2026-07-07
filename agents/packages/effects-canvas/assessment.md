---
package: '@flighthq/effects-canvas'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/effects-canvas

The review verdict is **solid — 88/100**: infrastructure is real, the catalog is 34/44 implemented, and the 10 passthroughs each have a documented hard-input reason. What remains is mostly cleanup, honesty/symmetry of the catalog, and a few items that need a charter or cross-package decision. The charter is still a stub, so the design forks below are routed to its **Open directions** (noted here, not acted on) rather than into Recommended.

## Recommended

Sweep-safe: within `@flighthq/effects-canvas`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this whole set.

1. **Remove the dead `cr`/`cg`/`cb` bindings in `canvasSharpenEffect.ts`** (lines ~31-33, 54-56) — read from `orig`, never used, `void`-ed away. Violates "leave touched files cleaner." Pure deletion. — review.md#cleanliness-residue
2. **Delete or correct the self-contradicting barrel comment** on `registerAllCanvasRenderEffects` — it claims the function "is NOT re-exported from the root barrel by default," but `index.ts` does `export *` and (under single-root-barrel + `sideEffects:false`) it tree-shakes identically either way. The comment describes a separate-entry-point model the SDK rejects. Correct the comment to match reality. — review.md#candidate-revisions-3
3. **Add a passthrough stub file for `ScreenSpaceShadowsEffect`** so all 44 kinds have a colocated `canvas<Kind>Effect.ts` + test and the kind is visible to `exports:check`. It is currently a support-map entry only — the lone kind with no source file. A stub restores symmetry within the package. (The alternative — consciously keeping the asymmetry — is a small ruling; see Backlog if the stub is judged not worth it, but the stub itself is sweep-safe.) — review.md#gaps
4. **Harden the `ToneMap`/`Exposure` `approximate`-tier comments** with an explicit in-source note of _why_ they are approximate (8-bit sRGB has no HDR headroom) and what that costs, so the tier is self-documenting at the callsite. This is comment-only and within-package; it does **not** include adding GL parity baselines (that needs the fidelity-contract decision — Backlog). — review.md#gaps

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Each notes why.

1. **`LookupTableGrade` real path** — blocked on a `@flighthq/types` descriptor change (needs `data: Float32Array` or a side-channel on `LookupTableGradeEffect`; the descriptor carries only `size`/`strength` today). Cross-package design decision; correctly left passthrough until the type grows. — review.md#gaps
2. **Functional-test kind-string fix** — `tests/functional/effect-*` canvas render files register with lowercase kinds (`'grayscale'` vs `'GrayscaleEffect'`), so the canvas column of those baselines may apply no effect. Lives in the functional suite, not this package; a cross-package fix. Parked until the functional-suite owner picks it up. — review.md#gaps
3. **Cross-backend functional-test scenes + parity tolerances** (depth-review Silver) — add a scene per effect family so `rust:skia ~ ts:canvas ~ ts:gl` can be compared in the parity matrix, with documented divergence tolerances. Spans the functional suite and the parity instrument; not within-package. Also gated on the kind-string fix above so the canvas column is real. — reviews/maturation/depth#silver
4. **Performance / buffer-pooling pass** (depth-review Silver) — reuse pooled `ImageData` across frames in the pipeline and short-circuit no-op parameter cases (zero-amount blur → cheap blit). Real within-package work, but it is an optimization with a measurable-cost tradeoff (allocation behavior, `npm run size`), not a sweep-safe one-liner — wants a deliberate pass rather than a blanket sweep. — reviews/maturation/depth#silver
5. **`@flighthq/surface` / `@flighthq/filters-surface` delegation audit** (depth-review reuse note) — confirm the per-pixel/convolution effects delegate to the existing surface math rather than re-deriving it, and check the bundle-size impact of any new `@flighthq/surface` dependency with `npm run size`. Adds a cross-package dependency edge → not sweep-safe; verify before adopting. — reviews/maturation/depth#dependencies
6. **Rust `flighthq-effects-skia` mirror + conformance divergence-map entries** (depth-review Gold) — 1:1 port of the real/approximate recipes over tiny-skia, with `displayobject-skia` as the bit-deterministic reference and each Canvas-vs-skia tolerance recorded. Cross-worktree (the Rust port) and gated on confirming the crate name/placement against the crate-existence rule. — reviews/maturation/depth#gold
7. **Package-level capability table (kind → support tier → backend technique)** and the **Package Map effects-family entry** (depth-review Gold + review candidate revision 1) — `agents/index.md` has no line for `effects` / `effects-canvas` / `effects-gl` / `effects-wgpu` despite all four existing. Editing the shared Package Map is a docs-wide change outside this cell; route the Map edit to the user. The in-package capability-table doc can follow once the support-tier model is settled (Open direction 3). — review.md#candidate-revisions-1, reviews/maturation/depth#gold

## Open directions (for the charter — not edited here)

The charter is a stub; these are decisions the review/roadmap had to assume past. Route them to the charter's **Open directions** for an explicit conversation. They are **not** Recommended.

1. **Re-seed the charter identity line.** The seeded "What it is" still calls this the counterpart to a "(not-yet-present) `effects-webgl`," but `effects-gl` and `effects-wgpu` both exist now with 44 effect files each. Re-frame as "the Canvas member of the `effects-<backend>` family." — review.md#candidate-revisions-2
2. **Cross-backend support-type naming (structural fork-adjacent).** `CanvasRenderEffectSupport` is the only backend-specific tier type in `@flighthq/types`. If `effects-gl`/`effects-wgpu` grow `get*RenderEffectSupport`, do they each get a `Gl`/`Wgpu` variant or share one `RenderEffectSupport` alias? Decide before a third copy lands. Affects all four effect backends. — review.md#candidate-open-directions-1
3. **`CANVAS_RENDER_EFFECT_SUPPORT`: closed `Record` vs. open registry (structural fork B).** The support map is a closed `Record` keyed by the 44 built-ins; a user's vendor-prefixed kind silently reports `'passthrough'`. It is not in a hot loop and the taxonomy test pins it to the registrars, so fork B's "closed is fine when small / not hot" leans toward keeping it closed — but it is a conscious ruling, and (per fork B) "support tier as a registerable property alongside the runner" is the alternative. Decide. — review.md#candidate-open-directions-3
4. **Is the 10-kind passthrough floor terminal or a build target?** The depth/velocity/history set is genuinely impossible on Canvas 2D; `LookupTableGrade` is one type-field away from real. The charter should state that "passthrough for parity" is the accepted terminal state for the impossible set and flag which passthroughs are merely blocked-on-types. — review.md#candidate-open-directions-2
5. **Approximate-tier fidelity contract.** Does `'approximate'` promise "looks plausible" or "within a bounded error of the GL path"? This governs whether `ToneMap`/`Exposure` need parity baselines against `effects-gl` (Backlog item 3 depends on it). — review.md#candidate-open-directions-4

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._

---

_Absorbed `reviews/maturation/depth/effects-canvas.md` (one-time seed) — its Bronze tier is fully landed (verified in review.md), and its Silver/Gold residue is sorted into Backlog above. Safe to remove on the next migration sweep._
