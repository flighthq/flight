# Causal limitation prose audit

Audit date: 2026-08-19. The population is functional-scene expected-image prose plus file-level scene
commentary that explains a visible result through a backend limitation, plus the repair-sensitive capability
summaries and registrar/header inventories in `agents/maturity-gaps.md`, `agents/registration-model.md`, and
`agents/render-backend-support.md`. Generic negative image descriptions ("no overlap", "not blank"),
historical sections explicitly labelled resolved/superseded, package-local status diaries, and the broader
resource/text/physics backlog tables are outside the population.

A claim site is one file-level causal passage. Duplicated sibling passages count separately because either
copy can stale independently. Architecture summaries and tables that repeat the same mechanism inside one
record count as one claim group.

**STILL TRUE 21 · NOW FALSE 38 · CANNOT TELL 5**

## STILL TRUE — 21

The 12 functional claim sites all have an assert-the-gap guard. Ten guard the limitation directly in their
`assertRender`; the two Kuwahara sites use a source-formula tripwire because their current raster oracle
cannot isolate the quadrant defect.

1. `color-adjustment.canvas.ts` — the Canvas node color-adjustment fold is absent.
2. `effect-bokeh-dof.webgpu.ts` — Wgpu has no bokeh runner.
3. `effect-kuwahara.webgl.ts` — three Gl sector formulas still degenerate.
4. `effect-kuwahara.webgpu.ts` — three Wgpu sector formulas still degenerate.
5. `effect-msaa.webgpu.ts` — requested effect-pipeline MSAA still resolves single-sampled.
6. `effect-msaa-bloom.webgpu.ts` — the same single-sample limitation under bloom.
7. `effect-ssr.webgl.ts` — no Gl SSR runner.
8. `effect-ssr.webgpu.ts` — no Wgpu SSR runner.
9. `effect-taa.webgl.ts` — no Gl TAA runner.
10. `effect-taa.webgpu.ts` — no Wgpu TAA runner.
11. `material-blend-modes.webgl.ts` — fixed-function Darken still blackens zero coverage.
12. `material-blend-modes.webgpu.ts` — the same MIN/coverage limitation on Wgpu.

The nine architecture gap groups are source-guarded in `scripts/causal-limitation-prose.test.ts`:

1. Canvas has no `CustomShaderEffect` runner.
2. Canvas has no `ContactShadowsEffect`; Gl/Wgpu still route it through the SSAO approximation.
3. Canvas/DOM have no inline node color-adjustment feature.
4. Seven effects remain descriptor-only on every backend.
5. DOM deliberately excludes QuadBatch, Tilemap, BitmapText, and ParticleEmitter2D renderers.
6. DOM has no full-frame effect pipeline/`BlendEffect` realization.
7. `Scene3DLights` has no area-light field.
8. `InstancedMesh` and `LodMesh` remain type-only and absent from the scene barrel.
9. Wgpu has `CustomShaderMaterial`, but still no `CustomShaderEffect` runner.

## NOW FALSE — 38

Fourteen functional claim sites described repaired limitations. The current wording now describes the
measured result; items already repaired in the integration line are listed so the census includes the seeded
examples without duplicating their patches.

1. `bitmap-downscale-smoothing.canvas.ts` — Gl/Wgpu sampling is no longer one global filter.
2. `bitmap-downscale-smoothing.dom.ts` — same copied limitation.
3. `effect-bloom.canvas.ts` — Canvas bloom no longer uses the CSS brightness/globalAlpha attenuation.
4. `effect-chain.canvas.ts` — same bloom claim, plus the former saturation expectation.
5. `effect-msaa-bloom.canvas.ts` — same copied bloom-energy claim.
6. `effect-drop-shadow.webgl.ts` — Wgpu's source-composite route is no longer a no-op.
7. `effect-inner-shadow.webgl.ts` — same obsolete Wgpu route claim.
8. `effect-bevel.webgl.ts` — degree-authored angles no longer collapse through a radians mismatch.
9. `effect-gradient-bevel.webgl.ts` — same obsolete angle claim.
10. `shape-stroke-joints.canvas.ts` — GPU joins are now differentiated.
11. `shape-stroke-joints.dom.ts` — same copied join claim.
12. `effect-posterize.canvas.ts` — Canvas now has a real posterize runner.
13. `effect-lens-distortion.canvas.ts` — Canvas now has a real lens-distortion runner.
14. `effect-camera-motion-blur.webgpu.ts` — this scene uses the radial recipe, not an absent velocity-buffer path.

