---
updated: 2026-08-13
by: manager, integration
---

# WebGPU backlog — accumulated, deliberately deferred

> **Status: accumulating.** Every item here is confirmed against the tree at the commit named in its
> entry. This list exists because WGPU work is **deferred behind other work by standing decision**, not
> because these are low severity — several are render-visible and one is a silent total failure.
>
> Deferral is a scheduling choice. Nothing here is closed, dismissed, or downgraded. When WGPU work is
> scheduled, this is the queue, weakest-first is not the ordering — severity is, and it is stated per
> entry.
>
> **Why deferred (2026-08-12, standing):** WebGPU support is **aspirational**, and it **does not run on
> the maintainer's host machine at present**. Two consequences that should shape any WGPU work, not just
> its priority:
>
> 1. **A WGPU fix cannot be verified by the maintainer.** Agents *can* exercise WebGPU in-sandbox
>    (headless Chromium with the software adapter, on a secure-context origin), so agent-side capture
>    evidence is real — but it is **unverifiable at the boundary it has to cross**. Treat any WGPU
>    capture claim as trust-only from the maintainer's side and say so when reporting one.
> 2. **GL and WGPU are expected to diverge while this holds.** A backend split is a recorded state, not
>    an anomaly. Scope functional scenes to the backends actually being fixed and record the WGPU gap
>    here, rather than leaving a permanently red gate that everyone learns to ignore.
>
> When a scene is deliberately scoped to exclude WebGPU because of an entry below, **that entry must say
> which scene to widen** once the fix lands. The backlog is the only memory that the narrowing was
> temporary.

Cross-package by design: it spans `render-wgpu`, `scene3d-wgpu`, `scene2d-wgpu`, and `effects-wgpu`,
so it does not live in any one package cell. Each affected cell's `status.md` `## Open` carries a
one-line pointer here rather than a copy, so there is one source and it cannot drift.

## How to add an entry

State the evidence, not the conclusion. Every entry carries: what breaks, **what reaches it** (the
production path, or "no known path"), whether it is **render-visible**, **how it escaped** (which test
exists and what it actually asserts), and the **sibling** — GL is usually the correct one, and where it
is, the fix is largely already written.

An entry without a reaching path is a curiosity; an entry without an escape analysis will be
re-introduced by the next person.

## Open

### Silent total failure

- **Non-indexed geometry is never drawn.** `ensureWgpuMeshUpload` returns `null` when
  `geometry.indices === null` (`packages/scene3d-wgpu/src/wgpuMeshUpload.ts:20`), so
  `drawWgpuMeshSubset` issues no draw at all.
  **Reaches it:** valid glTF primitives may omit indices and the importer preserves that; AWD2 has an
  explicitly tested positions-only path. Real imported geometry disappears entirely.
  **Render-visible:** yes — WGPU only, and it renders *nothing* rather than something wrong, so a user
  is likely to read it as their own asset being broken.
  **Escape:** format tests stop at geometry construction; WGPU draw tests use indexed built-ins.
  Neither composes the contract. **Coverage cannot see this** — the null-indices arm *is* taken by a
  test, which asserts the buggy `null` return as correct (measured: `untested scene3d-wgpu` flags one
  arm in that file, at line 31, not line 20).
  **Sibling:** GL is correct — it uploads the vertex stream and calls `drawArrays` with the vertex
  count; `glMeshProgram.test` covers it.
  **Fix shape:** upload retains `vertexCount` without requiring an index buffer; `drawWgpuMeshSubset`
  issues a draw for non-indexed subsets. No API signature change expected.

### Render-visible, wrong output

- **Negative-determinant instances have inverted facing** (the WGPU half; the GL half is tracked with
  the main render work). `wgpuMeshPipeline.ts:166-167` hard-codes `frontFace: ccw` / `cullMode: back`
  with no determinant branch anywhere in the render tree, shadow passes included.
  **Reaches it:** glTF 2.0 specifies CW winding for negative global-transform determinant and sanctions
  negative scale as the mirroring mechanism; `gltfParse` preserves negative scale. Also reaches any
  native scene node with an odd number of negative scale axes.
  **Render-visible:** yes — a mirrored node has its intended exterior culled.
  **Escape:** importer transform tests and renderer cull tests each validate their own side; nothing
  composes negative determinant with facing. Every line involved already executes.
  **Fix shape (specified, not yet built):** `mirrored = det < 0` from the world matrix upper-3×3,
  computed once per visible mesh where the draw loop already calls `getNodeWorldMatrix4`. Because WGPU
  selects its immutable pipeline *before* the world matrix is populated, follow the existing
  orthogonal-run pattern: `mirrored` as a `DrawEntry` field and run discriminator,
  `runtime.activeMirroredRun` set before bind beside `activeSkinnedRun`/`activeBlendedRun`, folded into
  every pipeline cache key. That creates the CW variant **lazily, only on an actual mirrored run**, so
  unmirrored scenes pay nothing. Shadow cache identity extends to `(skinned, mirrored)`.
  **Trap:** do **not** skip facing selection for double-sided materials. Culling is off, but every lit
  shader family uses `@builtin(front_facing)` to negate the back-side geometric normal, so a wrong
  `frontFace` *mislights* mirrored double-sided meshes with nothing culled.

