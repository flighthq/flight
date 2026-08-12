---
package: '@flighthq/render-gl'
updated: 2026-08-08
by: principal
---

# render-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/render-gl/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **`drawGlFullscreenPass` never owns the `BLEND` enable bit.** It sets the equation and factors twice —
  before the draw (`glFullscreenPass.ts:94-95`) and again after (`:101-102`) — but relies on the one
  `gl.enable(gl.BLEND)` in `createGlRenderState` (`glRenderState.ts:153`). A caller that disables blending
  gets silently unblended output. Changing the ownership touches every caller of a shared primitive.
- **The `internal.ts`-style entity cast is still in `createGlRenderState`** —
  `(state as { canvas })` / `(state as { gl })` at `glRenderState.ts:61-62` and `:108-109`. AGENTS.md calls
  the pattern legacy; the runtime-slot fix relocates `canvas`/`gl` off the readonly entity into
  `GlRenderStateRuntime`, which is a `@flighthq/types` edit.
- **Seven `Gl*` header files describe a surface that does not exist.** `GlCapabilities.ts`,
  `GlContextLoss.ts`, `GlCullFaceKind.ts`, `GlDepthFuncKind.ts`, `GlFramebufferStatusKind.ts`,
  `GlRenderStats.ts`, and `GlTextureDescriptor.ts` (carrying `GlTextureInternalFormat`) live in
  `packages/types/src/` and are referenced by nothing outside `types`' own `index.ts` / `contract.ts`.
  Concretely absent from this package: capability and extension introspection, context-loss detection or
  recreation, a cached pipeline-state layer (viewport / depth / cull / color-mask), and draw-call
  instrumentation. Either the modules land or the headers go — a type with no implementation reads as a
  capability to every consumer scanning `@flighthq/types`.
- **No UBO, sampler-object, blit/copy, or pixel-store helpers.** `createGlUniformBuffer`, `createGlSampler`,
  `copyGlRenderTarget`, `blitGlRenderTarget`, `setGlPixelStore`, and `updateGlTextureSubImage` are absent
  from all of `packages/`. Leaf instanced renderers have no shared primitive for any of them.
- **Compressed upload realizes exactly three shapes.** `uploadGlCompressedTextureContainer` returns `false`
  before issuing any GL call for volumes and cubemap arrays (`glCompressedTexture.ts:242-245`); the RGBA
  decode fallback covers plain 2D only (`:297-299`). Those shapes need distinct entity and binder families,
  not a wider branch here.
- **Clip primitives are split across the layer boundary.** The `scissorStack` runtime slot is owned and
  reset here (`glRenderPass.ts:23`, `glRenderState.ts:150`), but the push/pop lives in `scene2d-gl`
  (`glClipRectangle.ts:71`). Promoting the stack operations into this package is the cleaner layering and
  crosses a package boundary, so it is a ruling before it is effort.

- **Nobody has swept the GL fixed-function state seam, and three defects came out of it by accident in
  one afternoon.** `frontFace` did not exist anywhere in the draw path, so a mirrored mesh was culled
  entirely rather than shaded wrong; once added, CW leaked past a mirrored draw into the CCW
  render-effect present pass and blanked the whole frame; and `pushGlRenderState` did not preserve
  `FRONT_FACE`, so a host context set to CW got CCW handed back. One failure mode, three sightings,
  all found while looking for something else.
  THE SWEEP IS CHECKABLE BY CONSTRUCTION, which is why it is worth doing deliberately rather than
  waiting for the next accident: the bracket's own saved-field list IS the inventory. For every piece
  of fixed-function state the draw path touches — depth test/mask/func, cull enable and mode, front
  face, blend enable/func/equation, scissor, viewport, stencil, colour mask, program, VAO, framebuffer,
  texture units — ask three questions. (a) Is it SET when it needs to be, or inherited by luck from
  whatever ran before? (b) Is it RESTORED intra-frame, so a per-draw value cannot leak into a later
  pass in the same frame? (c) Is it PRESERVED across the host bracket, so Flight hands the context back
  as it found it? Anything the draw path calls that the bracket does not save is a candidate for (c) by
  construction; (a) and (b) need reading the pass order.
  Two traps worth knowing before starting. A test fixture that begins at the API default makes a
  restore-a-constant bug indistinguishable from a restore-the-saved-value fix — the `FRONT_FACE`
  bracket fixtures deliberately start at CW for this reason. And a Flight-only render cannot see a host
  leak at all: intra-frame and cross-bracket leaks are different failures and only the first is visible
  from inside.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 "Pass 2 / 91-100" inventory
  checked out **false wholesale**: `glTexture.ts`, `glPipelineState.ts`, `glInstrumentation.ts`,
  `glCapabilities.ts`, `glContextLoss.ts`, and `glExtension.ts` are not in `src/`, and not one of
  `setGlViewport` / `recordGlDrawCall` / `getGlRenderStats` / `getGlRenderTargetStatus` exists anywhere in
  `packages/`. The 2026-06-25 entry that first caught this was itself partly stale — it listed `glReadback.ts`
  as absent, and `glReadback.ts` + its test are present.
- **2026-07-31** — Caller-owned transparent clearing for the public RenderTexture workflow.
- **2026-07-22** — `uploadGlCompressedTextureContainer` rejects volumes and cubemap arrays before issuing GL
  calls; the `ImageResource` bridge accepts plain 2D only.
- **2026-06-25** — Recommended-sweep pass found the assessment describing a `src/` tree the worktree no
  longer contained; items parked rather than fabricated.
- **2026-06-24** — Claimed capabilities/extension/context-loss/readback/pipeline-state/instrumentation
  additions; only the readback and shader-log parts survive in the tree.