Twenty-four architecture claim groups were stale:

1. Canvas effect coverage was 18, not 15, in the registration/support inventories.
2. Screen-space effects were not uniformly descriptor-only/passthrough; MotionBlur has a velocity path.
3. DOM never realized the full-frame advanced `BlendEffect`; `mix-blend-mode` is the node primitive.
4. Gl/Wgpu texture smoothing is per draw, not global/first-bind-sticky.
5. Gl/Wgpu stroke joins are differentiated.
6. Gl/Wgpu RichText draws strikethrough.
7. The descriptor-only set is seven and does not include the realized ContactShadows approximation.
8. Canvas exports 18 real runners; the 31 passthrough registrations are gone.
9. Point/Spot/Hemisphere lighting is wired on both GPU backends.
10. GPU skinning, compressed textures, and particles have functional cells.
11. Wgpu has a `CustomShaderMaterial` renderer.
12. Wgpu has a 3D-particle renderer.
13. Wgpu lighting/shadow/IBL has functional evidence.
14. Ordinary Sprite has a DOM renderer; only batch kinds are deliberately excluded.
15. `ThreeDsMaterial` is consumed by the 3DS parser and converted to BlinnPhong, not dead.
16. Wgpu skinning is implemented across the five material families.
17. Registration, texture-resolution, and color-adjustment diagnostics have opt-in guards/explainers.
18. Parsed skinned content is not Gl-only; both GPU scene paths can deform it.
19. Wgpu IBL is implemented and has an `env-ibl` cell.
20. Wgpu orthographic rendering is no longer blank.
21. The browser/SwiftShader capture path exists and renders real GPU-backend pixels.
22. The recommended Wgpu skinning port/functional cell is complete.
23. Wgpu video and compressed-container rendering are complete; Basis transcode remains.
24. Four UV-origin rows now describe seams that fail absent their landed compensations, not live failures.

## CANNOT TELL — 5

These claims depend on runtime policy or an unresolved design rather than source-visible backend capability,
so they are bounded rather than asserted as gaps:

1. `env-skybox.webgl.ts` — cube-face transition profile depends on runtime filtering/seam policy. **Release
   observation:** in a pinned official WebGL capture, scan a sphere-clear row across the predicted x≈55 and
   x≈745 face boundaries and report the first/last mixed-colour pixels together with the runtime min/mag filter
   and cube-seam state. The same frame's green/yellow/red face-centre probes are the positive control; their
   presence makes the measured hard edge or blend width/profile admissible.
2. `env-skybox.webgpu.ts` — same source uncertainty, but its runtime sampler is independent. **Release
   observation:** repeat that boundary scan in a pinned official WebGPU capture, reporting the sampler and
   seamless-equivalent state; use the same frame's three face-centre probes as the positive control. That
   observation settles the WebGPU transition independently of WebGL.
3. `svg-image.ts` — exact magnified seam width/profile depends on backend resampling. **Release observation:**
   for each supported backend in a pinned runner, scan horizontally through x=300 at y=150 and vertically
   through y=210 at x=240, then report the first/last mixed pixels and their colour profile. The four asserted
   quadrant-centre colours in the same frame are the positive control; those scans settle a backend-specific
   seam profile without promoting one backend's result into a shared contract.
4. `swf-alpha-transform.ts` — the backend RGB-fold difference is an undecided design. **Release observation:**
   after an architecture ruling chooses parity or explicitly preserves backend divergence, capture all four
   backends and observe the ruled fourth-square colour on each; the first three cross-backend-equal squares are
   the positive control. The ruling plus that four-backend result releases the temporary WHITE-versus-GREEN
   bound into the selected permanent contract.
5. `maturity-gaps.md` group/container blend — the record says unverified/likely absent; source inspection does
   not establish a supported semantic contract. **Release observation:** add a minimal functional A/B whose
   overlapping-child result differs between whole-subtree blend, per-child blend, and Normal, alongside a known
   supported child-level blend as the positive control. A group result matching the once-flattened reference
   establishes support; byte identity with Normal while the control changes establishes absence.

`scripts/causal-limitation-prose.test.ts` pins the classification total, the ten direct functional guard
markers, the two Kuwahara source tripwires, and all nine architecture absence groups. A capability repair
therefore fails with the stale prose owner named instead of silently aging this record.