### Fix complete, awaiting the maintainer's merge decision

- **Non-indexed draw** — the fix above landed and was validated before the deferral reached the builder.
  It is held with integration rather than discarded, labelled as WGPU-deferred and complete. **The
  maintainer cannot verify it** (see the header): the in-sandbox green is trust-only from their side.
  Holding finished work costs more than landing it — it rots against every rebase and conflicts with the
  next person in that file — so the merge call, not the work, is what remains.

### Resource lifetime — recorded 2026-08-12, structural

The retire-until-submit contract exists and is documented in `wgpuBackground`; these paths do not honour
it. **GL twins are not evidence against any of these**: GL executes immediately, so the problem cannot
exist there by construction. This is WGPU-only and structural, not a parity gap.

- **Video texture destroyed immediately on resolution change** — `bindWgpuVideoTexture`
  (`wgpuDraw.ts:240`) destroys the outgoing texture at once, against `retireWgpuTexture`'s explicit
  contract that anything replaced during recording is retired until post-submit. If the old entry was
  bound earlier in the same frame, its recorded bind group references a destroyed texture and **can fail
  the whole submit**. *The same file retires ordinary `TextureSource` version replacements correctly* —
  an inconsistency within one file, not a missing capability.
  **Escape: mode A.** The existing test spies on `destroy` and asserts it happens *immediately* — it pins
  the defect as correct and will fight whoever fixes it.
- **Three draw-time replacement paths bypass retirement** — `ensureWgpuMeshUpload` destroys old
  vertex/index buffers on a version miss; `ensureWgpuWireframeUpload` destroys the old line-index buffer;
  `resizeWgpuRenderTarget` destroys colour/depth textures even though the target may already have been
  sampled or rendered earlier in the **same command encoder**. A mutation between two draws, or a
  render-texture resize after an earlier sample, invalidates recorded commands before submit.
  **Escape: mode E** — tests assert new data and version land, never that old resources survive to submit.

### Wrong pixels reach the screen

- ★ **A nested offscreen pop draws to the canvas while the runtime believes it is drawing to the outer
  offscreen target.** The pop restores `currentRenderTarget` to the outer target but **reopens
  `saved.canvasTextureView` and the main `depthStencilView`** rather than the outer target's view and
  depth-stencil. So the claimed target and the view GPU commands actually hit diverge.
  **Escape: the existing nested-target test checks the TAG — which target is claimed — not which view the
  commands reach.** Same shape as the `glRenderPass` stencil defect: an internal restore that reads as
  correct because what the test checks is not what matters.
- **Enclosing depth/stencil cannot survive a detour.** Pass encoders store both as `discard` and resume
  clears both, so depth and stencil state is lost across a nested detour rather than preserved.

★ Both found by applying the **set-difference method** to the WGPU begin/end pass bracket — enumerate what
the draw paths touch, diff against the bracket's saved-field list, take the residue as the candidate set.
Saved today: `canvasTextureView`, `canvasViewCleared`, main `depthStencilView` handle, `renderTargetViewport`,
`renderTransform2D`, `currentColorFormat`, `currentRenderTarget`. **Unlike the GL bracket, which converged
to a single item, the WGPU residue is not empty** — the method's second application found real gaps, which
is the argument for running it on every remaining bracket.

- **Retained 2D render cache is cleared and submitted transparent on the clean path.**
  `refreshWgpuRenderCache` calls `beginWgpuRenderPass` **before** `prepareScene2DRender`, and the pass
  defaults colour `loadOp` to clear. When `requiresInvalidation` reports clean and the target size is
  unchanged, it skips `renderWgpuScene2D` and returns `false` — but the pass has already cleared, so a
  **transparent target is submitted in place of the retained cached content**. Can produce a visible
  flash. GL explicitly begins with `preserveColor`/`preserveDepth`, so retained pixels survive its clean
  path. **Escape: modes B and F together** — the test asserts only `false`/no-rebake, never the pass
  `loadOp` or the retained pixels.
