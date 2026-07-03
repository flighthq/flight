---
package: '@flighthq/scene-gl'
crate: flighthq-scene-gl
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# scene-gl — Charter


## What it is

WebGL2 forward renderer for the 3D scene graph — the per-subject leaf renderer in the `<subject>-<backend>` layering that turns a `SceneNode` tree of `Mesh`es into draw calls over `render-gl`. It owns the mesh-material program/shader library that a real-time 3D engine's GL backend is expected to provide: a single GLSL 300 es PBR uber-shader (Cook-Torrance GGX, seven glTF extension lobes) specialized by a `#define` block, plus classic (lambert/phong/blinn-phong), stylized (toon/matcap), attribute (vertex-color/emissive), and debug (normal/depth/wireframe) families — twenty material renderers in all, registered opt-in per render state.

It ends where the substrate begins: `render-gl` owns GPU plumbing (state, targets, fullscreen/surface, the GL context), `render` owns the backend-agnostic update pipeline and `prepareSceneRender`, and `@flighthq/types` owns every cross-package type (`Material`, `MeshSubset`, `SceneLights`, `GlMeshMaterialRenderer`). scene-gl is the GL leaf that binds those together into a forward draw. Its peer is `scene-wgpu` — the same subject over a different backend core. It is **not** the 3D scene graph itself (that is `scene`), nor the data primitives (`mesh`, `texture`, `lighting`, `camera`).

## North star

_Proposed principles inferred from the design + the structural forks. Confirm or rewrite before these become the rubric._

- **One uber-shader, specialized by define keys — not a switch.** The PBR path is a single source string `#ifdef`-branched into distinct cached programs keyed by an order-independent define string. Distinct flag sets produce distinct programs; the standard path stays byte-for-byte unchanged when no extension flag is set. New surface features arrive as define lobes and key bits, not as forked shaders or a growing branch.
- **Open registry over closed switch (fork B).** Material families register opt-in via per-family `register*GlMaterial(state)` into a per-state `Map<Kind, …>`; nothing auto-registers at import. The hot draw loop resolves through a `Map` lookup hoisted out of the inner work (renderer+material bound once across contiguous runs), so the registry costs nothing in the loop. This is the renderer- registration core pattern and structural fork B applied to mesh materials.
- **A shared lit-light spine keeps CPU upload and GLSL in lockstep.** `bindGlMeshLightBlock`, `resolveGlLitLocations`, and `GL_MESH_LIGHT_BLOCK_GLSL` are one place light data reaches GL across every lit family — the light declaration and its upload never drift.
- **Per-state runtime, no module singletons.** Registry, program cache, geometry-upload `WeakMap`, and draw lists live on `GlSceneRuntime` reached through the opaque header slot, allocated lazily on first use. Two render states never share mutable draw state.
- **Linear HDR out, tonemap owned downstream.** The forward pass writes linear radiance into the rgba16f scene target; exposure/tonemap is a downstream concern, keeping this package's output a clean physically-linear signal.

## Boundaries

_Proposed scope lines drawn from the review and neighbors. Confirm before treating as fixed._

In scope:

- The GL forward draw: partition → opaque pass → back-to-front-sorted blended pass, with a contiguous-run bind cache.
- The mesh-material program/shader library (PBR uber-shader + extension lobes + classic/stylized/ attribute/debug families) and its define-key program cache.
- GL-side geometry upload (`glMeshUpload`, including reserved `joints0`/`weights0` skinning channels and the `uv1` set) and the wireframe upload path.
- The per-state runtime that holds the registry, caches, and draw lists.

Out of scope (owned elsewhere):

- The 3D scene graph and node hierarchy (`scene`), and the data primitives `mesh` / `texture` / `lighting` / `camera`.
- GPU plumbing — context, targets, fullscreen/surface, state — owned by `render-gl`; the update pipeline and `prepareSceneRender`, owned by `render`.
- Cross-package type definitions, owned by `@flighthq/types`.
- The wgpu backend (`scene-wgpu`) and the Canvas2D/DOM substrates (which do not exist for 3D).

