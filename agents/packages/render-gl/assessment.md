---
package: '@flighthq/render-gl'
updated: 2026-06-25
basedOn: ./review.md
---

# render-gl — Assessment (merge gate, integration-b2824e3d8)

Recommendation layer over `review.md`. Scope: the **integration-b2824e3d8 delta** against the approved base (`origin/main`, `eb73c3d74`). The delta is **test-only** (four files; three clean, one non-compiling). This assessment sorts what the gate must do before this delta merges, plus the standing within-package gaps that remain parked. Items needing a blessed Boundary/North-star decision are routed to the charter's **Open directions** (below), not into Recommended.

## Recommended

Sweep-safe: within `@flighthq/render-gl`, additive, no open design decision. A blanket "do all recommended" can safely bless this whole set.

- **Fix the non-compiling `glFullscreenPass.test.ts` before this delta merges (blocking).** The new test imports `tryCompileGlFullscreenProgram` from `./glFullscreenPass` and `getGlLastShaderLog` from `./glShader` — neither exists in the integration head, so the file fails `tsc -b`. Either (a) drop the `describe('tryCompileGlFullscreenProgram', …)` block and the `getGlLastShaderLog` assertions, leaving the honest `clearGlRenderTarget` / `compileGlFullscreenProgram` / `drawGlFullscreenPass` coverage, or (b) if the non-throwing shader family is meant to be in this integration, land the source (`tryCompileGlFullscreenProgram` in `glFullscreenPass.ts`, `getGlLastShaderLog` + the `tryCompile*` family in `glShader.ts`) alongside it. (a) is the within-package sweep; (b) is larger and depends on the merge intent — see Open directions. — review.md "Blocking defect"
- **Keep the three clean test files as-is.** `glRenderTargetPool.test.ts`, the `resolveGlRenderTarget` block in `glRenderTarget.test.ts`, and the material-shader blocks in `glShaderBinding.test.ts` are accurate, mirror their exports, and close coverage gaps the charter named. No change needed. — review.md "Clean files"
- **(Contingent on keeping the fullscreen file) use a constructor for the `makeTarget` fixture.** Once the file compiles, prefer building the `GlRenderTarget` through the package helper rather than a plain literal with `{} as WebGLFramebuffer` handles, unless the structural-fixture intent is explicit. Low priority; moot while the file does not compile. — review.md standards scorecard #6

The standing within-package sweep items from the prior assessment (instrumentation wiring, UBO/sampler/blit/ compressed-texture primitives, pixel-store control, `updateGlTextureSubImage` format generalization, the `internal.ts`-cast retirement, the `npm run size` confirmation) describe the **builder-67dc46d64** source surface, which is **not present in this integration head**. They are not actionable against this delta and are not re-listed here; they remain valid only against whichever branch actually carries that source.

## Backlog

Parked: each needs cross-package coordination, a blessed design decision, or sits outside this delta.

- **Reconcile the standing review/status/assessment with the merged artifact.** The bundle's standing docs credit the builder-67dc46d64 device-tier work (instrumentation, texture/pipeline primitives, the non-throwing shader family) as shipped; the integration head contains none of it. Parked because it is a continuity-log / charter bookkeeping task spanning the integration bundle, not a render-gl source change — but it must be done so a later pass does not assume `tryCompile*` / `getGlLastShaderLog` are present. — review.md "Note on standing-review drift"
- **Context-loss "signals" → real `@flighthq/signals` or honest listener-list rename.** Routed to Open directions; cross-package fork. — standing review (contract drift)
- **`GlTextureInternalFormat` casing.** Renames an exported `@flighthq/types` name; naming judgment, not a sweep. — standing review (minor)
- **Scissor/stencil clip primitive promotion (fork A), `GlRecreatable` recreation contract, sRGB policy, non-separable blend modes (fork B), Rust `flighthq-render-gl` parity.** All cross-package or design-blocked; carried forward unchanged from the standing assessment and routed to Open directions. — standing review

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced here for the charter (not edited from this assessment):

- **What is the intended merge state of the non-throwing shader family?** The integration head lacks `tryCompileGlFullscreenProgram` / `getGlLastShaderLog` while carrying a test for them. Decide whether the source belongs in this integration (land it) or not (drop the tests). This is the fork behind the blocking defect — it is a merge-intent decision, not a sweep.
- **Context-loss signals: real `Signal<T>` or plain listener list?** As shipped on the device tier, `enableGlContextLossSignals` installs plain callback arrays despite the `enable*Signals` name. Depend on `@flighthq/signals` or rename. (Carried from the standing charter Open directions.)
- **Clip primitive ownership (fork A, cross-package)**, **context-loss recreation contract (`GlRecreatable`)**, **sRGB / color-space policy (cross-backend, joint with `render-wgpu` + Rust)**, and **non-separable blend modes (fork B, registry vs closed switch)** all remain open and unchanged by this delta. (Carried from the standing charter Open directions.)
