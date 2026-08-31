---
package: '@flighthq/render-gl'
updated: 2026-08-30
by: builder
---

# render-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/render-gl/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

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
  waiting for the next accident: the bracket's own saved-field list IS the inventory.

  **THE SWEEP WAS RUN on 2026-08-31 and is closed — do not re-run it blind, read this instead.** Four
  defects, all in the 2026-08-31 log below. Three were question (a) in `drawGlFullscreenPass`, which now
  owns blend-enable, depth, and cull-face rather than inheriting them; one was question (c), the bracket
  saving only 3 texture units while the draw path binds 14. What remains open after it: `frontFace` is
  restored per mesh draw rather than owned by the pass, which is now belt-and-braces rather than load-
  bearing; `clearGlRenderPass` leaves `depthMask` true; and `drawGlFullscreenPass` leaves unit 0 active.
  All three were examined and judged benign — recorded so the next reader knows they were looked at.

  Two things the sweep taught that the questions above do not say. **Every one of these is invisible to a
  capture**, because they void a draw rather than error it, and three of the four had zero effect on any
  functional baseline. **And the test double hid two of them**: `DEPTH_WRITEMASK` and `TEXTURE0` were
  missing from the fake's constant table, so state assertions silently compared `undefined === undefined`
  and the pre-existing texture-unit test had been vacuous since it was written. Check that the fake
  models a piece of state before trusting a test that asserts about it. For every piece
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
  A DELIBERATE (c) PASS FOUND FOUR MORE, and the method matters more than the count: enumerate the
  state setters BY EXTRACTION (`rg -o '\bgl\.[a-zA-Z]+\(' | sort -u`), never by listing the ones you
  remember. Listing from memory is what hid `colorMask`, `pixelStorei`, and `stencilOpSeparate` — all
  three are called here and none appeared in a hand-written inventory. The four: `COLOR_WRITEMASK`
  (the 2D clip pass masks colour off, `glClipContours.ts:84`), `COLOR_CLEAR_VALUE` (five sites across
  background/velocity/cache), `UNPACK_PREMULTIPLY_ALPHA_WEBGL` (every texture upload, `glDraw.ts`), and
  the stencil back face.
  THE STENCIL ONE IS THE INSTRUCTIVE FAILURE. The bracket saved the seven front-face stencil parameters
  and restored them with `stencilOp`/`stencilFunc`/`stencilMask` — which write FRONT_AND_BACK. So a host
  using two-sided stencil got its back face silently overwritten with the front's values, while the
  front verified as correctly restored. The tell was already in the file: blend was saved per channel
  and restored with `blendFuncSeparate`, stencil was not. An asymmetric API needs an asymmetric fixture,
  and the front half passing is exactly what makes the back half easy to miss.
  Establishing that required an oracle the code does not own: the unit mocks are hand-written, so a test
  asserting `stencilOp` writes both faces would only be asserting the mock. Real WebGL2 in headless
  Chromium (`playwright` is already a dependency) answered it — 7 of 14 parameters destroyed, 0 after the
  fix. Where a mock models an API rule, measure the rule first and say in the test where the number came
  from.

- **The (b) intra-frame residue, with BOTH sides extracted.** Set side: `rg -o` for every capability and
  value setter, per file. Restore side: read back from each file, not recalled — a capability changed in
  one direction only, or a value setter with no `getParameter`/`isEnabled` read-back in the same file.
  The residue is a difference between two facts, which is the only form in which it is evidence.
  IT RESOLVES TO ONE STRUCTURAL WEAKNESS RATHER THAN N BUGS. `createGlRenderState` establishes exactly
  two context-wide invariants, once, at creation: `BLEND` ON and `DEPTH_TEST` OFF. Nothing re-establishes
  either. Every pass that flips one and does not flip it back therefore leaks PERMANENTLY for the life of
  the context, not for the frame — and the 3D path masks this from itself by re-establishing depth and
  cull per draw, so only the 2D path pays.
  Flipping `BLEND` off: `renderGlVelocity` and `bakeGlEnvironmentIbl` (both fixed), and
  `glEnvironmentSkybox.ts` (open). Flipping `DEPTH_TEST` on: `glMeshProgram.ts`, `glParticleEmitter3D.ts`,
  `glShadowMap.ts` — three enables, no disable anywhere outside the one at state creation, so any frame
  that draws 3D leaves depth testing on for every later 2D draw. Open, and the reason to rule on it
  rather than patch three call sites is that "restore what you changed" is being hand-rolled per pass
  and each hand-rolling covers a different subset: the bracket restored the front stencil face only,
  velocity restored the framebuffer only, the IBL bake restored framebuffer and viewport only. The
  candidate fix is a pass-scoped bracket these passes share, which is a design call, not a patch.
  Lower-priority residue, same extraction: `glClipContours.ts` disables `CULL_FACE` and never re-enables
  (3D re-establishes cull per draw, so this one self-heals), and `glBackground`/`glFullscreenPass`/
  `glCache` set clear colour and viewport with no read-back.

