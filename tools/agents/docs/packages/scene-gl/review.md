---
package: '@flighthq/scene-gl'
status: solid
score: 74
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# scene-gl — Review

> Survey layer. Evidence is the incoming bundle `builder-67dc46d64` (`head/packages/scene-gl/`
>
> - `changes.patch`). No prior `reviews/depth/scene-gl.md` existed, so this is the first survey; the charter is a seeded stub (only "What it is" filled, North star / Boundaries / Decisions / Open directions all `TODO`), so the package is judged against the codebase-map AAA standard for a real-time WebGL2 forward 3D renderer, with every charter silence flagged as a candidate Open direction below.

## Verdict

`solid` — 74/100. A genuinely broad, well-factored WebGL2 forward renderer: one PBR uber-shader with seven glTF extension lobes, twenty registered mesh-material families across PBR / classic / stylized / debug, a clean per-state registry, a shared lit-light spine, and now a correct two-pass opaque/blended transparency sort. It is past stub and well into a real library. It is held back from `authoritative` by three things: a **forward lighting model capped at one directional + one ambient light** (the single largest functional gap — no point/spot/hemisphere, no shadows, no IBL), a **non-functional draw-entry "pool"** that allocates fresh every frame (the pass-2 isolation work is correct on ownership but the pool never recycles), and the **absence of any `destroy*` teardown** for the GPU programs / VAOs / buffers this package creates.

## Status-doc verification (as-claimed → verified)

Every claim in `status.md` was checked against `changes.patch` and the head source. All verify:

- **Two-pass transparency sort** (`drawGlScene.ts:47-159`) — confirmed. Pass 1 draws `opaque`/`mask` subsets in scene order with no blend; pass 2 sorts `blend` subsets back-to-front by clip-space W (`compareBlendedEntriesDescending`, descending W) and enables `SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA`, disabling after. The W computation reads the world translation from matrix column 3 (`m[12..14]`) and dots it with VP row 3 — correct.
- **Per-state pool isolation** — confirmed. `GlSceneRuntime` carries `blendedDrawList`, `blendedPool`, `opaqueDrawList`, `opaquePool` (`glSceneRuntime.ts:29-38`); `drawGlScene` reads them via `getGlSceneRuntime` rather than module-level singletons; the new test `gives each render state its own draw-entry pools, not shared singletons` exists (`glSceneRuntime.test.ts`).
- **`GlSceneDrawEntry` exported with `object` fields** — confirmed (`glSceneRuntime.ts:9-17`); the draw path casts to the private `DrawEntry` alias (`drawGlScene.ts:183-191`) for typed access.
- **`hasGlMeshGeometryUv1` helper + `uv1`/`joints0`/`weights0` attribute locations** — confirmed in `glMeshUpload.ts`; three new colocated tests present.
- **`hasUv1` define key + `HAS_UV1` shader path** — confirmed (`glPbrPrelude.ts:45,65,87,128-130, 140-142,150-152,164-166,343-347`); the occlusion sample routes through `v_uv1` under `HAS_UV1`, the canonical glTF TEXCOORD_1 placement.
- **`buildGlPbrStandardDefineKey(…, hasUv1 = false)` third param** and the `makeKey` test fix — confirmed via patch.
- **`mesh-blend-transparency` functional test** — confirmed (`tests/functional/mesh-blend-transparency/` with `app.ts` + `render.webgl.ts`, WebGL-only). The status's own note that the **baseline is not yet captured** is accurate and remains the one open action item from the pass.

The status doc is an honest, accurate merge; nothing in it is overstated.

## Present capabilities

