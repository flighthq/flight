---
package: '@flighthq/scene-gl'
updated: 2026-07-21
basedOn: ./review.md
---

# scene-gl — Assessment

> Recommendation layer over [review.md](./review.md), framed as a **merge gate**: base is the approved `origin/main` (`eb73c3d74`); the judged subject is the `integration-b2824e3d8` delta. `Recommended` is strictly sweep-safe (within `@flighthq/scene-gl`, no cross-package coupling, no open design decision). `Backlog` is everything else, each with its parking reason. `Approved` is empty — approval is the user's verbal gate. The charter is still `draft: true`, so every design fork and cross-package item routes to the charter's **Open directions** (closing section), not into `Recommended`.

## Directed

1. **Realize `ExtendedPbrMaterial` through separately imported extension registrations.** Standard PBR stays untouched. Remove the old per-extension material renderers/registrars and register each `PbrExtension.kind` realization independently into an open GL registry.
2. **Sample every declared extension map and compose lobes coherently.** Clearcoat factor/roughness/normal, sheen color/roughness, anisotropy direction/strength, iridescence thickness, specular color/factor, subsurface thickness, and transmission/volume maps must reach shader behavior rather than only define keys or uniform packing. Combined-extension variants need raster proof, not source-string tests alone.
3. **Implement real transmission as explicit passes and inputs.** Capture opaque scene color, sample it through the refractive path, and apply Beer–Lambert absorption using thickness, attenuation color/distance, and IOR. Keep the opaque-scene-color attachment/pass reusable; do not hide it inside a material kitchen sink.
4. **Follow diagnostics inversion for unsupported realizations.** Missing extension registration or a backend-unsupported combination returns a sentinel and has a shakeable `explain*`/optional guard. Do not throw unconditionally from the draw hot path, and do not turn a GL limitation into a material-domain prohibition.
5. **Add exhaustive GL raster functionals.** Cover each extension with scalar inputs, each texture path, coherent multi-extension combinations, missing-registration diagnostics, and transmission against distinguishable captured background/depth. Assertions should verify rendered regions/relationships in addition to fingerprint stability.
6. **Keep backend caches internal to state/runtime.** PBR programs, extension handler resolution, opaque-scene captures, and draw scratch are private `GlSceneRuntime`/render-state implementation data unless an external custom renderer demonstrably needs a primitive.

## Recommended

Sweep-safe, within-package, no design decision required. Safe for a blanket "do all recommended."

- **Wire `hasGlMeshGeometryUv1` into the standard-PBR `bind()` so the `HAS_UV1` path stops being dead surface.** The delta ships the full uv1 feature — the `hasUv1` define bit, `#define HAS_UV1`, the `a_uv1`/`v_uv1` plumbing, the occlusion-via-`v_uv1` route, and the `hasGlMeshGeometryUv1` detector — but no production path turns it on: `standardPbrGlMeshMaterialRenderer.bind()` still calls `buildGlPbrStandardDefineKey(pbr, …)` with two arguments, and the detector's only caller is its own test. Thread the geometry's `hasGlMeshGeometryUv1(geometry)` result into the `hasUv1` argument at the point the geometry is available so the compiled variant matches the actual layout. Within scene-gl (`glMeshUpload.ts` detector already exists + `standardPbrGlMeshMaterialRenderer.bind()`); no type or render-layer change, no API break. — review.md §7(b)

- **Remove the dead `normalMatrix` field from the draw entry (or honor the placeholder).** `createDrawEntry()` allocates `normalMatrix: createMatrix4()` and the partition loop writes `entry.normalMatrix = worldMatrix; // placeholder`, but both passes recompute into `scratchNormalMatrix` and never read `entry.normalMatrix`; the field is also a `Matrix4` where the proxy consumes a `Matrix3`, a mismatch the `object`-typed header hides. Drop the field and its allocation. Pure within-file cleanup. — review.md §7(c)

- **Collapse the two identical pool helpers into one `acquireDrawEntry(pool)`.** `acquireOpaqueEntry` and `acquireBlendedEntry` are byte-identical; the pool argument already carries the opaque/blended distinction. One primitive replaces the blood-from-a-stone split. Within `drawGlScene.ts`. — review.md §1