Open at the boundary (see Open directions): the multi-light model, IBL/shadow/skinning scope, and GPU teardown ownership all straddle the line between this package and `types`/`render`/`render-gl`.

## Decisions

- **2026-07-02 — G-buffer infrastructure (depth + velocity) in scope.**
- **2026-07-02 — Multi-light: MAX count with runtime guard.**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — TS-leads, Rust conforms later.**

## Open directions

Every candidate question the review surfaced, plus the structural forks that touch this package. These are where an agent should **ask**, not assume.

- **Lighting model bound (highest leverage).** The forward path carries at most one directional + one ambient light — no point/spot/hemisphere, no attenuation. Is this a temporary state or a deliberate tier-1 boundary? Multi-light requires a `SceneLights`/`SceneLightBlock` redesign (`MAX_FORWARD_LIGHTS`, point/spot arrays, attenuation, an N-light loop) that is a cross-package coordination with `types` / `render` / `scene-wgpu` / Rust — a design fork, not within-package work. (Touches fork A: where light source-data lives vs. its consumption here.)
- **GPU teardown ownership (correctness/leak gap).** The package creates `WebGLProgram`s, VAOs, and vertex/index buffers but exposes no `destroy*`. The codebase-map rule says a GPU backend that allocates owes a `destroy*`. Where does it live — scene-gl per family, a single `destroyGlScene*` over `GlSceneRuntime`, or delegated to `render-gl`'s state destroy? The runtime only gestures at "a future destroy path"; the charter should rule.
- **Pool semantics.** The draw-entry "pool" does not actually recycle — after frame 1 it allocates fresh entries every frame, and there is no `release*` to match `acquire*`. Either make it a real `acquire*`/`release*` bracket that recycles, or drop the pool for plain per-frame arrays (entries are cheap). The current half-state is the worst of both and the "pool" name implies a contract the code does not honor.
- **scene-wgpu parity as a stated boundary.** Every scene-gl feature (uv1, HAS_UV1, the transparency sort) lands on the wgpu parity-gap list. Is "scene-gl leads, scene-wgpu follows" a blessed boundary, or should new features land in both backends together? The status flags this as a standing risk.
- **IBL / shadow / skinning scope and sequencing (fork G).** Fork G (2026-06-24) accepts full 3D as in-scope and makes `scene` a priority build-out. The charter should state which of IBL (no cubemap/ prefiltered env/BRDF LUT today), shadow mapping (none), and GPU skinning (groundwork only — `joints0`/`weights0` reserved, no `SKINNED` define or joint-palette UBO) are scene-gl's responsibility and in what order, since each is a large cross-package move. Note the 3D-is-strictly-additive constraint: nothing here may move a 2D example's `npm run size` baseline.
- **Extension-map flags in the cache key.** Extension lobe _maps_ (clearcoat/sheen/etc. textures) are bound-when-present but not part of the define key. Is the uniform-fallback behavior the intended end state, or should per-extension map flags eventually enter the key?
- **`hasUv1` material-time vs. `uv1` geometry-time mismatch.** `hasGlMeshGeometryUv1` now exists but is not yet wired into `standardPbrGlMeshMaterialRenderer.bind()` (geometry is not available at `bind()`). Safe today (an unbound attribute reads zero) but the define key and bound attributes can disagree. Resolve where the geometry signal reaches the material renderer.
- **Transmission completion.** Transmission is a placeholder (no opaque-scene-color capture pass; refraction approximated as translucency, `TODO Phase 5`). Confirm the intended end state and where the scene-color capture pass would live.
- **UBO for the light/per-object block.** Lights upload as individual `uniform*` calls; the normal matrix is the lone non-square per-draw matrix. Is a std140 UBO refactor in scope, and does it couple to the multi-light redesign?
- **Wasm mixing (fork D).** scene-gl is a stateful graph/runtime package (per-state runtime, shared draw state) — confirm it is correctly treated as all-or-nothing (not a value-typed wasm-mixable leaf), so it is never proposed as a `-rs` drop-in.
