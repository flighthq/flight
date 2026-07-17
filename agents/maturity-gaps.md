# Flight SDK — Production-Readiness Maturity Gaps

A synthesized punch-list merging eight per-area production-readiness audits (3D model import, skeletal
animation/skinning, resource loading/lifecycle, render-backend parity, materials/effects/adjustments,
lighting/3D scene, text/glyph, and animation/simulation/game systems). The point is to surface what is
**not** ready — features a user most likely assumes work but don't. Cites are file/line references from
the audits; treat them as the starting point, not gospel.

Companion docs: [quality-plan](quality-plan.md), [test-depth-review](test-depth-review.md),
[render-backend-support](render-backend-support.md), [effect-adjustment-architecture](effect-adjustment-architecture.md).

Bite legend: **SURPRISE** = looks done / tests green but silently does nothing or wrong; **MAJOR** = real
capability gap a real app hits; **MINOR** = fidelity/edge-case hole or breadth gap clearly unbuilt.

---

## 1. Executive summary — the biggest "will bite you" surprises

Ranked, worst first. Each is something a user assumes works and it does not.

1. **The GPU test-confidence illusion.** Every gl/wgpu code path is unit-tested against a *mock* WebGL2
   context in jsdom (`displayobject-gl/src/glTestHelper.ts:7`) and never executes on a real GPU in this
   repo. "Renderer tests green" is a far weaker guarantee for the GPU backends than for Canvas — the real
   parity gaps (joins, smoothing, tint, blend modes, skinning) are exactly what a mock can't catch.
2. **Screen-space & G-buffer effects are theater.** SSAO/SSR/TAA/motion-blur/contact-shadows/volumetric-light
   are descriptor-only or passthrough/approximate placeholders on *every* backend including gl/wgpu, because
   the effect pipeline is color-only (no depth/normal/velocity/history buffers). They pass regression baselines
   that captured the stub output.
3. **Skinned glTF/PBR characters render in bind pose on the GPU.** GPU skinning is wired only for the
   "classic" material family on gl (`scene-gl/src/glClassicPrelude.ts:180`); PBR/toon/unlit have no skin
   variant and glTF imports emit PBR by default, so the mesh silently ignores joints. WebGPU has **zero** GPU
   skinning. No warning fires; the shipping example quietly leans on CPU `updateMeshSkin` every frame.
