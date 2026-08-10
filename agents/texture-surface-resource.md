# Texture / Surface / Resource

**Working design — Texture model SHIPPED through Scene2D (attested 2026-07-28); backing decomposition CHARTERED, not started.** The load-bearing calls below are **decided** and are the spec the migration implements against. See [Remaining open questions](#remaining-open-questions) for what is still live. This supersedes the earlier "add a `RenderTexture` type as a `VideoTexture` sibling" and "`Texture` base + `ImageTexture` rename" sketches (see [What this dissolves](#what-this-dissolves-and-why)).

> **Read this first — the one idea.** The honest seam is the **resource layer**, not the texture *type*. A texture has a **CPU side** — a *backing* (`ImageResource`: bytes, compressed bytes, or an opaque host handle), a context-neutral field — and a **GPU side** — a backend handle, context-bound, reached through `resolveTexture(state, texture)` and cached in the state, **never a field**. That asymmetry *is* the ownership model. Everything else — dimensionality, render targets, video, loading, foreign handles — hangs off that split. There is **one** public `Texture` type; "which kind" is expressed by data (`storage.dimension`, backing family), never by subtypes.

## The vocabulary

Four nouns, one per role. **"Source" is rejected as a *layer* name** — it names provenance, true for the loaded case and misleading for procedural and rendered content. (The word survives where it legitimately means a drawable or a generator — `RandomSource`; the ban is on a `TextureSource` *layer type*.)

| word | role | what it is | Skia analogue |
|---|---|---|---|
| **`Bitmap`** | CPU pixels | pixels you own and manipulate — `floodFill`, blur, `getBitmapPixel`. Mutable; the pixel API is **total** on it. Ports to `bitmap-rs`. | `SkBitmap` |
| **`ImageResource`** | loaded asset | a flat, immutable, ready-to-draw asset (an opaque `HostImageSource`). Drawable, **not** pixel-readable. | `SkImage` |
| **`Surface`** | backend realization | **reserved** — the backend-realized drawable handle (canvas / cairo / skia). Not yet a type; see below. | `SkSurface` |
| **`Texture`** | the unifying descriptor | substrate-neutral: `storage` + sampling + `version`. **Not** a GPU handle — it *resolves* to one per render state. | — |

Pipeline: a **loader** fills a backing (`ImageResource` / `Bitmap` / compressed) → held by `Texture.storage` → **resolved** per render state to a realization (a `WebGLTexture` on GPU, a `Surface` on software).

### `Surface` → `Bitmap`, and `Surface` reserved

Flight's `Surface` historically meant *raw bytes*, which collides with the whole rest of the graphics world: in Skia and Cairo a **surface is a drawable target**, not a pixel buffer. Dissolving the `Bitmap` scene node (see [Scene2D realignment](#scene2d-realignment-approved-2026-07-28)) freed the correct word, so:

- **`Surface` → `Bitmap`** for the pixel-manipulation layer. `@flighthq/surface` → `@flighthq/bitmap`; 43 files, 103 exported functions, 23 pixel-layer `Surface*` types; the separate `surface-rs` → `bitmap-rs` crate rename is pending and coordinated in `flight-rs`. Mechanical, and pre-release so there are no consumers.
- **`Surface` is reserved, not introduced.** The software-realized drawable handle is real but currently anonymous — it lives as `target.canvas` inside `CanvasRenderTarget` and as the bytes→canvas transcode result. Reserving the word costs nothing and prevents re-squatting; the *type* should arrive when a backend or the cairo/skia port genuinely demands it, not be speculated into existence now.
- **`Surface` is a per-backend realization, NOT a package.** It is implemented by whatever system draws — canvas today, cairo or skia in a native port — so it lives inside each backend package (`scene2d-canvas`, a future `scene2d-cairo`, …), the way `GlRenderTarget` lives in the GL backend. The freed `@flighthq/surface` package name is **retired, not recycled**: do not create an `@flighthq/surface` package for this concept.

This rename is not a relabel — it **names a previously unnameable concept**. The realization matrix below had an empty cell, and `Surface` fills it.

### `Surface` vs `RenderTarget` — keep these distinct

`RenderTarget` already exists (`RenderTargetDescriptor`, plus `Canvas`/`Gl`/`Wgpu` variants). The split, so the reserved word does not become a second name for the same thing:

- **`RenderTargetDescriptor`** = *what you asked for* — width, height, format, MSAA, depth. Substrate-neutral data.
- **`Surface`** = the **software realization** of it (canvas / cairo surface / `SkSurface`).
- **GL framebuffer + texture** = the **hardware realization**.

One descriptor, two realizations.

### Realization cost matrix

What each backing costs to realize on each substrate. This is why the resolvers are shaped the way they are:

| backing | → software (canvas) | → GPU |
|---|---|---|
| **`Bitmap`** (bytes) | **transcode to a canvas** ← the only allocating cell | `texImage2D(bytes)` — native |
| **`ImageResource`** | direct — it *is* drawable | `texImage2D(element)` — native |
| **compressed** | ✗ not drawable | native compressed upload |
| **`RenderTexture`** | it *is* a canvas | it *is* a framebuffer texture |
| **external** | n/a | the caller's handle |

Exactly one cell is expensive — **bytes → software** — which is the whole reason the transcode, its cache, and its separate registration exist.

### Known residual ambiguities (accepted)

- **`beginBitmapFill` took a `Texture`, not a `Bitmap`** — it is now `beginTextureFill`. The rename is a clarity gain because “bitmap fill” now means CPU pixels.
- **`createBitmap` previously meant the scene node constructor.** The new one allocates pixels. Pre-release, so acceptable — but it will confuse anyone reading git history.
- **"Surface" also means the *shading* surface** in `scene3d-gl` (`bindGlUnlitSurface`). Different domain (3D shading vs 2D raster targets); accepted rather than churning the material layer. The nine `bind*Surface` functions across `scene3d-gl`/`scene3d-wgpu` are all shading and deliberately **did not** rename.
- **DOM `ImageBitmap` now sounds like Flight `Bitmap`.** `createImageResourceFromBitmap` (Flight's CPU pixel type) sits one word away from `createImageResourceFromImageBitmap` (the DOM `ImageBitmap`), both in `@flighthq/image`. A real discoverability hazard created by this rename. Accepted for now since both names are individually accurate; revisit if it bites.

## The Texture shape

```ts
interface Texture extends Entity {
  storage: TextureStorage;   // dimension (closed enum) × backing (open registry)
  sampler: Sampler;          // wrap / filter / anisotropy — applied AT DRAW, off the key
  colorSpace: TextureColorSpace;
  // uv-transform (KHR_texture_transform): uvOffset / uvScale / uvRotation / flipX / flipY
  version: number;           // integer dirty-bit; drives re-resolve. NOT the cache key (identity is).
}
```

A minimal **evolution** of today's `Texture`: `image → storage.image`, add `version`, drop the `resource` field (loading moves to the Resource layer). `sampler` / `colorSpace` / uv stay. **`Texture` carries no runtime state** — all GPU state is render-state-keyed by the backing, so the entity's runtime companion is empty (a plain shared reference; see [Portability](#portability-requirements-cc-rust-port)).

## TextureStorage — dimension × backing, two orthogonal axes

`dimension` is the **shape**; the backing is **what fills it**. They compose: a cube env-map render target is `dimension: 'cube'` + a produced backing. Collapsing them was the main correction over the first draft — it structurally forbids cube env-map targets, array shadow cascades, and volumetric targets, all real.

**The two axes are different kinds of thing, and lower differently:**

- **`dimension` (`'2d' | 'cube' | '2d-array' | '3d'`) is a CLOSED enum.** Users never invent a texture dimensionality; it is hardware-defined. An exhaustive `switch` is correct here (the one place a closed union beats a registry).
- **The backing is an OPEN registry.** `resolveTexture` dispatches through a state-scoped resolver registry keyed by backing — so a still-image bundle never drags the video/produced/external realizers (the AGENTS.md open-registry rule; the tree-shaking guarantee lives or dies here). Users can register vendor backings.

```ts
// Illustrative — the exact target? placement is an open encoding question (see Remaining open).
type TextureStorage =
  | { dimension: '2d';       image:    ImageResource | null;                      target?: RenderTargetDescriptor }
  | { dimension: 'cube';     images:   readonly [ImageResource, …×6] | null;      target?: RenderTargetDescriptor }
  | { dimension: '2d-array'; images:   readonly ImageResource[] | null;           target?: RenderTargetDescriptor }
  | { dimension: '3d';       volume:   TextureVolume | null;                       target?: RenderTargetDescriptor };
```

- **The CPU-side field is `image: ImageResource | null`.** As shipped, `ImageResource` is still the multi-representation CPU backing (`data` bytes ∪ `compressed` ∪ a host handle, + `version`), and the pixel type is its bytes-guaranteed narrowing. The field is named `image` because it matches the actual type — naming it for one representation would be exactly the name↔type drift we are avoiding. The [backing decomposition](#next-decompose-the-backing-chartered-2026-07-28-not-started) splits this into sibling `ImageResource` / `Bitmap` / compressed backings.
- **The CPU pixel type is inherently 2D — and that is principled.** The software backend (canvas) is inherently 2D; it cannot sample a volume/cube/array, so non-2D textures are hardware-only by nature. A `3d` texture's CPU backing is a `TextureVolume` (bytes + `PixelFormat`, mirroring `ImageResource` — **not** `ArrayBufferView`); cube/array are `ImageResource[]`.

## The two backing families: CPU-origin vs GPU-origin

This replaces the first draft's "surface-present vs produced" binary, which missed compressed textures and foreign handles. The backing registry splits cleanly in two, and the split *is* the resolve/ownership rule:

| family | backings | resolve | cache key | portable across contexts |
|---|---|---|---|---|
| **CPU-origin** | bytes-`ImageResource`, compressed, host-handle (image/video) | backend **uploads** | the **backing** (shared upload) | yes — re-upload per context |
| **GPU-origin** | **produced** (render target), **external** (foreign handle) | resolver returns the handle | the **texture** | no — single-state |

"Produced vs external" is just *"did Flight allocate the GPU resource?"* — which drives the teardown verb:

- **Produced** → Flight owns the framebuffer/texture → `destroy*` **frees** it.
- **External** → the caller owns the handle → `dispose*` **drops the reference**, never frees. Freeing the caller's handle would be a bug.

## The CPU/GPU asymmetry and the two keys

- **No `.glTexture` peer next to the backing.** The CPU backing is context-neutral data → a plain field. The GPU handle is context-bound → reached through `resolveTexture(state, texture)`, cached in the state.
- **Two distinct "keys," don't conflate them.** *Identity* = which cache slot (the backing for CPU-origin, the texture for GPU-origin) — structural. *`version`* = is that slot stale — the temporal dirty-bit that triggers re-upload. Sampling (`sampler`/uv) is applied **at draw**, deliberately **off the key**.
- **Sampling-off-the-key is what makes sharing work.** Two `Texture`s over one backing with different wrap/uv share one upload (300k sprites over one atlas = one upload, thousands of draws). The same property lets you **re-sample a borrowed foreign handle** (apply Flight wrap/uv without touching the caller's texture). A still image bumps `version` once; a video bumps per frame; a procedural fill bumps on edit — all three fall out of the same two rules.

This matches the mature combined-handle engines (three.js `Texture.source.data` + `needsUpdate`; Unity `Texture2D` + `Apply()`), which resolve the GPU handle renderer-side by identity rather than storing it on the texture.

## Bring-your-own handle and render-to-texture

Both are the **GPU-origin** family — the pixels already live on the GPU, Flight owns a *reference*, not an upload. They differ only by ownership.

**Render-to-texture** — a produced backing (null image + a `RenderTargetDescriptor`):

```ts
const target = createRenderTexture({ width: 512, height: 512 });
renderIntoGlRenderTexture(state, target, (pass) => renderGlScene2D(pass, subtreeRoot));
bitmap.data.texture = target;                 // no RenderTargetNode2D — a Bitmap with a produced Texture
```

- `version` bumps on render → downstream samplers invalidate (the *content-changed* sense, not a re-upload gate — there is no upload).
- Keyed by the texture, single-state. Composes with the landed `pushGlRenderState`/`popGlRenderState` bracket (the state-isolation primitive; `renderIntoGlRenderTexture` binds the target around it). Non-2D moves the layer to an argument: `renderIntoGlCubeTextureFace` / `renderIntoGlTextureLayer` / `renderIntoGlTextureSlice`, keeping **volumetric depth**, **array layers**, and **render-target depth-stencil** from fighting over the word "depth."

**Foreign handle** — a resolver that returns the caller's handle as-is:

```ts
const tex = createExternalGlTexture(state, glHandle, { width, height });   // backing = { external, handle }
bitmap.data.texture = tex;
```

External is backend-specific by nature (a `WebGLTexture` is not a `GPUTexture`), so it resolves only in that backend's state — like produced. If the caller's contents change under Flight, the caller bumps `version` (Flight can't see it — there is no upload to gate).

## No discriminant-value aliases over `Texture`

One `Texture` type. Cube-ness / produced-ness / video-ness are all `storage`, **never a type** — `CubeTexture`, `VideoTexture`, `RenderTexture` dissolve *including as type aliases*. The line:

- **Capability aliases are allowed** (structural "has these fields": `HierarchyNode`, `HasColorScaleBias`, a `HasUvTransform`). They port as interfaces/trait-bounds.
- **Discriminant-value aliases are not** (`CubeTexture = Texture where dimension==='cube'`). A value constraint isn't structural, has no nominal home in the Rust/Haxe lowering (cube is an *enum variant*, not a type), and duplicates the runtime discriminant.

What does the job instead: the **named storage variants** (TS narrows on `dimension` for free), **constructors** carry intent (`createCubeTexture(faces)` returns a `Texture`), and **guards** catch misuse at runtime (`enableTextureGuards` warns; the core returns a sentinel). A function that truly needs cube-ness takes the *payload it needs* (the six faces) — a real, porting, capability-shaped parameter — not a texture-that-happens-to-be-cube.

## Loading, and why video is a loader not a backing

No URL / lifecycle / reload state on `Texture`. That is the **Resource** role — the existing `ImageResource` / `VideoResource` loaders *fill* a backing.

```ts
const texture = await loadTexture('cat.png');   // decodes → fills a bytes/host-handle backing
createTextureFromImage(imageResource);          // wraps an existing Resource's backing
// null out storage.image.data post-upload to drop the CPU copy (Unity "Read/Write Disabled")
```

**Video is not a distinct backing** — a `<video>` is just a host handle whose `version` (the former `frameId`) advances per frame. In C++ still-image and video are structurally identical (bytes/compressed/opaque-handle + a version that advances at different cadence; see [Portability](#portability-requirements-cc-rust-port)). So **`VideoTexture` the type deletes, and `VideoResource` demotes to a web loader** (owns the `<video>`, drives `version`), parallel to how `ImageResource`'s loaders own an `<img>`. The material's video slot folds into the one texture slot.

## Consumer happy path — the model is invisible for the 90% case

```ts
const state = createCanvasRenderState(canvas);
registerCanvasBitmapRenderer(state);
const texture = await loadTexture('cat.png');
const bitmap = createBitmap();
bitmap.data.texture = texture;
addNodeChild(root, bitmap);
renderCanvasScene2D(state, root);
```

The GL author writes the identical five lines. The only difference is one layer down: **every backend resolves the backing to its native handle** — GL to a `WebGLTexture` (upload, cached, version-gated), canvas to a `CanvasImageSource` (the bytes backing resolves to a cached `ImageBitmap`; a host-handle backing returns the element). Canvas's "GPU handle" is that drawable; the resolve step is real on both backends, it just resolves to different things. The architecture pays for itself by being absent from the person who just wants a picture on screen.

## Portability requirements (C/C++/Rust port)

Flight lowers via the TS AST + thin per-target backends, with memory bounded by the native seam (`flight-rs`/`surface-rs`). The design must satisfy these, because C++ has no GC and no bundler:

1. **The host element is an opaque `HostImageSource`, never a typed DOM field.** Today `ImageResource.source: CanvasImageSource | null` and `VideoResource.element: HTMLVideoElement | null` are public fields typed against host-web DOM unions with no C++ representation — a pre-existing leak invisible to `portable:check` (which gates runtime escapes, not type-level DOM references). Fix: a `HostImageSource` typedef across the native seam (web = `CanvasImageSource`; C++ = an opaque native handle). Zero web runtime change; makes `storage.image` mean the same thing in both targets.
2. **Ownership + teardown is declared for all four references** (no GC to paper over it):

   | reference | owner | teardown |
   |---|---|---|
   | CPU bytes (`ImageResource.data`, `TextureVolume.data`) | the **resource** | `dispose*` = **actually frees** the buffer |
   | host handle (`HostImageSource`) | the **loader/host**; resource **borrows** | resource dispose does **not** free it |
   | GPU handle (resolved) | the **render state** (keyed by backing) | `destroy*` frees it |
   | produced target / external handle | render state (produced) / **caller** (external) | produced→`destroy`; external→`dispose` (never frees) |

   "Drop the CPU copy after upload" must be a genuine deterministic free in the native build.
3. **`dimension` = closed `enum`; backing = open registry.** Dimension dispatch is compiler-exhaustive; backing dispatch is runtime-registry with an extensible arm.
4. **`Texture` carries no runtime state** — a plain shared reference; the port allocates no companion per texture. The backing (`ImageResource`) keeps the Entity/`dispose`/`version` machinery.
5. **`TextureVolume.data` = bytes + `PixelFormat`**, not `ArrayBufferView`; **counters (`version`) are integer (`u32`) monotonic**, not `f64`; **resolver registries are state-scoped, never module-global** (also dodges C++ static-init-order).
6. **Sync/async boundary stays clean:** the loader layer (`loadTexture`) is async; `resolveTexture` + backing dispatch stay synchronous and allocation-explicit. No lazy-async upload inside resolve.
7. **The pixel type staying narrow is itself a port requirement.** `Bitmap` = bytes + pixel math *is* `bitmap-rs`, the one crate that must stay DOM-free portable arithmetic. A pixel type polymorphic over `CanvasImageSource` would drag DOM types into it.

## Migration sequence — Scene3D-first pilot

Every step compiles, tests green, and lands on its own. The pilot (Steps 0–4: UnlitMaterial on GL) proves the whole model on the narrowest real slice — the triplication lives at `UnlitMaterial.ts:8-11` (`baseColorMap` / `baseColorRenderMap` / `baseColorVideoMap`) with three GL binds (`glUnlitPrelude.ts` `bindGlUnlitSurface` / `bindGlUnlitVideoSurface` + the render path). The backing-keyed cache (`bindGlImageResourceTexture`, keyed by `ImageResource`) and the frameId video gate already exist — the pilot routes three mechanisms through one seam.

- **Step 0 — `HostImageSource` seam.** Typedef indirection; repoint `ImageResource.source` and `VideoResource.element`. Zero web runtime change; closes the portability leak; unblocks a shared `storage.image` meaning. Lands alongside Step 1.
- **Step 1 — types, mechanical, still-image only.** New `TextureStorage`/`TextureDimension`/`TextureVolume`; evolve `Texture` (`storage`, `version`), `TextureStorage` with only the `2d`/`image` variant. Mechanical `x.image → x.storage.image` across the ~40 consumers. No semantic change; `VideoTexture`/`RenderTexture`/`CubeTexture` untouched; material still 3 slots. **Foundation commit.**
- **Step 2 — render-gl resolve seam (one case).** `resolveGlTexture(state, texture)` dispatching through `registerGlTextureResolver(state, backingKind, resolver)`; the `2d`/image resolver wraps existing `bindGlImageResourceTexture`. Registry-not-switch from the start (the tree-shaking guarantee; mirrors `registerGlCompressedTextureUpload`).
- **Step 3 — fold video.** Video backing (`version ≡ frameId`); register its resolver → existing `bindGlVideoTexture`. Collapse `baseColorVideoMap` into `baseColorMap`; drop the `videoMap` branch + `bindGlUnlitVideoSurface`. `createVideoTexture`/`advanceVideoTexture` produce/advance a `Texture`. First real backing dispatch; gate on existing video-texture + unlit scenes.
- **Step 4 — fold produced.** Produced backing (`RenderTargetDescriptor`); resolver returns the hidden target's attachment. Collapse `baseColorRenderMap`; delete `RenderTexture` type. **UnlitMaterial is now one `baseColorMap: Texture`** — pilot complete.
- **Step 5 — other GL materials** (phong/blinn/pbr/toon/shaded/matcap/normal), one at a time.
- **Step 6 — wgpu twin** (`resolveWgpuTexture` + registry; scene3d-wgpu material binds).
- **Step 7 — cube/array/3d dimensions** for env maps; `createCubeTexture`; delete the `CubeTexture` type; move `CubeFace*` consts to `TextureCubeFace.ts`.
- **Step 8 — external handle** (`wrapGlTexture`/`createExternalGlTexture`) — additive.
- **Step 9 — contract cleanup:** delete the superseded types/slots; the `RenderTargetNode2D`→`Bitmap` 2D fold is its own thread. Run `type-home:check` / `exports:check` / `api`.

## Scene2D realignment (approved 2026-07-28)

Scene2D carries **the same triplication the pilot deleted from `UnlitMaterial`, but at the node level**: three nodes that differ only in where their pixels come from.

| node today | data | what it is |
|---|---|---|
| `Bitmap` | `image: ImageResource`, `sourceRectangle`, `smoothing` | one quad, pixels by pixel-rect |
| `Video` | `source: VideoResource`, `smoothing` | one quad, pixels per-frame |
| `RenderTargetNode2D` | `{ width, height, depth }` | one quad, pixels produced |
| `Sprite` | `atlas: TextureAtlas`, `id`, `rect` | one quad, pixels by atlas region |
| `QuadBatch` | `atlas`, `ids: Uint16Array`, `transforms` | **N** quads — genuinely different |

`Bitmap` and `Sprite` differ *only in how they address pixels* (pixel-rect vs region id) — and **the texture fold erases that difference**, because both a sub-rect and an atlas region are just a uv window on a `Texture`. They are not similar; they are the same node. Batching is not a differentiator: every 2D leaf (bitmap, sprite, shape, text, tilemap, quad-batch) already writes through the shared GL/wgpu sprite-batch writer.

**Decision: one raster-quad node, named `Sprite`, holding a `Texture`.**

```ts
interface SpriteData extends Node2DData {
  texture: Texture | null;      // backing (image/video/produced/external) + sampler + uv window
}
```

Five fields across two nodes collapse to one. `atlas`+`id`, `sourceRectangle`, and `rect` all become the texture's uv window; `smoothing` becomes `sampler.magFilter`/`minFilter` (`'linear'`/`'nearest'` — the same intent), which plausibly also closes the "per-bitmap smoothing unsupported on gl/wgpu" gap in [render-backend-support](render-backend-support.md), since sampler state is wired end-to-end while the node property was not (verify, do not assume).

**`Sprite` wins the name, not `Bitmap`.** The engines whose model matches this design put the region on the texture and call the node `Sprite`/`Image`: PixiJS (`Texture` = base + frame, `Sprite` holds it), Starling (`SubTexture` + `Image`), Godot (`Sprite2D` + `Texture2D`). `Bitmap` is Flash's word, and Flight already uses `Sprite` for "one quad from an atlas" — exactly what the merged node is. Cost accepted: the `Shape`(vector)/`Bitmap`(raster)/`TextLabel`(text) reading loses some crispness, and Flash's `Sprite` is a *container* (Flight's container is `DisplayObject`).

**Region addressing survives only where it is load-bearing.** An atlas region id is an *optimization of a sub-section*, not the convenient user API. A `Uint16Array` of ids cannot hold `Texture` entities, so index-addressing is structurally required in `QuadBatch`/`Tilemap` and merely incidental for a single quad. Allocation works out: a `Texture` is per *distinct region*, not per instance — a 50-region atlas is 50 shared `Texture`s over **one** backing and **one** upload (the sampling-off-the-key rule), and frame animation becomes a pointer swap (`sprite.data.texture = frames[i]`) rather than uv mutation. The 300k-instance gate should hold.

**Capability falls out, not just cleanup.** Today video and produced pixels can appear *only* through their one dedicated node. After the fold every texture consumer accepts them: a `Shape` **filled with live video or a rendered subtree** (`beginTextureFill` goes from `[bitmap, matrix, repeat, smooth]` to `[texture, matrix]` — `repeat`/`smooth` are the sampler), a **dynamic `TextureAtlas`** whose backing is a produced texture (render into your atlas at runtime — currently inexpressible), and Tilemap/QuadBatch/BitmapText inheriting the same reach for free.

### Package moves

| package | action |
|---|---|
| `@flighthq/scene2d` | `Bitmap` → renamed **`Sprite`**, holds `Texture`; `Video` + `RenderTargetNode2D` deleted. The merged node is already here — the name moves, not the code. |
| `@flighthq/sprite` | → **`@flighthq/quadbatch`** (`sprite.ts` deleted; `QuadBatch` keeps `atlas` + `ids`). Already depends on `scene2d`, so the boundary direction is already right. |
| — | → **`@flighthq/tilemap`** (new; over `quadbatch`, finally pairing with the orphaned `tilemap-formats`) |
| `@flighthq/tileset` | **dissolved.** `Tileset` and `GridSliceOptions` are the same concept implemented twice (uniform grid over an image); `spritesheet`'s dependency is only a *converter*, not shared math. Grid slicing folds **up** into `textureatlas` as `createTextureAtlasFromGrid` (absorbing per-axis margin/spacing); the *layout* half (`tileWidth`/`tileHeight` for placement) belongs to `tilemap`. Folding it **down** into `tilemap` would be wrong — headless `spritesheet` would then drag the 2D scene graph. |
| `@flighthq/textureatlas` | gains `createTextureAtlasFromGrid`; `atlas.image` → `Texture` |
| scene2d-gl / -canvas / -dom / -wgpu | `glBitmap`→`glSprite`, `glSpriteRenderer` deleted. The shared writers are now `glQuadBatchWriter` / `wgpuQuadBatchWriter`: they serve `Shape`, `TextLabel`, `RichText`, clips, caches, `Tilemap`, and every other 2D quad producer rather than belonging to Sprite. |

Net package count is unchanged (+`quadbatch`/`tilemap`, −`sprite`/`tileset`) and one duplicated primitive is unified.

### Bundle cost of the unification — measured and accepted (2026-07-28)

The Scene2D pass initially regressed **84 of 128** size entries. Three distinct leaks were found and fixed, all the same class — a shared path statically pulling backing-specific realization, where the design mandates an open registry so unused backings shake out:

1. **The shared 2D batch writer** (`glQuadBatchWriter` / `wgpuQuadBatchWriter`) statically imported `resolveGlTexture`/`resolveWgpuTexture`, and 17 files per backend import that writer — so `glTextLabel`, `glShape`, `glClipRectangle`, and `glCache` paid for texture resolution while drawing no textures. **Fixed by inversion:** batching is the writer's job, resolution is the caller's — the writer now takes an already-resolved handle (or null).
2. **The canvas path** dispatched with a hardcoded ternary (`image !== null ? resolveCanvasImageSource : bindCanvasRenderTexture`) plus a static import, so every canvas Sprite bundle contained produced/render-target machinery. **Fixed** with a real `registerCanvasTextureResolver` registry keyed on the declared backing kind, matching GL/WGPU.
3. **Default shape commands** eagerly retained bitmap-fill texture resolution in every shape-capable bundle. **Fixed** — texture shape commands are a separate opt-in assembly.

After the fixes: **25 of 131 entries** exceed baseline, **all texture-bearing; every texture-free entry passes.** The remaining increase is **accepted and re-baselined** as intentional-and-measured, on this reasoning:

- **It is the cost of the model, not of unused features.** No bundle now contains a resolver for a backing it does not use. What remains is the shared `Texture`+`Sampler` descriptor and the one resolver the bundle actually needs — which satisfies the bundle rule's intent.
- **Absolute cost is 0.6–1.3 KB gzip.** The large percentages (video dom +25.2%, spritesheet canvas +17.7%, bitmap canvas +16.1%) are an artifact of deliberately minimal single-feature example bundles with 4–13 KB baselines.
- **The cost is paid once per app, not per feature.** Each example pays for the `Texture` descriptor in isolation, so these percentages are worst-case by construction; a real app using bitmaps *and* video *and* spritesheets *and* tilemaps pays it once.
- **What it buys:** three node types collapse to one, video/produced/external/compressed become reachable from *any* texture consumer, dynamic atlases become expressible, shape fills gain video and render-target sources, one upload is shared across sampling configs, and the model is C++-portable.

The leak class is worth remembering: **a shared hot path that statically imports backing-specific realization defeats the registry.** The registry only buys tree-shaking if every dispatch goes through it.

### Sequencing and known costs

Order: `Bitmap`→`Sprite` reshape (texture + sampler fold) → fold `Video` → fold `RenderTargetNode2D` → atlas-holders (`TextureAtlas.image` → `Texture`) → shape fills → package moves → batch-writer rename.

- **DOM backend is the real implementation cost.** `domBitmap` creates an `<img>` and sets `.src`; a video-backed sprite needs the actual `<video>` element in the DOM tree, so the DOM renderer must resolve the backing to the right element rather than assuming `<img>`. This is the canvas/DOM side of the resolver registry earning its keep.
- **Verify before deleting `tileset`:** the *descriptor* duplication is confirmed, but the slicing arithmetic in `tilesetFrom.ts` vs `createSpritesheetFromGrid` has not been diffed. If they differ on spacing/partial trailing cells, consolidate carefully rather than straight-delete.
- **`RenderCache`** is also a produced surface underneath. It should *share* the produced-backing mechanism but stay a distinct concept — it is an implicit automatic optimization, whereas a produced `Texture` is explicit and user-invoked, and the anti-magic posture keeps those apart at the API even when the machinery is common.
- **Natural size** now derives from texture dimensions × uv window rather than a stored `sourceRectangle`; a pixel-space authoring helper (`setTextureUvFromPixelRect`) and an atlas-region helper returning a cached per-region `Texture` cover the ergonomics.

## Backing decomposition (chartered and implemented 2026-07-28)

The five migration stages below are complete. `TextureStorage` now holds an `ImageBacking`; the concrete
siblings are host-backed `ImageResource`, CPU-readable `Bitmap`, and GPU-only `CompressedImage`.
Representation-specific fields no longer coexist on one nullable shape. The explicit conversions are
`createImageResourceFromBitmap` and `captureBitmapFromImageResource`, and GL/WebGPU/Canvas/DOM dispatch
through separately registered backing resolvers.

The resolver split reduced every affected measured Canvas/DOM example without changing the size baseline.
Canvas improvements ranged from -0.1% to -3.7% (largest: bitmap -3.7%, tilemap/video -3.5%,
spritesheet -3.0%); DOM improvements ranged from -1.3% to -1.6% for affected entries, with unaffected
entries flat.

**The unifying job moved up a layer, so the backing union is now vestigial.** `ImageSource` (later `ImageResource`) fused three representations into one type with three nullable fields *because nothing above it could dispatch* — it had to be the unifying layer. `Texture` + the state-scoped backing registry now hold that role. The union is still doing a job that has been superseded, and it should decompose.

The three-word table already says these are different layers; the types do not. `Surface extends ImageResource`, so a procedurally-generated noise buffer that was never loaded from anywhere is structurally a *Resource* carrying a null host handle, a null compressed payload, and an `alphaType` it has no use for — while a loaded PNG carries `data: null`, a field promising pixels it does not have.

The leak is visible in the API: `hasImageResourcePixels` is literally `source !== null || data !== null || compressed !== null`. A predicate whose job is "does this have *any* of its three representations" means consumers cannot know what they will get, so they ask "is there anything?" and branch — ~34 such sites across non-test source (19 on `.source`, 15 on `.data`).

### Host-backed and byte-backed differ on four axes

| | host-backed (loaded PNG, `<canvas>`, `ImageBitmap`) | byte-backed (in-memory pixels) |
|---|---|---|
| pixels readable | **no** — requires a readback | **yes** — that *is* the thing |
| mutable | no | yes, that is the point |
| canvas draw | direct, zero copy | **requires a transcode to an element** |
| GL upload | `texImage2D(element)` | `texImage2D(bytes)` |
| **C/C++ port** | **opaque native handle — the seam** | **plain byte buffer — `surface-rs`** |

The last row is decisive: **one struct currently has one portable field and one non-portable field.** `HostImageSource` fixed this at the *field* level, but the type still straddles the seam. Decomposing puts the native seam on a **type boundary** — `Bitmap` is bedrock-portable, the host-backed type is a seam object, and neither pretends to be the other.

### Shape — names decided

**`ImageResource` keeps its name; the pixel type (renamed `Surface` → `Bitmap`) becomes its sibling rather than its subtype.** The defect was never the name — it was `Surface extends ImageResource`. `ImageSource` covered both representations and *had* to be a union; `ImageResource` is a **flat asset** and should not be.

- **`ImageResource`** — a flat, immutable, ready-to-draw asset: an opaque `HostImageSource` + dimensions. Not pixel-readable; zero-copy draw/upload. Covers `<img>` and `ImageBitmap`.
- **`Bitmap`** — a mutable pixel buffer: bytes + `PixelFormat` + colorSpace. The pixel API is **total** on it; ports to `bitmap-rs`.
- **`CompressedImage`** — block-compressed payload + container metadata. GPU-only; neither canvas-drawable nor pixel-readable.

They share a header (`width`, `height`, `version`, `kind`) so `getTextureWidth`, uv math, and version dirty-gating stay uniform — a base plus **open** payload variants (backings are open; only `dimension` is closed), the same shape as `TextureStorage`.

**Why not `HostImage`** (considered and rejected): the argument for it was that a `<canvas>`/`OffscreenCanvas` is not "loaded," so "Resource" would be wrong. But the canvas-element case is the **RenderTexture backing** — `canvasRenderTexture.ts` returns the state-owned `target.canvas` — never the loaded-asset backing. Remove that case and nothing strains "Resource." Second tell: `HostImage.source: HostImageSource` **stutters**, while `ImageResource.source: HostImageSource` reads correctly — the entity is the asset, the field is the handle it carries. The already-shipped `HostImageSource` typedef works *because* the entity is not called `HostImage`.

**Provenance is not the distinguishing axis — representation is.** A KTX2 payload is equally "loaded"; it differs by holding compressed bytes rather than a host handle. `ImageResource` earns the plain unqualified name because the host-handle case is the canonical image asset; `CompressedImage` qualifies itself. Same pattern as `Texture` keeping the plain name while its variants dissolved.

Two accepted wrinkles: the transcode result (`createImageResourceFromBitmap`) yields an `ImageResource` whose handle is a runtime `<canvas>` — acceptable, since after an *explicit* conversion the caller holds a flat immutable drawable. And `<video>` is not an `ImageResource`: it is already its own backing kind (`VideoResource`).

### Naming: `RenderTexture`, not `produced`

`produced` is category jargon that only reads next to `external`. `RenderTexture` is the concrete noun users actually type (`createRenderTexture`), and the function vocabulary already says it everywhere (`bindGlRenderTexture`, `destroyGlRenderTexture`, `explainGlRenderTexture`, `bindCanvasRenderTexture`). Rename the kind to match — `RenderTextureBackingKind = 'renderTexture'` — and keep "produced / GPU-origin" as **prose category** language in this document only, paired with "external", never as an identifier.

### The implicit conversions become explicit primitives

Today bytes→element happens **invisibly** inside `resolveCanvasImageSource`, cached in a hidden per-render-state `WeakMap`, with `explainCanvasImageSource` existing to make the cost legible. **A diagnostic that exists to explain an implicit conversion is a missing explicit primitive.** Decomposed, they are named, allocating, and caller-owned:

- `createImageResourceFromBitmap(bitmap)` — the transcode, in `@flighthq/image`
- `captureBitmapFromImageResource(resource)` — the readback, in `@flighthq/bitmap`

Caller-owned caching replaces a hidden per-state `WeakMap`, per the explicit-allocation posture. The per-frame transcode cache does not disappear — it moves into the *bitmap-backing resolver*, which is exactly what makes a PNG-only bundle lighter.

### Canvas/DOM resolver split — decided

`resolveCanvasImageSource` (the fused helper) **dissolves**. It has *zero* external callers — every reference outside its own file is a comment — so this is internal restructuring, not an API change. `resolveCanvasTextureSource` stays as the single dispatch entry (5 callers: sprite, quad-batch, tilemap, bitmap-text, particle-emitter). It splits into separately-registered backings:

```ts
registerCanvasImageTextureResolver(state)    // host-backed: return .source. ~2 lines, no imports.
registerCanvasBitmapTextureResolver(state)   // byte-backed: transcode + WeakMap + version gate.
registerCanvasRenderTextureResolver(state)   // offscreen canvas.
```

Note the inversion this exposes: **the host-backed resolver barely earns the name** — a single property read, no state, no cache — while the *bitmap* case carries all the machinery. The `(state, texture)` resolver signature is shaped entirely by the bitmap case; the host case does not need `state` at all.

**Canvas keeps a bitmap resolver rather than refusing byte-backed textures.** The purist alternative — return a sentinel and make the caller convert — was rejected because **GL uploads bytes natively** (`texImage2D(bytes)` is the native path, not a conversion). Refusing them on canvas would manufacture an *artificial* backend gap, unlike the gaps the design already accepts: a cube or volume texture is hardware-only **by nature** (canvas genuinely cannot sample a volume), whereas a byte buffer is the most *software* thing there is. Canvas needing an element is an artifact of the Canvas2D API, not a property of the backend.

What makes this not-magic: **the registration is the explicit request.** Calling `registerCanvasBitmapTextureResolver` by name *is* the caller asking for the transcode, and `explainCanvasImageSource` is the transparent cost — the anti-goals test (explicit invocation + transparent cost) is satisfied by the named opt-in, not defeated by it.

And the convenience stays genuinely optional, because **the primitive underneath is public**. Two honest routes:

1. **Register the bitmap resolver** — automatic, version-gated, cached per render state.
2. **Convert once with `createImageResourceFromBitmap`** and hold a host-backed texture — no resolver registered, no transcode code in the bundle at all.

A guard on the unregistered case should name *both* routes, not just the registration. Same treatment applies verbatim to `domImageSource`/`domSprite`.

Net default: **showing a loaded image is the cheapest path and needs no opt-in; procedural pixels on canvas are the specialized case that pays for themselves.** That is the hardware-store rule landing the right way round.

### What it buys

- **Bundle** — a PNG-loading app contains no transcode and no byte handling; a procedural app contains no element handling. The registry shakes them apart because they are genuinely different backings, not one resolver with a branch. This **subsumes the canvas-lightweighting item**, which should therefore not be done first.
- **Port** — the seam lands between types instead of inside one: `Bitmap` is bedrock-portable (`bitmap-rs`), `ImageResource` is a seam object.
- **Capability honesty** — `getBitmapPixel` is total on `Bitmap`, not "total on the narrowing, meaningless on the base."
- **Ambiguity dies** — no more "both `source` and `data` are populated; which is authoritative?"

### Known counter-case

You sometimes legitimately want both representations behind one identity — a generated atlas you upload *and* keep for CPU hit-testing, or a `Bitmap` mutated per frame and drawn on canvas. Decomposed, that is two objects (a `Bitmap` plus a derived `ImageResource`) held by the caller. This is judged **better** — both things genuinely exist and the cost is visible — but it means `Texture.storage` points at exactly one backing, so "same texture, bytes on GL, element on canvas" becomes an explicit caller decision rather than silent field population.

### Staged migration (types-first, mirroring the pilot)

1. Define the header + three backings in `@flighthq/types`; keep the fused shape working while the sibling types land.
2. Add the two explicit conversion primitives; leave the implicit transcode in place.
3. Migrate the ~34 representation branches mechanically to the declared kind.
4. Split the canvas + GL/WGPU resolvers per backing; move the transcode cache into the bitmap resolver. **Re-run `size` here — this is where the win lands.**

   **Measured expectation (probe, 2026-07-28).** Stripping the transcode from the default canvas resolver and running `size --render=canvas` gives: bitmap **−2.9%** (4.76→4.62 KB, −140 B), video −2.8%, tilemap −2.7%, spritesheet −2.3%, benchmark −1.7%, bitmapfont-generate −1.2%, particleeditor −1.1%, particles −0.9%, interaction −0.1%, and **±0.0% on all 19 other canvas examples**. So the transcode + its WeakMap cache is worth **~140–160 B gzip**, currently paid by every bundle registering the image resolver — including `bitmap`/`tilemap`/`spritesheet`, none of which draw a byte-backed texture. That recovers roughly a fifth of the accepted `bitmap:canvas` +16.1% regression.

   The *shape* matters more than the magnitude: every non-texture example is dead flat, which is the signature of a clean removal. If the split also shaved `text` or `tween`, the transcode would be reachable from somewhere it has no business being. Treat any non-flat row outside the list above as a finding, not a bonus.
5. Retire the fused type and `hasImageResourcePixels`; make the pixel API total on `Bitmap`.

### Open questions

1. ~~**Naming**~~ — **DECIDED**: `ImageResource` keeps its name as the flat asset; `Bitmap` becomes a sibling, not a subtype; `RenderTexture` replaces `produced` in identifiers. See "Shape — names decided" above.
2. **Does a separate loading-identity entity survive** (url + load state), or do loaders simply return a backing directly? `ImageResourceReference` and the `assets`/`loader` packages may already cover it — do not invent a fourth type without evidence.
3. **Where `CompressedImage` lives** — `@flighthq/image` beside `ImageResource`, or with `@flighthq/texture-formats` which already parses the containers.

## What this dissolves (and why)

| retired / never-built | becomes |
|---|---|
| `ImageTexture` (the rename) | never introduced — `Texture` stays the name |
| `VideoTexture` (type) | a host-handle backing whose `version` bumps per frame; `VideoResource` demotes to a web loader |
| `RenderTexture` (type) | a produced (GPU-origin) backing |
| `RenderTargetNode2D` (node) | a `Sprite` with a produced `Texture` (no dedicated node) |
| `Bitmap` (node) | renamed **`Sprite`** — the one raster-quad node, holding a `Texture` |
| `Video` (node) | a `Sprite` whose texture has a video backing |
| `Sprite`'s `atlas` + `id` (single-quad) | the texture's uv window; index-addressing survives only in `QuadBatch`/`Tilemap` |
| `Bitmap.smoothing`, `beginTextureFill`'s `repeat`/`smooth` | `Sampler` fields (`magFilter`/`minFilter`, `wrapU`/`wrapV`) |
| `@flighthq/sprite` (package) | `@flighthq/quadbatch` + `@flighthq/tilemap` |
| `@flighthq/tileset` (package) | grid slicing → `textureatlas` (`createTextureAtlasFromGrid`); layout params → `tilemap` |
| `CubeTexture` / `Texture2D` / `Texture3D` types | `storage.dimension` values (+ `TextureVolume` for the 3D CPU backing) |
| separate material slots / a `TextureSource` union / a source-kind field | one slot (`baseColorMap: Texture`); the split is `storage` + the resolver registry |
| `ImageResource.source: CanvasImageSource` / `VideoResource.element: HTMLVideoElement` | an opaque `HostImageSource` across the native seam |

## Remaining open questions

1. ~~**Exact `TextureStorage` encoding**~~ — **DECIDED (implemented)**: a discriminated union on `dimension` with `target?` per-variant and `?: never` exclusivity markers.
2. ~~**Does `Bitmap` hold a `Texture` or something lighter?**~~ — **DECIDED: hold the full `Texture`** (on the node now named `Sprite`). The 2D analysis settles it two ways: the node fold *requires* it (that is what makes video/produced uniform), and `colorSpace` is **not** dead weight in 2D — a produced texture from a linear-space target sampled by a 2D quad needs exactly that flag (the GL render-texture work already hit linear-target shader handling). A guard should still flag a non-`2d`-dimension texture assigned to a 2D node.
3. **A few entry names** — the produce-wrapper family (`renderIntoGl…`) and the loader entries (`loadTexture` / `createTextureFromImage`). Leaning as written, not frozen.
4. **The `Sprite` region-lookup home** — does `Sprite` keep a convenience (`setSpriteAtlasRegion(sprite, atlas, id)`) or does region→`Texture` lookup live entirely in `@flighthq/textureatlas` returning a cached per-region `Texture`? Lean: the latter, keeping the node minimal. Decide before the 2D pass, since it shapes the spritesheet animation path.
5. **`Sprite` vs `QuadBatch` naming** — with draw-strategy no longer distinguishing them at the *name* level (both batch; one is single-instance, one multi-instance), the boundary reads less clearly than it should. Revisit after the 2D pass; not worth churning now.

## Relationship to in-flight work

- **`pushGlRenderState` / `popGlRenderState` (landed).** Unaffected — the state-isolation bracket the produce mechanism sits on. Keep.
- **`RenderTargetNode2D` (landed, builder4).** Superseded — folds into `Sprite`-with-a-produced-`Texture` in the Scene2D pass. Do not extend it.
- **The `RenderTexture` type + `RenderTextureNode2D` wgpu/canvas twins (builder4, in progress).** Superseded — `RenderTexture` becomes a produced backing (Step 4). **Stop extending the standalone type**; the GL render-target machinery it built is reused as the produced resolver.

## Prior art

Combined CPU+GPU handle is mainstream (three.js, Unity resolve the GPU texture renderer-side by identity; neither stores it on the texture). Unity vs three.js disagree on base-vs-leaf (`Texture` abstract + `Texture2D` leaf vs `Texture` = the leaf) — the `ImageTexture`-vs-`Texture` fork this design dissolves by making "which kind" data, not a subtype. **Naming hazard:** texture `2D`/`3D` in engines means *sampling dimensionality*, orthogonal to Flight's *scene* `2D`/`3D` — so no `Texture3D` type; the sampling axis lives only in `storage.dimension`.