- **Capture the `mesh-blend-transparency` functional baseline.** The WebGL-only functional test for the new blended pass renders but its screenshot + fingerprint baseline was never committed — the one open action item the status doc flags. Run the capture→baseline loop and commit so the two-pass sort gains a regression gate. Local to the test; no source change. — review.md §honesty-check

## Backlog

Parked: each needs cross-package coordination, a larger GPU subsystem, or an Open-direction decision the charter has not yet made.

- **Pool semantics — make the draw-entry "pool" recycle, or drop it.** _Parked: design decision, and an existing charter Open direction._ The delta's `opaquePool`/`blendedPool` have no matching `release*`, so after frame 1 every frame allocates fresh entries — the name implies a paired-bracket contract the code does not honor. Adding a `release*` after each pass vs. replacing the pool with plain per-frame arrays (entries are cheap) is a genuine either/or the charter should rule, not a mechanical sweep. Routed to Open directions #3. — review.md §7(a)

- **Per-fragment / per-subset transparency ordering.** _Parked: a deliberate approximation, larger than a sweep._ The blended pass sorts by **mesh-origin clip-W** only; intersecting or large transparent meshes, and multiple blended subsets within one mesh, can composite out of order. This is the standard limitation of object-sorted forward transparency and is honestly documented; moving to per-subset depth or OIT is a real GPU subsystem decision, not delta polish. — review.md §4/§7

- **Multi-light forward path.** _Parked: cross-package design fork._ The delta only zero-fills the new `hemisphereCount/pointCount/spotCount` counts the upstream `SceneLightBlock` type added; consuming them (N-light loop, attenuation, `MAX_FORWARD_LIGHTS`) rewrites the authoritative seam in `@flighthq/types` + the pack step in `@flighthq/render` and lands in `scene-wgpu` + Rust in lockstep. Not landable in scene-gl unilaterally. Routed to Open directions #1. — review.md §delta-vs-pre-existing

- **`destroy*` teardown for GPU programs / VAOs / buffers.** _Parked: pre-existing gap + open ownership decision._ Unchanged by this delta (the base already lacked it); the new pools add only GC objects, not GPU resources. Where `destroy*` lives is an unmade charter decision. Routed to Open directions #2. — review.md §delta-vs-pre-existing

- **IBL, shadow mapping, GPU skinning, transmission's real refractive path, UBO for the light/ per-object block.** _Parked: large GPU subsystems, each cross-package._ All pre-existing; none touched by this delta. They remain the distance-to-authoritative items the base review enumerated and the fork-G sequencing call. — review.md §delta-vs-pre-existing

## Approved

_None. Approval is the user's verbal gate; nothing is moved here without it._

## Notes for the charter's Open directions

The charter is `draft: true`; these are the design forks the delta re-surfaces. Note them in the next direction session — do not action them in a sweep:

1. **Lighting-model bound** — the delta zero-fills point/spot/hemisphere counts but consumes none. Is one-directional+one-ambient a deliberate tier-1 boundary, or is the multi-light `SceneLights`/ `SceneLightBlock` redesign now in scope (cross-package with types / render / scene-wgpu / Rust)?
2. **GPU teardown ownership** — scene-gl per family vs. one `destroyGlScene*` over `GlSceneRuntime` vs. delegated to `render-gl`'s state destroy.
3. **Pool semantics** — recycle with a `release*` bracket, or drop the pool for per-frame arrays. The delta makes this concrete by introducing the non-recycling pool.
4. **scene-wgpu parity as a stated boundary** — the delta's transparency sort and `HAS_UV1` path both land on the wgpu parity-gap list. Is "scene-gl leads, scene-wgpu follows" blessed, or do new features land in both backends together?
5. **`hasUv1` material-time vs `uv1` geometry-time mismatch** — once wired (Recommended above), is passing the geometry signal into `bind()` the intended seam, or should `uv1` presence reach the material renderer another way (geometry is not available at today's `bind()` signature)?
6. **Extension-map flags in the define-key cache**, and **IBL / shadow / skinning scope and sequencing** (fork G) — unchanged by this delta; still the charter's to settle.