- **Two-pass forward draw** (`drawGlScene`): partition → opaque pass → sorted blended pass, with a contiguous-run bind cache (`boundRenderer`/`boundMaterial`) so a shared renderer+material binds once across consecutive subsets. Idempotent `prepareSceneRender` consumed from `@flighthq/render`.
- **PBR uber-shader** (`glPbrPrelude.ts`): GLSL 300 es Cook-Torrance (GGX / Smith height-correlated visibility / Fresnel-Schlick), one source string specialized by a prepended `#define` block. Map flags (base-color, normal, metallic-roughness, occlusion, emissive) + alpha-mask + `hasUv1` + seven extension lobes (clearcoat, sheen, anisotropy, iridescence, specular, subsurface, transmission), all `#ifdef` branches of one shader. Outputs linear HDR radiance into the rgba16f scene target; tonemap owned downstream.
- **Define-key program cache** (`buildGlPbrDefineKey` / `buildGlPbrDefineSource`, `glPbrProgramCache.ts`): order-independent stable string key, distinct flag sets → distinct cached programs. The standard PBR path is byte-for-byte unchanged when no extension flag is set.
- **Twenty material families** registered via per-family `register*GlMaterial(state)` opt-in functions: the PBR family (`standardPbr` + 8 extension variants incl. `specularGlossiness`, `transmissionVolume`), classic (`lambert`, `phong`, `blinnPhong`), stylized (`toon`, `matcap`), attribute (`vertexColor`, `emissive`), and debug (`normal`, `depth`, `wireframe`). This is real AAA breadth for material coverage.
- **Open registry, not a switch** (`glMeshMaterialRegistry.ts`): `registerGlMeshMaterialRenderer` / `resolveGlMeshMaterialRenderer` over a per-state `Map<Kind, …>` with a `DefaultMaterialKind` fallback and no built-in auto-registration. Satisfies structural fork B (registry by default) and the renderer-registration core pattern cleanly.
- **Shared lit-light spine** (`glLitProgram.ts`): `GlLitProgram` base interface, `bindGlMeshLightBlock`, `resolveGlLitLocations`, and `GL_MESH_LIGHT_BLOCK_GLSL` keep the CPU upload and the GLSL declaration in lockstep — one place light data reaches GL across all lit families.
- **Per-state runtime** (`glSceneRuntime.ts`): registry, program cache, geometry upload `WeakMap`, `activeMeshProgram` bind→draw handoff, and the draw-entry pools/lists — surfaced through the header's opaque `GlRenderStateRuntime` slots. Lazy, allocated on first `getGlSceneRuntime`.
- **Geometry upload** (`glMeshUpload.ts`): `ATTRIBUTE_LOCATION` with version-gated re-upload, including reserved `joints0`/`weights0` skinning channels and the `uv1` set.
- **Wireframe upload path** (`glWireframeUpload.ts`) for the debug family.

## Gaps

What a mature WebGL2 forward 3D renderer has that this one lacks:

1. **Multi-light forward path (highest leverage).** The light block carries at most \*\*one directional
   - one ambient\*\* (`bindGlMeshLightBlock`, `glLitProgram.ts:25-36`; `u_directionalCount`/ `u_ambientCount` are 0/1 gates). No point lights, no spot lights, no hemisphere light (the type is already defined upstream but unconsumable here), no per-light attenuation. A real forward renderer carries an N-light loop (`MAX_FORWARD_LIGHTS`). The status correctly flags this as cross-package (types / render / scene-gl / scene-wgpu / Rust) and not landable unilaterally.
2. **No `destroy*` teardown.** The package creates `WebGLProgram`s (program cache), VAOs, vertex/index buffers (`GlMeshUpload`) — non-GC GPU resources — but exposes **no** `destroyGlScene*` / `destroyGlMeshUpload*` to free them. `glSceneRuntime.ts:71-72` only _gestures_ at "a future destroy path." Per the codebase-map teardown rule, a GPU backend that allocates framebuffers/textures/ buffers owes a `destroy*`. This is a correctness/leak gap, not just polish.
3. **The draw-entry "pool" does not pool.** `acquireOpaqueEntry`/`acquireBlendedEntry` `pop()` from `opaquePool`/`blendedPool`, but entries are pushed into the _draw lists_, never released back to the pools (`drawGlScene.ts:62-101`). After frame 1 the pools are empty and every subsequent frame allocates fresh entries via `createDrawEntry()` (each allocating two `Matrix4`s). `*.length = 0` on the draw lists clears references without recycling. The per-state ownership refactor is correct, but the recycling it was meant to protect is absent — there is no `acquire*`/`release*` bracket, so naming it a pool is misleading.
4. **IBL / environment lighting** — none. Ambient is flat irradiance over diffuse albedo only (`glPbrPrelude.ts:432-435`, comment: "no IBL specular yet"). No cubemap/prefiltered environment, no BRDF LUT.
5. **Shadow mapping** — none. No depth pre-pass, no PCF, no shadow descriptor consumption.
6. **GPU skinning / morph targets / instancing** — groundwork only: `joints0`/`weights0` locations are reserved but there is no `SKINNED` define, joint-palette UBO, or per-instance path.
7. **Transmission is a placeholder** (`glPbrPrelude.ts:444-451`): no opaque-scene-color capture pass, so refraction is approximated as translucency with an explicit `TODO Phase 5`.
8. **`hasUv1` is material-time, but `uv1` presence is geometry-time** — the helper to close this (`hasGlMeshGeometryUv1`) now exists but is **not yet wired** into `standardPbrGlMeshMaterialRenderer.bind()` (geometry is not available at `bind()`). Safe today (an unbound attribute reads zero), but the define key and bound attributes can disagree.
9. **No UBO for the light/per-object block** — lights upload as individual `uniform*` calls; the normal matrix is the lone non-square per-draw matrix (a std140 refactor concern the status flags).

## Charter contradictions