- **(a) is the same defect as (b) seen from the other end, and stating it as a SHAPE is what showed
  that.** Instance: the 2D draw path depends on `CULL_FACE` being disabled and never disables it.
  Shape: A DRAW PATH THAT DEPENDS ON CONTEXT STATE IT NEVER ESTABLISHES, trusting a value some other
  subsystem is free to change. Pointed at the 2D path, that shape names three states, not one —
  `CULL_FACE` off, `DEPTH_TEST` off, `BLEND` on — and all three were taken on trust from
  `createGlRenderState`, which runs ONCE per state. (b) had already proved every one of them gets
  flipped one-way by another pass. Neither half is a bug alone; together they are, which is why looking
  from one end only found leaks that seemed survivable.
  CULLING IS THE DESTRUCTIVE ONE AND IT IS NOT A DEGRADATION. Flight's 2D quad is wound
  `(x0,y0) (x1,y0) (x1,y1)` in a y-down space, and `setGlMatrixFromTransform` flips y, so in clip space
  it is CLOCKWISE — a back face under the CCW default. Measured in real WebGL2 rather than argued from a
  cross product: 2304 lit pixels with culling off, 0 with it on. So a frame that draws a single-sided 3D
  mesh and then any 2D content loses the 2D content ENTIRELY.
  Why nothing caught it: exactly one functional scene mixes the two (`render-pass-viewport.webgl.ts`)
  and it draws 2D at line 104 before 3D at line 155 — the safe order. A scene in the other order would
  have shown a blank half-frame on the first capture.
  RULED AND FIXED: THE CONSUMER ESTABLISHES ITS OWN PRECONDITIONS. `renderGlScene2D` now sets all three
  at pass entry. The inversion is the point — "every writer must leave `BLEND` on and `DEPTH_TEST` off"
  is unenforceable and unbounded in time, silently violated by the next pass anyone adds without reading
  the whole package; "the reader sets what it needs" is local, bounded, and self-heals within one frame.
  The 3D path was already doing this correctly by setting depth and cull per draw, which is why it never
  paid for the leaks it was itself creating. Cost is three capability calls per 2D pass, none per draw.
  Who owns the `BLEND` enable bit for `drawGlFullscreenPass` is a SEPARATE open question this does not
  settle: that pass sets equation and factors twice and owns the enable bit at neither point.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-31** — Fixed-function ownership sweep, three more defects. `drawGlFullscreenPass` now owns
  the `BLEND` enable bit (it set factors but not the bit, and `drawGlScene3D` ends a blended-subset pass
  with `gl.disable(gl.BLEND)` and never re-enables, so a present or effect pass after a 3D scene
  composited unblended) and `CULL_FACE` (the quad survived only because it is wound CCW and
  `glMeshProgram` restores FRONT_FACE per draw — its own comment records that a CW leak blanks the
  frame). `GL_RENDER_STATE_TEXTURE_UNIT_COUNT` 3 -> 14: the bracket promised to hand a host its context
  back but saved only the 2D pipeline's units, while PBR binds through 6, shadow/IBL 8-11 and skin
  palettes 12-13. Also added `TEXTURE0`/`ACTIVE_TEXTURE`/`DEPTH_WRITEMASK` to the shared WebGL2 fake,
  without which those units all collapsed onto one `NaN` key and the assertions proved nothing.

- **2026-08-31** — `drawGlFullscreenPass` now owns depth: it disables the depth test and depth writes
  around its draw and restores them (`glFullscreenPass.ts`). It had inherited whatever the previous draw
  left, so after a 3D scene the present quad ran under `GL_LESS` with writes on, against the DEFAULT
  framebuffer — the one surface nothing clears between frames. Frame one passed and wrote its own depth;
  every frame after it was rejected at that same depth. Result: every 3D WebGL example (materialshowcase,
  scene-picking, scene3d, scene-fire) rendered frame one and froze, with the scene still drawing
  correctly behind a stale canvas. No GL error, no exception, and every static capture matched, because a
  capture only samples the opening frames — the exact window in which the defect does not yet exist. The
  WebGPU path cannot have this shape: its fullscreen pipeline declares no `depthStencil`, and WebGPU
  depth state is per-pipeline rather than inheritable context state.

- **2026-08-30** — `GlPipeline` Entity landed: `createGlPipeline`, `createEmptyGlRegistries`, `getGlPipelineRegistries` — the backend core's immutable pipeline primitive, consumed by `scene2dGlPipeline` and future GL assemblies.
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