- **Empty clip rectangles leak the origin pixel.** `applyWgpuScissorRect` clamps degenerate width/height
  to 1, and both `push`/`popWgpuClipRectangle` use `setScissorRect(0,0,1,1)` for an empty intersection,
  because WGPU requires nonzero scissor dimensions. That draws one pixel where **all** fragments should be
  clipped; GL preserves zero width/height and correctly draws none. Needs an explicit
  empty-clip draw-suppression mechanism, not a fake nonzero rect.
  **Escape: mode A** — `render-wgpu`'s own `wgpuScissor.test` *expects* `[0,0,1,1]` as correct, and
  `scene2d-wgpu`'s clip tests never exercise an empty intersection at all.
- **A full colour matrix is silently dropped on shape meshes.** `drawGlShapeMeshes` delegates tessellated
  solid fills to the registered colour-adjustment fold for **either** `colorScaleBias` or `colorMatrix`;
  `drawWgpuShapeMeshes` delegates only when `colorMatrix` is null and `colorScaleBias` is non-null, so a
  full matrix falls through to the lean untinted pipeline. **WGPU quad batches do support matrix
  adjustment**, so the same node intent changes behaviour by shape-rendering path, not merely by backend.
  An internal comment calls it outside the bounded fold, but no sentinel or guard reaches callers.
  **Escape: mode A** — the existing test pins zero colour-adjustment uniforms as correct.
- **Detached rotated cache roots get oversized or misplaced targets.** `refreshGlRenderCache` uses
  `computeNodeRootLocalBoundsRectangle`, whose contract explicitly differs from the generic
  `computeNodeBoundsRectangle(out, root, root)` — for a detached rotated root the generic helper takes its
  world-AABB branch and cannot recover tight root-local bounds once the root transform is cancelled.
  `refreshWgpuRenderCache` still uses the generic call. Canvas shares the older call too; the isolated
  WGPU gap is the one this sweep establishes. **Escape:** WGPU cache tests use only unrotated roots.

### Skinned meshes render undeformed under four built-ins

- **Debug, Matcap and Wireframe ensure-callbacks ignore `skinned`**, their modules embed the rigid
  `WGPU_MESH_PRELUDE_WGSL`, and the resulting pipelines keep `skinned=false` against GPU-only bind-pose
  vertices. The GL mirror of this is a confirmed defect being fixed on its own slice (Depth, Normal,
  Matcap, Wireframe all ignoring `activeSkinnedRun`).
  **What makes it a defect rather than a design choice is the denominator:** Unlit, the Lambert / Phong /
  Blinn / Emissive classic family, Toon, Shaded, Standard and SpecGloss PBR, Custom, and shadow **all**
  correctly select skin variants. Nine-plus agreeing siblings against four dissenters.
  *Diagnosis only — no WGPU code was written; builder3 confirmed the stop explicitly.*

### Broken under orthographic projection

- **`DepthMaterial` promises linearized view-space depth and silently produces a constant.** Both the GL
  and WGPU preludes compute depth as `1/fragment-position.w`, camera-agnostic. Under perspective that is
  the standard trick, since `w` carries view-space −z. **Under orthographic, clip `w` is a constant 1 for
  every vertex, so every surface maps to depth 1** regardless of actual view-space z — a GL probe rendered
  uniformly black at near=3/far=7 with an eye distance of ~5, where a visible gradient was expected.
  ★ **The fix path already exists in-repo as a lead:** `getCamera3DLinearDepth` (CPU side) already has a
  distinct orthographic affine path separate from the perspective `1/w` path. **The GL and WGPU preludes
  never branch on projection kind at all.**
  This is the **second** orthographic-assumption defect found today — the first was transparency sorting
  by clip-space `w`, also constant under orthographic, fixed on GL. Same root shape: *code that treats `w`
  as carrying depth information, which is true only under perspective.*

### Registrar seams missing while the capability exists

- **`ExtendedPbrMaterial` has no WGPU registrar or renderer.** GL exports
  `registerGlExtendedPbrMaterial` plus a renderer and extension registry; WGPU exports neither and has no
  renderer for `ExtendedPbrMaterialKind`, so **imported glTF materials promoted to that substrate-agnostic
  kind resolve no WGPU renderer and are silently skipped.**
  ★ **The shader-side capability already exists** — the WGPU PBR prelude and pipeline already contain the
  clearcoat / sheen / anisotropy / iridescence / specular / subsurface / transmission flags and lobes, and
  the standard renderer simply hardcodes them all false. Only the realization seam is absent.
  Same shape as the `CustomShaderEffect` gap: **document-or-implement, silent absence is neither**, and the
  same `reachability:check` blind spot means no automated gate sees it.