None — the charter's only authored section is "What it is," and the package matches it precisely (a WebGL2 forward leaf renderer over `render-gl` with a PBR uber-shader + classic/stylized/debug families). North star, Boundaries, and Decisions are all `TODO`, so there is no stated principle to contradict. Every substantive judgement below the "What it is" line is therefore a candidate Open direction, not a contradiction.

## Contract & docs fit

**Lives up to the contract:**

- **Types-first.** Cross-package types (`GlMeshMaterialRenderer`, `SceneRenderProxy`, `SceneLights`, `SceneLightBlock`, `Material`, `MeshSubset`) come from `@flighthq/types`; scene-gl defines only its own internal program/runtime interfaces. `GlSceneDrawEntry` is deliberately typed with `object` fields to keep the runtime header free of scene-gl-internal imports — a correct application of the entity/runtime-slot pattern.
- **Single root export, `sideEffects: false`** (`package.json`), thin `index.ts` barrel, no per-file subpaths. No top-level `registerRenderer` — registration is opt-in via `register*` functions.
- **Open registry over closed switch** — satisfies fork B; the hot loop dispatches via a `Map` lookup hoisted out of the per-subset inner work (bind cached across contiguous runs), so the registry costs nothing in the loop.
- **Full unabbreviated names** throughout (`registerStandardPbrGlMaterial`, `resolveGlMeshMaterialRenderer`, `bindGlMeshLightBlock`). `get*`/`has*`/`is*` prefixes used correctly. Out-param aliasing respected (`setMatrix3NormalFromMatrix4` into a scratch).
- **Rust mirror** — charter front matter declares `crate: flighthq-scene-gl`; the Rust map lists `scene-gl` as a real ported subject-backend crate. Consistent.

**Contract / docs fit issues (candidate revisions, the user's gate):**

- **Teardown convention is unmet** (gap 2): the design-constraint rule "a GPU backend owes `destroy*`" is currently unsatisfied. Either the package needs a `destroy*` path or the charter should record an explicit decision about who owns GPU-resource teardown for scene render state (likely `render-gl`).
- **"Pool" naming without `acquire`/`release` brackets** (gap 3) is slightly at odds with the geometry- ownership convention, which reserves `acquire*`/`release*` for _paired_ pool brackets. The current `acquireOpaqueEntry` has no matching `release`, so the name implies a contract the code does not honor.
- **Package Map line for `@flighthq/scene`** in `tools/agents/docs/index.md` still reads "A doorway for future development; the road is mostly untaken and the package is not yet built out." Structural fork G (2026-06-24) promotes 3D to first-class in-scope and makes `scene` a priority build-out; the map's Package Map has no `scene-gl` / `scene-wgpu` entry at all despite this being a real, broad package. Candidate revision: add a Package Map line for the `scene-<backend>` family and update the `scene` line to reflect the fork-G decision.
- **`render-backend-support.md`** notes "punctual lights unwired" generically; it does not yet record the scene-gl-specific single-directional+ambient cap or the transparency-sort being GL-only (wgpu unsorted). Candidate addition.

## Candidate open directions

These are the charter silences this review had to assume past; each should feed the charter's Open directions for the user to settle:

1. **Lighting model bound.** Is the one-directional+one-ambient cap a temporary state or a deliberate tier-1 boundary? If multi-light is in scope, the `SceneLights`/`SceneLightBlock` redesign (`MAX_FORWARD_LIGHTS`, point/spot arrays, attenuation) is a cross-package coordination with types / render / scene-wgpu / Rust — a design fork, not within-package work.
2. **GPU teardown ownership.** Where does `destroy*` for scene programs/VAOs/buffers live — in scene-gl per family, or a single `destroyGlScene*` over `GlSceneRuntime`, or delegated to `render-gl`'s state destroy? The runtime already gestures at it; the charter should rule.
3. **Pool semantics.** Should the draw-entry pool actually recycle (add a `release*` after each pass), or should the "pool" be dropped in favor of plain per-frame arrays (entries are cheap)? Either is defensible; the current half-state is the worst of both.
4. **scene-wgpu parity as a stated boundary.** Every scene-gl feature (uv1, HAS_UV1, transparency sort) lands on the wgpu parity-gap list. Is "scene-gl leads, scene-wgpu follows" a blessed boundary, or should new features land in both backends together? The status flags this as a standing risk.
5. **Extension-map flags in the cache key.** Extension lobe _maps_ (clearcoat/sheen/etc. textures) are bound-when-present but not part of the define key (`glPbrPrelude.ts:32-33`). Is the uniform-fallback behavior the intended end state, or should per-extension map flags eventually enter the key?
6. **IBL / shadow / skinning scope and sequencing.** Fork G accepts full 3D as in-scope; the charter should state which of IBL, shadow mapping, and GPU skinning are scene-gl's responsibility and in what order, since each is a large cross-package move.