4. **Non-Latin text is fundamentally broken, not just unstyled.** `textbidi` (UAX #9) and `textsegment`
   (UAX #29) ship as packages but are wired into nothing — layout does no bidi reorder, no grapheme
   segmentation, and line-breaks on `\n`+ASCII-space only. Arabic/Hebrew/Indic/CJK/Thai render wrong. There is
   also no real shaping backend (advances-only `measureText`; no HarfBuzz), and MSDF/SDF fonts parse but no
   shader renders them.
5. **Advanced blend modes silently degrade to Normal on both GPU backends.** Overlay/HardLight/Difference/Invert
   map to `null`→Normal on gl and wgpu (`render-gl/src/glDraw.ts:185`, `render-wgpu/src/wgpuShader.ts:138`) —
   *wrong output, not a no-op*, so a design that looks right on Canvas looks flat-wrong on GPU with no diagnostic.
6. **Compressed textures (KTX2/DDS/Basis) are a mirage.** Five green-tested container parsers exist, but no
   transcoder and no compressed-GPU-upload path exists on any backend (`parseBasis.ts:20`) — a parsed `.ktx2`
   is a dead descriptor that never reaches a pixel.
7. **Materials/textures evaporate on import for OBJ/3DS/MD2/MD5, and glTF imports nothing textured or
   animated.** Five of six scene formats call `createMesh(geometry, [])` with an empty material array; OBJ's
   `materials` argument is dead code (`objParse.ts:287`); glTF never reads `primitive.material` or animation
   channels. AWD (the one good one) returns an empty scene for *compressed* files — Away3D's default export mode.
8. **There is no physics engine.** `physics2d`/`physics3d` are empty charters; `collision` returns an MTV but
   never resolves, integrates, or owns a world, and has no swept/TOI (fast movers tunnel) and no contact sets.
   "collision + spring + spatial" is detection, not dynamics — the user writes the entire solver.

---

## 2. Cross-cutting themes

These patterns recur across every area and matter more than any single gap.

### A. Visual-verification debt — "green but never rendered"
The single largest theme. **No GPU code path in this repo has been verified against real pixels here.** GL
tests use a mock context (`glTestHelper.ts:7`); wgpu has no in-sandbox execution at all. Real verification
lives only in committed `functional/baselines/*.json` fingerprints captured once on some GPU host, and the
regression tier is environment-coupled and non-reproducible in-sandbox. On top of that, whole feature classes
have **no functional/example coverage at all**: scene-format imports (no `createSceneFrom*` anywhere under
examples/functional), GPU skinning (no `*skin*` functional scene; the example exercises the CPU path),
streaming/compressed-texture/resource-resolution, glyph/bitmaptext (headless only ever draws stub white
boxes — `glyphatlas/status.md`), particle emitters, and camera2d view-matrix application
(`test-depth-review.md:126-128`). "Tests pass" systematically overstates readiness for anything GPU-rendered.

### B. WebGPU is a second-class citizen everywhere
wgpu lags gl in every domain audited: **no GPU skinning** (any material), **no ShadedMaterial renderer**, **no
custom-shader material or custom-shader effect**, **no 3D-particle renderer**, **no blend modes** (or only a
subset), **orthographic renders blank** (NDC-Z `[0,1]` vs `[-1,1]` remap missing), and **no `.webgpu.ts`
functional baseline** for any light/shadow/IBL/ortho scene — so the punctual-lighting parity that
`render-backend-support.md` gap #8 marks "DONE on both gl and wgpu" is claimed by inspection, never by
evidence. The "four co-equal backends" framing is false; treat wgpu as partial.

### C. Backend feature-parity is silently uneven for 2D too
Beyond wgpu: several 2D features that Canvas/DOM render are dropped on gl/wgpu — advanced **blend modes**
(wrong, not absent), **stroke joins** (miter/bevel/round undifferentiated), per-bitmap **smoothing** flag
(ignored; first-draw filter sticks via cached texture), **text strikethrough** (no branch). And the *reverse*
asymmetry: per-instance **ColorTransform tint** is gl/wgpu-only, drawing untinted on Canvas/DOM. **Sprite/
QuadBatch/Tilemap have no DOM renderer at all.** Every one of these is silent — the wrong output survives a
green run and a glance on one backend.

### D. Descriptor/header layer advertises features with no renderer behind them
The "header layer is the design surface" convention means many fully-formed types exist with no implementation,
reading as shipped: **area lights** (`AreaLightKind` + photometric helpers, but `SceneLights` has no `area`
field — unrenderable on any backend), **`InstancedMesh`/`LodMesh`** (typed, not exported from scene, no
renderer), **six effects** (autoExposure/barrelDistortion/contactShadows/filmEmulation/panniniProjection/
volumetricLight — descriptor+tests, zero realization files), **`ThreeDsMaterial`** (dead exported type). The
header promises breadth the renderers don't cover.

### E. Resource lifecycle: no unload, eviction, or refcount in the live path
Scene-resource streaming grows memory unbounded — cancel-on-drop only aborts in-flight loads; a *resolved*
`Texture.image` is never released (`resolveSceneResources.ts:65,103`). `assets` has the refcount/dedup/dispose
machinery but is wired to nothing (no package imports it but the barrel), ships no default adapters, and
`loadAssetGroup` silently swallows member failures. The exact large-world stream-in/stream-out use case the
resolver advertises is the one that leaks.

### F. glTF is geometry + skins only
The headline import format reads POSITION/NORMAL/TANGENT/TEXCOORD_0/indices + JOINTS_0/WEIGHTS_0. It drops:
materials/textures (never reads `primitive.material`), **all animation channels**, morph targets (facial
blendshapes vanish), sparse accessors, external `.bin`/image URIs (embedded base64 only), cameras,
`KHR_lights_punctual`, `COLOR_0`/`TEXCOORD_1`, `JOINTS_1`/`WEIGHTS_1` (>4 influences truncated), Draco/meshopt.
Most real-world glTF assets need exactly the parts that are absent.

### G. Simulation is detection, not dynamics; broadphase is a single Phase-1 backend
No physics solver anywhere. `collision` is discrete-overlap + MTV only — no swept/TOI (tunneling), no contact
sets, no 3D narrow-phase despite the "unified 2D+3D" charter. `spatial` ships only a uniform grid (quadtree/
sweep-and-prune unbuilt) and has **no persistent enter/stay/exit trigger events** — a bread-and-butter game
feature. Particle sim is CPU-only, and the 3D emitter runs its forces/collisions in 2D.

### H. Stale docs invert reality in both directions
Several docs actively mislead. `AGENTS.md` Feature Lookup says "OBJ/3DS/FBX — not implemented" (OBJ/3DS *are*
parsed) and "Particles (3D) — not implemented" (a GL renderer exists). Skeletal row claims "gl, wgpu" (GPU
skinning is gl-classic-only). `scene-formats` charter/review still say "stub 18/100". `shading/status.md`
reads "code NOT started" while the package + gl renderer are committed. A reader scoping work off these tables
is misled about what exists and what parity holds.

### I. Diagnostics gap: the silent-drop pattern has no guards
Nearly every SURPRISE above is silent — no warning, no `explain*`, no guard fires when materials evaporate,
blend modes degrade, skinning falls to bind pose, the affine-only adjustment fold drops saturation/hue, or an
effect is an unregistered passthrough. The inversion-rule guard layer that should catch these misuse-vs-
unsupported cases is largely unbuilt for the gaps that most need it.

---

## 3. By area

### 3D Model Import (`@flighthq/scene-formats`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Textured/material-bearing meshes from OBJ/3DS/MD2/MD5 | All call `createMesh(geometry, [])` — empty material array (`objParse.ts:287`, `md2Parse.ts:177`, `md5Parse.ts:229`, `threeDsParse.ts:350`); only AWD emits materials | all (parse) | SURPRISE |
| glTF import is comprehensive | Geometry + skins only; no materials/textures (never reads `primitive.material`), no animation channels, no sparse accessors, no external `.bin`/URIs, no cameras/lights/morph | all | SURPRISE |
| AWD (the good one) opens real files | Compressed AWD unsupported → returns empty scene (`awdParse.ts:85-90`); Away3D defaults to LZMA/deflate. Emitted textures `Unresolved`, `image:null`, never decoded | all | SURPRISE |
| OBJ+MTL attaches materials | `materials` param (`objParse.ts:23`) never read; MTL fully parsed into bespoke `ObjMaterial` that maps to nothing; `usemtl` is a no-op | all | SURPRISE |
| 3DS respects material + object placement | `MATERIAL`/`FACE_MATERIAL`/`TRANSFORM_MATRIX(0x4160)` defined in schema, never parsed → no materials, all meshes stack at origin; `ThreeDsMaterial` is dead | all | MAJOR |
| MD2 (animated Quake2) imports animation | Only frame 0 kept (`md2Parse.ts:20-21`); skin/texture paths not even modeled | all | MAJOR |
| Imports have ever been rendered | Zero example/functional coverage; skinned imports deform on gl only, wgpu unwired | gl/wgpu | MAJOR |
| MD5 texture available | `shader` name parsed then dropped; `.md5anim`→clip works but only via hand-wired `parseMd5Anim` | all | MINOR |
| USD/FBX/COLLADA/PLY/STL, Draco/meshopt, export direction | Absent; charter/map promise USD; all formats import-only | n/a | MINOR |

### Skeletal Animation & Skinning (`@flighthq/skeleton3d`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Skinned glTF/PBR character GPU-skins | `HAS_SKIN` only in classic prelude (`glClassicPrelude.ts:180`); PBR/toon/unlit/matcap/debug have no skin variant; glTF emits PBR → renders bind pose, no warning | gl (classic only) | SURPRISE |
| WebGPU skins skinned meshes | Zero skinning in scene-wgpu (grep → none); any material renders bind pose | wgpu | SURPRISE |
| GPU skinning is verified | No functional skin scene; example uses CPU `updateMeshSkin` + PBR (the path that can't GPU-skin); gl variant proven only by jsdom shader-string tests | gl (unverified) | SURPRISE |
| 2D skeletal animation (Spine/DragonBones) exists | `skeleton2d` is a charter with zero code; no `packages/skeleton2d` | n/a | SURPRISE/MAJOR |
| Feature Lookup "gl, wgpu" for skeletal | GPU skinning is gl-classic-only, absent on wgpu | — | MAJOR |
| Animated character culls/picks correctly | Skinned bounds stay bind-pose (AABB never recomputed); frustum cull + raycast test rest bounds → mis-cull/mis-pick | all | MAJOR |
| >64-joint rig works | Hard `GL_MAX_SKIN_JOINTS=64` cap (`glMeshProgram.ts:166`), no joint-count check/clamp/warn/CPU-fallback; Mixamo rigs run ~52-70 | gl | MAJOR |
| Morph targets / IK / blend trees / DQS | Phase 4 absent; glTF morph targets dropped on import; LBS-only (candy-wrapper collapse); no retargeting | all | MAJOR/MINOR |
| >4 influences | Fixed 4; glTF reads only JOINTS_0/WEIGHTS_0, JOINTS_1 dropped (renormalized, silent) | all | MINOR |

### Resource Loading, Streaming & Lifecycle

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| KTX2/Basis/DDS compressed textures render | Parsers only; no transcoder, no compressed GPU upload anywhere (`parseBasis.ts:20`); KTX2 Zstd/BasisLZ levels not inflated | none render | SURPRISE |
| Visibility streaming can stream a world in and out | No unload/evict/refcount/budget; resolved `Texture.image` never released (`resolveSceneResources.ts:65,103`); assets deferred to phase 2 | all | SURPRISE |
| The 6-format resource seam is general | Only AWD emits `SceneResourceRef`; glTF/OBJ/3DS/MD2/MD5 emit none → textured glTF loads untextured, no error | n/a | MAJOR |
| Image decoding works | Only `createImageBitmap`+`OffscreenCanvas` (web-only); tests stub it to a 1×1 — no real PNG/JPEG bytes ever decoded in CI | web only | MAJOR |
| `assets` is a wired pipeline | Ships no default adapters; imported by nothing but barrel; `loadAssetGroup` swallows member failures | n/a | MAJOR |
| Load path is GPU/visually verified | No functional/example exercises streaming/compressed/resolution; jsdom mocks stand in throughout | all | MAJOR |
| Byte-progress telemetry | `report.bytes` always 0 — `bytesLoaded` never incremented, `onBytesProgress` never invoked (`resourceLoader.ts:42,314,317`) | n/a | MINOR |
| AVIF routes by content sniff | `avif` in `webDecodableMimeTypes` but `detectImageMimeType` has no AVIF branch | n/a | MINOR |

### Render Backend Parity

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Renderer tests green ⇒ GPU works | GL tests use mock WebGL2 (`glTestHelper.ts:7`); no draw touches a driver; wgpu no in-sandbox exec; regression baselines env-coupled | gl/wgpu | SURPRISE |
| Orthographic camera on WebGPU | Renders blank — NDC-Z `[0,1]` vs `[-1,1]` remap missing; `camera-orthographic` scoped gl-only | wgpu | SURPRISE |
| Overlay/HardLight/Difference/Invert blend | Map to `null`→Normal on gl+wgpu (`glDraw.ts:185`, `wgpuShader.ts:138`) — silently wrong, not no-op | gl/wgpu | SURPRISE |
| Per-bitmap `smoothing` flag | Ignored on gl/wgpu; global filter, texture cached so first-draw filter sticks → pixel-art blurry | gl/wgpu | MAJOR |
| Stroke joins (miter/bevel/round) | Not differentiated on gl/wgpu (caps work); scoped canvas/dom | gl/wgpu | MAJOR |
| Per-instance ColorTransform tint | gl/wgpu-only; Canvas/DOM draw untinted (no color-transform renderer) — flash-on-hit/team-color silently fails | canvas/dom | MAJOR |
| Darken/Lighten (MIN/MAX) | Can't fold `(1-src.a)` on gl/wgpu → transparent surround darkens/clips backdrop at edges | gl/wgpu | MAJOR |
| Group/container `blendMode` | Whole-subtree flatten unverified/likely absent; no render-to-texture group-blend path found | all | MAJOR |
| Sprite/QuadBatch/Tilemap on DOM | No DOM renderer — renders nothing | dom | MAJOR |
| wgpu 2D-blend/ortho parity covered | `node-blend-modes`/`camera-orthographic` have no `.webgpu.ts` baseline | wgpu | MAJOR |
| Text strikethrough | No `strikethrough` branch in `glRichText.ts:170`/`wgpuRichText.ts:184` | gl/wgpu | MINOR |
| cacheAsBitmap out-of-frame; atlas pivot | Bakes in-frame on dom/wgpu; `TextureAtlasRegion.pivotX/Y` never read | dom/wgpu | MINOR |

### Materials, Shading, Effects & Adjustments

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| SSAO/SSR/TAA/motion-blur/fog work on GPU | Pipeline is color-only (no depth/normal/velocity/history); SSR/TAA = passthrough, SSAO/SMAA = crude single-pass, fog = screen-Y gradient proxy; baselines captured the stubs | gl/wgpu (canvas passthrough) | SURPRISE |
| All 51 effects render | 6 are descriptor-only — no realization file in effects-{gl,wgpu,canvas} (autoExposure/barrelDistortion/contactShadows/filmEmulation/panniniProjection/volumetricLight); return passthrough sentinel | all | SURPRISE |
| Canvas post-FX stack works | 31 of ~40 canvas effects are passthrough no-ops (`canvasSsaoEffect.ts:8` etc.); bevel/gradientBevel/gradientGlow/innerGlow/innerShadow have no canvas file despite Feature Lookup listing "canvas" | canvas | MAJOR |
| ShadedMaterial + modifiers cross-backend | gl-only (`shadedGlMeshMaterialRenderer`); scene-wgpu has no ShadedMaterial; `shading-globe` no `.webgpu.ts`; status.md stale "code NOT started" | gl only | MAJOR |
| customShader material/effect escape hatch on GPU | gl-only; no `customShader…Wgpu…`, no `wgpuCustomShaderEffect`; 3D particles gl-only too | gl only | MAJOR |
| Saturation/hue/sepia/channel-mix fold onto sprites | Inline GPU fold is affine-only; off-diagonal terms dropped unless re-routed as full-frame Effect (`colorAdjustmentResolution.ts:67`); guard is opt-in so drop is silent; no canvas inline fold | gl/wgpu partial, canvas none | MAJOR |
| Punctual lights/shadows verified on wgpu; ortho; area lights | Light/shadow scenes are `.webgl.ts` only (no wgpu baseline); ortho blank on wgpu; area lights descriptor-only, unwired | wgpu / all | MAJOR |

### Lighting & 3D Scene

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Area lights render | `SceneLights` has no `area` field (`SceneLights.ts:17-21`); `packSceneLightBlock` no area refs; grep across scene-gl/wgpu/render → nothing | none | SURPRISE |
| Point/spot lights cast shadows | Shadows directional-only, single ortho map, no cascades/CSM, no point/spot/cube (`shadowCamera.ts:14` sole export) | gl/wgpu (dir only) | SURPRISE |
| WebGPU 3D lighting/shadow/IBL/ortho works | No `.webgpu.ts` for light-point/spot/hemisphere/env-ibl/shadow-directional/camera-orthographic; symmetric to gl by inspection only | wgpu | SURPRISE |
| `InstancedMesh`/`LodMesh` ship | Header types only; no `create*`, not exported from scene barrel, no renderer consumes them | none | SURPRISE |
| Frustum culling is automatic | `cullSceneNodeByFrustum` exists but no renderer calls it (grep across render/scene-gl/wgpu → none); every mesh drawn every frame | gl/wgpu (manual) | MAJOR |
| Orthographic on WebGPU | Blank (NDC-Z remap missing); functional test gl-only | wgpu | MAJOR |
| Particles (3D) status | Map says "not implemented" but GL renderer exists; no wgpu twin; no functional test | gl only | MAJOR |
| IBL is production quality | Real split-sum but baked at "deliberately modest" software resolutions; wgpu unverified | gl (wgpu unverified) | MINOR |
| Photometric units are real | Lux/Candela anchored at arbitrary "100000 units = 1.0"; directional needs ~+1.5-+3 EV manual fudge | all | MINOR |

### Text & Glyph

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| RTL/bidi + grapheme-correct text | `textbidi`(UAX#9)/`textsegment`(UAX#29) wired into nothing; only barrel+types consume them; layout does no reorder/segmentation → Arabic renders in logical order | all | SURPRISE |
| Real shaping (ligatures/kerning/contextual forms) | Only advances-only `measureText`; `textshaper-canvas` has no `shapeRun`; no HarfBuzz/opentype backend | all | SURPRISE |
| MSDF/SDF fonts render crisp | Encoding + format codec parse `msdf`/`sdf` but no shader applies distance fields; sampled as raw RGB mush; `bitmaptext` never reads `encoding` | gl/wgpu, canvas | SURPRISE |
| Word wrap handles CJK/Thai | `\n`+ASCII-space only (`textLineBreaks.ts:28`, `textLayout.ts:215`); no UAX#14; CJK/Thai/ZWSP unhandled | all | MAJOR |
| BitmapText covered by regression suite | Headless rasterizer blank; stub backend draws identical boxes ("not a production text renderer", `glyphatlas/status.md`) — glyph shapes/packing/kerning never verified | gl/wgpu/headless | MAJOR |
| gl/wgpu text is GPU glyph/atlas rendering | Whole-label 2D-canvas rasterization uploaded as texture (`glTextLabel.ts:52-56`); DOM+font-load bound, no worker, re-rasterized on change | gl/wgpu | MAJOR |
| Strikethrough renders everywhere | gl/wgpu handle underline only | gl/wgpu | MINOR |
| NativeText is cross-backend | dom-only (`domNativeText.ts`); no canvas/gl/wgpu | dom | MINOR |
| bidi/segmentation are well-tested | `textbidi` flagged THIN (7+6 `it`s for full UAX#9); `textsegment` light (5/15/7) | n/a | MINOR |

### Animation, Simulation & Game Systems

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| collision+spring+spatial = physics | No solver/joints/integration; `physics2d`/`physics3d` empty charters (no package dir); collision returns MTV, doesn't resolve | n/a | SURPRISE |
| 3D particles (per map) / real 3D physics | Map says "not implemented" but sim node + GL renderer exist; no wgpu renderer; forces/collisions cast to 2D — only spawn vel + `gravityZ` touch z (`stepParticleEmitter3D.ts:21-30`) | gl only | SURPRISE |
| collision is a complete narrow-phase | Discrete-overlap + MTV only; no swept/TOI (fast movers tunnel), no contact sets, no capsule/concave, no 3D despite "unified 2D+3D" charter | headless | MAJOR |
| spatial: pick index, get trigger events | Uniform grid only (quadtree/sweep-and-prune unbuilt); no persistent enter/stay/exit pair tracking; no 3D backends | headless | MAJOR |
| GPU-backed animation renders correctly | Particles/spritesheet/movieclip/camera2d jsdom-only, never pixel-verified (`test-depth-review.md:126-128`); wgpu no blend + blank ortho | gl/wgpu | MAJOR |
| snapshot interpolate/restore robust | Different-shape, number↔non-number, dotted-path schema, extra-key restore untested — netcode/replay hits these | headless | MAJOR |
| Spritesheet seek is correct | `seekSpritesheetPlayerToFrame` broken for non-forward directions — ping-pong/reverse land wrong frame | canvas/gl/wgpu | MAJOR |
| Particle sim scales | CPU-only, single-threaded; no GPU sim (deferred to future compute-wgpu) | all | MINOR |
| tween/clock/easing edge cases | zero-duration tween div-by-zero, negative deltaTime/scale, smoothstep `edge0===edge1` untested | headless | MINOR |
| animation loop modes/perf | Linear scan restarts index 0 each call (no binary search); loop is a boolean (no ping-pong/finite repeat) | headless | MINOR |

---

## 4. Recommended sequencing

To close the highest-bite gaps, in order. Rationale: establish trust in verification first, then fix the
silent-wrong cases, then fill the biggest capability holes.

1. **Establish real GPU visual verification (Theme A).** Stand up a browser-capable capture path (or a
   documented external host loop) so functional baselines can actually be re-captured and trusted. Until this
   exists, every fix below is unverifiable and every "green" claim is suspect. This is the force multiplier —
   it converts inspection-only claims into evidence across skinning, lighting, effects, blend modes, text.

2. **Fix the silent-wrong output cases (no new features, just correctness + diagnostics).** These make Canvas-
   correct designs look broken on GPU with no warning: advanced blend modes → Normal (gl/wgpu), per-bitmap
   smoothing ignored, stroke joins undifferentiated, ColorTransform tint untinted on Canvas/DOM, affine-only
   adjustment fold dropping saturation/hue. Where a true fix is large, at minimum add the guard-layer warnings
   (Theme I) so the drop stops being silent.

3. **Close the WebGPU parity gaps that are outright broken (Theme B).** Orthographic-blank (NDC-Z remap) is a
   black-screen; then wgpu blend modes, then wgpu GPU skinning + ShadedMaterial + custom-shader + 3D particles.
   Add `.webgpu.ts` functional baselines for every light/shadow/IBL/ortho scene so parity is evidenced.

4. **Make skinned characters actually deform on the GPU (Exec #3).** Add `HAS_SKIN` to the PBR (and toon/unlit)
   preludes on gl, add wgpu skinning, recompute skinned bounds so culling/picking work, and add a >64-joint
   guard/fallback. Ship a functional skin scene that exercises the GPU path, not the CPU crutch.

5. **Wire the effect G-buffer (Theme, Exec #2).** Feed depth/normal/velocity/history buffers so SSAO/SSR/TAA/
   motion-blur/fog stop being placeholders. This unblocks the largest "looks AAA, does nothing" cluster. Then
   register or clearly de-list the 6 descriptor-only effects and the 31 canvas no-ops.

6. **Complete glTF import (Themes F/H).** Materials/textures + animation channels are what real assets need;
   this also makes the resource-ref seam more than AWD-only. Then fix the other importers' empty material
   arrays and 3DS object transforms. Reconcile the stale `AGENTS.md` Feature Lookup rows in the same pass.

7. **Resource lifecycle (Theme E).** Add refcount/unload/eviction to the streaming path and wire `assets` in
   with default adapters + surfaced group-load failures, so streaming stops leaking. Provide at least one
   compressed-texture transcode+upload path (or de-advertise KTX2/Basis as "parse-only").

8. **Text i18n pipeline (Exec #4).** Wire `textbidi`/`textsegment` into layout, add a real shaping backend and
   an MSDF shader, and implement UAX #14 line breaking. Large, but non-Latin text is broken today, not merely
   unstyled.

9. **Physics + simulation depth (Theme G, Exec #8).** Longest lead time and clearly-unbuilt, so last: a
   rigid-body solver over `collision` (add swept/TOI + contact sets first), quadtree/sweep broadphase, and
   persistent trigger events in `spatial`. Fix the 3D particle emitter to run true 3D forces or clearly scope
   it as planar.
