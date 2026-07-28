# Texture / Surface / Resource

**Working design — core decisions settled 2026-07-28 (design consult).** The load-bearing calls below are **decided** and are the spec the migration implements against. Three items remain genuinely open (see [Remaining open questions](#remaining-open-questions)): the exact `TextureStorage` encoding, whether `Bitmap` holds a full `Texture`, and a few entry-point names. This supersedes the earlier "add a `RenderTexture` type as a `VideoTexture` sibling" and "`Texture` base + `ImageTexture` rename" sketches (see [What this dissolves](#what-this-dissolves-and-why)).

> **Read this first — the one idea.** The honest seam is the **resource layer**, not the texture *type*. A texture has a **CPU side** — a *backing* (`ImageResource`: bytes, compressed bytes, or an opaque host handle), a context-neutral field — and a **GPU side** — a backend handle, context-bound, reached through `resolveTexture(state, texture)` and cached in the state, **never a field**. That asymmetry *is* the ownership model. Everything else — dimensionality, render targets, video, loading, foreign handles — hangs off that split. There is **one** public `Texture` type; "which kind" is expressed by data (`storage.dimension`, backing family), never by subtypes.

## The three words

Three nouns, one per layer. **"Source" is rejected as a *layer* name** — it names provenance, true for the loaded case and misleading for procedural and produced textures. (The word "source" survives where it legitimately means a drawable or a generator — `resolveCanvasImageSource`, `RandomSource`; the ban is on a `TextureSource` *layer type*.)

| word | layer | what it is | package(s) today |
|---|---|---|---|
| **Resource** | loading / provenance | the loadable identity (URL, asset, lifecycle) that *fills* a backing. A render target never touches this layer. | `@flighthq/image` (`ImageResource`), `@flighthq/video` (`VideoResource`) |
| **Surface** | CPU / software | the 2D **pixel buffer** — bytes + pixel-manipulation API. The `@flighthq/surface` type. **Stays narrow.** | `@flighthq/surface` |
| **Texture** | GPU-facing / sampled | what a material or bitmap references: `storage` + sampling + `version`. Realized to a GPU handle per render state. | `@flighthq/types` (type) + `@flighthq/texture` (functions) |

The three words are **already the package graph** — no package renames.

Pipeline: `Resource` → fills → a **backing** → held by → `Texture.storage` → resolved to → GPU handle (per-state, cached).

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

- **The CPU-side field is `image: ImageResource | null`, NOT `surface: Surface | null`.** `ImageResource` is the multi-representation CPU backing that already exists (`data` bytes ∪ `compressed` ∪ a host handle, + `version`); `Surface` is its bytes-guaranteed narrowing for the pixel-manipulation path. The storage holds the *broad* backing; `Surface` stays the narrow view. Naming it `image` matches today's `Texture.image` field and the actual type — a field named `surface` typed `ImageResource` would be exactly the name↔type drift we are avoiding.
- **`Surface` is inherently 2D — and that is principled.** The software backend (canvas) is inherently 2D; it cannot sample a volume/cube/array, so non-2D textures are hardware-only by nature. A `3d` texture's CPU backing is a `TextureVolume` (bytes + `PixelFormat`, mirroring `ImageResource` — **not** `ArrayBufferView`); cube/array are `ImageResource[]`.

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
7. **`Surface` staying narrow is itself a port requirement.** `Surface` = bytes + pixel math *is* `surface-rs`, the one crate that must stay DOM-free portable arithmetic. A `Surface` polymorphic over `CanvasImageSource` would drag DOM types into it.

## Migration sequence — Scene3D-first pilot

Every step compiles, tests green, and lands on its own. The pilot (Steps 0–4: UnlitMaterial on GL) proves the whole model on the narrowest real slice — the triplication lives at `UnlitMaterial.ts:22-24` (`baseColorMap` / `baseColorRenderMap` / `baseColorVideoMap`) with three GL binds (`glUnlitPrelude.ts` `bindGlUnlitSurface` / `bindGlUnlitVideoSurface` + the render path). The backing-keyed cache (`bindGlImageResourceTexture`, keyed by `ImageResource`) and the frameId video gate already exist — the pilot routes three mechanisms through one seam.

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

## What this dissolves (and why)

| retired / never-built | becomes |
|---|---|
| `ImageTexture` (the rename) | never introduced — `Texture` stays the name |
| `VideoTexture` (type) | a host-handle backing whose `version` bumps per frame; `VideoResource` demotes to a web loader |
| `RenderTexture` (type) | a produced (GPU-origin) backing |
| `RenderTargetNode2D` (node) | a `Bitmap` with a produced `Texture` (no dedicated node) |
| `CubeTexture` / `Texture2D` / `Texture3D` types | `storage.dimension` values (+ `TextureVolume` for the 3D CPU backing) |
| separate material slots / a `TextureSource` union / a source-kind field | one slot (`baseColorMap: Texture`); the split is `storage` + the resolver registry |
| `ImageResource.source: CanvasImageSource` / `VideoResource.element: HTMLVideoElement` | an opaque `HostImageSource` across the native seam |

## Remaining open questions

1. **Exact `TextureStorage` encoding** — `target?` per-variant vs hoisted; how `RenderTargetDescriptor` carries per-dimension params (faces/layers). Illustrative above, not final; lean hoist, decide at implementation.
2. **Does `Bitmap` hold a `Texture` or something lighter?** Holding a `Texture` unifies image/video/produced content but carries `colorSpace` (a constant-`srgb` 3D concern in 2D). Accepted for now; a guard should flag a non-2d texture assigned to a 2D `Bitmap`. Revisit if it grates.
3. **A few entry names** — the produce-wrapper family (`renderIntoGl…`) and the loader entries (`loadTexture` / `createTextureFromImage`). Leaning as written, not frozen.

## Relationship to in-flight work

- **`pushGlRenderState` / `popGlRenderState` (landed).** Unaffected — the state-isolation bracket the produce mechanism sits on. Keep.
- **`RenderTargetNode2D` (landed, builder4).** Superseded in intent — folds into `Bitmap`-with-a-produced-`Texture` during the migration (Step 9). Do not extend it.
- **The `RenderTexture` type + `RenderTextureNode2D` wgpu/canvas twins (builder4, in progress).** Superseded — `RenderTexture` becomes a produced backing (Step 4). **Stop extending the standalone type**; the GL render-target machinery it built is reused as the produced resolver.

## Prior art

Combined CPU+GPU handle is mainstream (three.js, Unity resolve the GPU texture renderer-side by identity; neither stores it on the texture). Unity vs three.js disagree on base-vs-leaf (`Texture` abstract + `Texture2D` leaf vs `Texture` = the leaf) — the `ImageTexture`-vs-`Texture` fork this design dissolves by making "which kind" data, not a subtype. **Naming hazard:** texture `2D`/`3D` in engines means *sampling dimensionality*, orthogonal to Flight's *scene* `2D`/`3D` — so no `Texture3D` type; the sampling axis lives only in `storage.dimension`.