### Diagnostics absent on one backend

- **No deform guard.** GL's opt-in guard catches morphs drawn before `prepareScene3DMorph` and skins drawn
  before `prepareScene3DSkinning`. WGPU has no equivalent — **and additionally treats a skinned mesh as
  rigid when `registerWgpuGpuSkinning` was omitted**, silently uploading and drawing the undeformed layout
  with no warning.
- **No colour-space guard.** GL's guard catches linear scene radiance drawn straight to canvas without an
  sRGB present. WGPU calls `declareWgpuRenderTargetColorSpace(state,'linear')` and **silently ignores a
  false return** when there is no target.

- **No effect-pipeline skip report — recorded 2026-08-13.** `wgpuRenderEffectPipeline.ts` drops an effect
  whose kind has no registered runner with a bare `continue`: no draw, no error, no artifact. GL now
  reports the dropped kind once per kind through `setGlRenderEffectPipelineSkipGuard`, installed by
  `enableGlRenderEffectGuards`; **WGPU has no guard module at all**, so `effects-wgpu` has nowhere to
  install a reporter and adding the seam alone would ship dead code. **Reaching path:** any chain
  containing one of the seven kinds with no runner on any backend (`AutoExposureEffect`,
  `BarrelDistortionEffect`, `FilmEmulationEffect`, `PanniniProjectionEffect`, `SsrEffect`, `TaaEffect`,
  `VolumetricLightEffect`), each of which ships a constructor and defaults a user can reach today.
  **Render-visible:** no — the frame is written without the effect, which is the problem: it is
  indistinguishable from an effect that ran and did nothing. **How it escaped:** `reachability:check`
  compares runners against registrars, and a kind with neither is outside that population by
  construction. **Sibling:** GL, at `c55df8c8d` — the fix is written, and the gap is that
  `effects-wgpu` needs the guard module `effects-gl` already has (application explanation, custom-shader
  source, and this skip), which is why it is a module-sized item rather than a one-line port.

Both of the above are the diagnostics-inversion rule implemented on one backend only, and no cross-backend
gate sees an absent module.

### Correctness gaps against the GL sibling

- **Pipelines always assume triangle-list topology.** Material pipelines are created before geometry is
  known and `createWgpuMeshPipeline` defaults topology unconditionally. Indexed **non**-triangle-list
  geometry (strip/line/point) has no documented precondition against it — `ensureWgpuMeshUpload` accepts
  it — and is then uploaded and `drawIndexed` under the wrong primitive topology. GL is fine:
  `getGlPrimitiveMode` supports all five `PrimitiveTopology` values per geometry.
  *Distinct from the already-fixed non-indexed case*, which had an explicit documented null-sentinel
  precondition and was correctly retired as already-handled.
- **Mip-chain realization is draw-order dependent** in both texture caches. `bindWgpuTexture` returns a
  `runtime.textureCache` hit without considering a later `generateMips=true`; `bindWgpuTextureSourceTexture`
  returns a same-version hit before considering it. Entry types store no mip-capability metadata, so there
  is no upgrade path once cached — a source first sampled by a no-mip 2D path stays at `mipLevelCount=1`
  even when later used by a mipmapped material. **The GL sibling generates the chain on the first later
  mip-sampling bind, so this is a real divergence, not a WGPU-only gap.**
  **Escape: mode E** — first-call-false and first-call-true are each covered; their composition is not.

### Contract silently unhonoured

- **`CustomShaderEffect` has no WGPU runner, no source registry, and no explicit unsupported sentinel or
  documentation** — it is simply absent, with no signal in either direction. `RenderEffect`'s own contract
  says one intent list drives every backend and the type is backend-agnostic, so a caller has no way to
  learn this short of nothing happening.
  **Context that makes this the sharp one:** an inventory pass over all named effect runners found **45 of
  47 pair exactly** between GL and WGPU. The other exception, `BokehDepthOfFieldEffect`, is already
  causally explained by the same documented no-scene-depth-G-buffer limitation as `ScreenSpaceFog`. So
  this is the single unexplained hole in an otherwise complete correspondence — a null result across 45
  pairs is what makes the one outlier meaningful.
  **Resolution is document-or-implement**, and either is acceptable; what is not acceptable is silent
  absence. Note that `reachability:check` gates the runner↔registrar inverse *within* a backend and so
  cannot see a cross-backend hole of this shape.

### Observability, not correctness

- **No diagnostic trail on effect failure.** `glRenderTextureEffect` reports six distinct failure
  conditions (source-unavailable, stale-destination, unregistered, partial-registration, unresolved,
  partial-resolution) through an exported explanation function plus a guard. `wgpuRenderTextureEffect`
  silently returns `false` for a missing source or zero registered operations and silently drops
  unregistered stages, with no WGPU explanation type, guard, or resolution probe anywhere. Behavioural
  application otherwise matches. **WGPU fails the same way GL does and says nothing while doing it** —
  which is the diagnostics-inversion rule unimplemented on one backend.

### Unexplained, recorded not chased

- **`particle-emitter-3d/webgpu` baseline moves with no attributable cause** (2026-08-12). Surfaced when
  the six-builder winding remedy's stop condition fired correctly: it was the only baseline that moved,
  and `rg` finds **no `MeshGeometry` reference of any kind** in either `particle-emitter-3d` scene.
  **Ruled out, two ways, by measurement rather than argument:** reverting the winding builders to
  pre-fix and re-running still moves it; rebasing onto the newer base (17 peer commits) and re-running
  still moves it — so neither the change nor a stale base explains it.
  **Deliberately not concluded:** a WebGPU capture difference in this environment is the *likely* read,
  and it is recorded as a hypothesis only. *"Probably the environment" is exactly the explanation that
  hides a real defect* — settling it needs comparison against whatever machine originally captured that
  baseline, which is not reachable from here.
  **Possible lead, not a claim:** this scene already has history in the recapture arc, where a
  `particle-emitter-3d` **WebGL** twin column was newly created. Whether the WebGPU column's instability
  is related is unexamined; the two facts are recorded adjacent, not joined.

- **Seven webgpu-changed capture columns with no established cause**, carried over from the drift and
  recapture arc: `env-ibl`, `env-skybox`, `render-target-node-2d`, `material-custom-shader` (each closed
  on an exact WebGL edge but also moved on WebGPU, unexplained), plus `bitmap-smoothing`,
  `effect-bokeh-dof`, `node-blend-modes` (outside any bisect). Recorded in `unbacked-register.md` L28
  with evidence pointers.
  **"WebGPU matches baseline" is untested repo-wide** — 118 of 119 columns were never checked. That is
  a statement about where nobody looked, not a defect claim.

### API surface — a lane decision the boundary cannot verify

- **`bindWgpuTexture` and `bindWgpuVideoTexture` stay on `render-wgpu`'s `./contract` lane.** Ruled by
  manager 2026-08-12 and recorded here rather than dispatched — **the recording is the ruling, not a
  deferral of one.** Both are exported on `./contract` (via `export * from './wgpuDraw'`), absent from
  the public `.` lane, and have **zero callers outside their own colocated test** (re-measured at
  `4b6815e59`). Removing them is defensible under the pre-release rename/restructure/remove rule, and
  that is exactly why it is not incidental cleanup: **it is an intra-SDK API-surface decision, and WGPU
  does not run on the maintainer's host, so no one can verify at the boundary that the removal breaks
  no consumer.** A lane change nobody can verify is what this file is for.
  **What reaches them:** no production path; any `@flighthq` package reaches them with one import and no
  export change — they are dormant, not unreachable.
  **Escape:** `npm run reachability:check` does **not** cover this — its lane population is effect
  runners/registrars plus `default*Renderer|Runner` symbols, so an arbitrary export never enters it.
  The instrument that answers a lane question is `npm run api package=<name>` / `npm run api:json`.
  Use the explicit `package=` form: a bare `npm run api <name>` searches function names too and returns
  matches from every package, grouped under their own headings.
  **Widen when:** WGPU runs on the maintainer's host, or a consumer appears. See
  `unbacked-register.md` L11 (lane fact and its correction) and L8 (the mid-frame-destroy shape both
  functions still carry, unfixed because nothing calls them).

### Coverage surface, for whoever schedules a pass

- `scene3d-wgpu` carries **273 unexamined branch arms across 36 of 49 source files** (`untested
  scene3d-wgpu`, 2026-08-12). Substantially larger than the foundation tier ever held. This is a work
  queue, not a defect list — and per the entries above, the defects that matter here are *not* in it.

## Log

- **2026-08-12** — Created. WGPU work deferred behind other work by standing decision; the non-indexed
  draw defect was ruled priority-one on severity and then deferred under that decision, with the
  consequence stated rather than absorbed.
- **2026-08-13** — Added the `bindWgpuTexture` / `bindWgpuVideoTexture` lane decision, recorded by
  integration on manager's 2026-08-12 ruling. Written here by integration because the file lives in the
  integrated tree; if manager wrote their own copy, keep one.
