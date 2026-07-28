# Texture / Surface / Resource

**Working design — open, 2026-07-28. NOT blessed.** This captures a design converged through discussion but with naming and several structural calls still live (see [Open questions](#open-questions)). Do not treat any signature here as final. It supersedes the earlier "add a `RenderTexture` type as a `VideoTexture` sibling" and "`Texture` base + `ImageTexture` rename" sketches — those were answering at the wrong layer (see [What this dissolves](#what-this-dissolves-and-why)).

> **Read this first — the one idea.** The honest seam is the **resource layer**, not the texture *type*. A texture has a **CPU side** (a `Surface`, context-neutral data, a plain field) and a **GPU side** (a backend handle, context-bound, reached through `resolveTexture(state, texture)` — never a field). That asymmetry *is* the ownership model. Everything else — dimensionality, render targets, video, loading — hangs off that split. There is **one** public `Texture` type; "which kind" is expressed by data (`storage.dimension`, surface-present-vs-produced), never by subtypes.

## The three words

The vocabulary is deliberately three nouns, one per layer. **"Source" is rejected as a name** — it names provenance ("where it came from"), which is true for the loaded case and misleading for procedural and render-target textures (nothing was "sourced"). Each layer gets the word for *what it is*:

| word | layer | what it is |
|---|---|---|
| **Resource** | loading / provenance | the loadable identity (URL, asset, lifecycle). Produces a `Surface`. A render target never touches this layer. |
| **Surface** | CPU / software | the 2D pixel view — the `@flighthq/surface` type. `drawImage`-able. Present or `null`. |
| **Texture** | GPU-facing / sampled | the object a material or bitmap references: `storage` + sampling + `version`. Realized to a GPU handle per render state. |

Pipeline: `Resource` → produces → `Surface` → held by → `Texture.storage` → realized to → GPU handle (per-state, cached).

## The Texture shape

```ts
interface Texture {
  storage: TextureStorage;   // dimension + CPU backing (or produced)
  sampler: Sampler;          // wrap / filter / anisotropy
  colorSpace: TextureColorSpace;
  // uv-transform (KHR_texture_transform): uvOffset / uvScale / uvRotation / flipX / flipY
  version: number;           // bump on change → drives the surface→texture sync (and is a content marker for produced textures)
}
```

This is a minimal **evolution** of today's `Texture`, not a new type tower: `image → storage.surface`, add `version`, drop the `resource` field (loading moves to the Resource layer). `sampler` / `colorSpace` / uv stay.

## TextureStorage — two orthogonal axes, never one

The storage is a discriminated union on **`dimension`** (the *shape*). Render-target-ness is a **separate, orthogonal backing state** (`target`), because render targets come in *every* dimension. Collapsing them into one enum was the main correction over the first draft — it structurally forbids cube env-map render targets, array shadow cascades, and volumetric render targets, all of which are real.

```ts
type TextureStorage =
  | { dimension: '2d';       surface:  Surface | null;                target?: RenderTargetSpec }
  | { dimension: 'cube';     surfaces: readonly [Surface, Surface, Surface, Surface, Surface, Surface] | null; target?: RenderTargetSpec }
  | { dimension: '2d-array'; surfaces: readonly Surface[] | null;     target?: RenderTargetSpec }
  | { dimension: '3d';       volume:   TextureVolume | null;          target?: RenderTargetSpec };
// surface(s)/volume === null  ⇒  produced (render target); `target` carries { width, height, depthStencil, +layers/faces as the dim needs }

interface TextureVolume extends Entity {  // the 3D CPU backing — NOT a Surface (Surface is inherently 2D)
  width: number; height: number; depth: number;
  format: PixelFormat; data: ArrayBufferView; version: number;
}
```

- **`Surface` is inherently 2D — and that is principled, not a limitation.** The software backend (canvas) is inherently 2D; it cannot sample a volume, cube, or array. So non-2D textures are *hardware-only by nature*, and `Surface` being the 2D case simply mirrors "software is the 2D case." A `3d` texture's CPU backing is a `TextureVolume`; cube/array are `Surface[]`.
- **`dimension` (shape) × backing (surface-present vs produced) compose.** A cube env-map render target is `dimension: 'cube'` + `target` with `surfaces: null`. That is the case the collapsed model could not express.

## The CPU/GPU asymmetry — the load-bearing rule

- **No `.glTexture` peer next to `.surface`.** The CPU view is context-neutral data → a plain field. The GPU handle is context-bound → reached through `resolveTexture(state, texture)`, cached in the state. The asymmetry is the whole ownership model made visible; do not flatten it into two sibling fields.
- **The surface-kind GPU cache keys on the surface, not the Texture.** Two `Texture`s sharing one `Surface` with different uv/wrap must share one upload — sampling is applied at draw, not baked into the upload. A produced (render-target) texture is keyed by the texture, single-state (a GPU render target cannot cross contexts).
- **`resolveTexture` dispatches through an open resolver registry keyed by the surface's backing / dimension — not a `switch`.** This is what keeps a still-image bundle from dragging the video and render-target realizers (the AGENTS.md open-registry rule). It is the tree-shaking guarantee; it lives or dies here.

This matches the mature engines that *combine* CPU+GPU in one handle: three.js (`Texture.source.data` + `needsUpdate`, GPU resolved per-renderer keyed by the texture) and Unity (`Texture2D` CPU pixels + `Apply()`, freeable CPU copy). Neither puts the GPU handle on the texture as a field — both resolve it renderer-side by identity. Godot is the holdout that separates `Image` (CPU) from `ImageTexture` (GPU).

## Loading lives in the Resource layer, not on the Texture

No URL / lifecycle / reload state on `Texture`. That is the `Resource` role: a loader/asset layer that *fills* `storage.surface`.

```ts
const texture = await loadTexture('cat.png');       // decodes → fills a 2D Surface
createTextureFromImage(imageResource);              // wraps an existing Resource's Surface
// null out storage.surface post-upload to drop the CPU copy (Unity's "Read/Write Disabled")
```

A render target never touches this path — it is produced, not loaded.

## The `kind` field dissolves

An earlier sketch carried `kind: 'image' | 'video' | 'renderTarget'`. It is **not needed**. A texture is just "a surface + `version`": a static image never bumps `version`, a video bumps it every frame, a procedural fill bumps it on edit — the texture does not care which. `render-target` is not a source kind either; it is the *produced* backing (null surface). The only thing that must dispatch is the **upload path** (pixel buffer vs `<video>` element vs offscreen canvas), and that belongs on the **surface's own backing type**, resolved per-state.

Net: **two discriminants total** — `storage.dimension` (shape) and surface-present-vs-produced (backing). No source-`kind` field; no `render-target` masquerading as a dimension.

## Rendering into non-2D textures

The target layer is an **argument to the backend op**, never overloaded onto the texture or into `depth`:

```ts
renderIntoGlTextureLayer(state, arrayTexture, layer, callback);
renderIntoGlCubeTextureFace(state, cubeTexture, face, callback);
renderIntoGlTextureSlice(state, volumeTexture, z, callback);
```

This keeps three unrelated concepts apart that otherwise fight over the word "depth": **volumetric depth** (a 3D texture's z-extent), **array layers**, and **render-target depth-stencil**. The 2D produce is the degenerate case (`renderIntoGlRenderTexture` / the produce wrapper), and it composes with the `pushGlRenderState` bracket already landed (see [render-backend-support](render-backend-support.md); the bracket is the state-isolation primitive that any produce sits inside).

## Consumer happy path — the model is invisible for the 90% case

A canvas/DOM author, showing a loaded image, never touches `storage`, `dimension`, `version`, `resolveTexture`, or any GPU vocabulary:

```ts
const state = createCanvasRenderState(canvas);
registerCanvasBitmapRenderer(state);
const texture = await loadTexture('cat.png');
const bitmap = createBitmap();
bitmap.data.texture = texture;
addNodeChild(root, bitmap);
renderCanvasScene2D(state, root);
```

Under the hood, the canvas renderer reads `texture.storage.surface` (for a `2d` texture) and `ctx.drawImage`s it — **`resolveTexture` is never called on canvas**. The GL author writes the *identical* five lines; the only difference is one layer down, where the GL renderer calls `resolveTexture(state, texture)` (upload, cached, version-gated) instead of reading the surface. Same author code; the backend picks its realization. The architecture pays for itself by being absent from the person who just wants a picture on screen.

## Prior art

- **three.js** — combined handle: base `Texture` carries CPU data (`.source.data`) + `.needsUpdate`; `WebGLRenderer` resolves/caches the `WebGLTexture` keyed by the texture. Render output is a plain base `Texture` on `WebGLRenderTarget.texture`. Special *sources* are subclasses (`VideoTexture`, `DataTexture`, `FramebufferTexture`). Bare `Texture` = the common leaf.
- **Unity** — `Texture2D` combines CPU pixels (freeable via Read/Write) + GPU (`Apply()` syncs). `Texture` is the *abstract base*; the image leaf is qualified (`Texture2D`). `RenderTexture` is a separate GPU-only type. `Texture3D`/`Cubemap` put dimensionality in the type name.
- **Godot** — the holdout: `Image` (CPU) and `ImageTexture` (GPU) are separate objects.

Two takeaways. (1) The **combined CPU+GPU handle is mainstream** (three.js, Unity), so it is safe. (2) Unity and three.js **disagree** on base-vs-leaf (`Texture` abstract + `Texture2D` leaf, vs `Texture` = the leaf) — the exact `ImageTexture`-vs-`Texture` fork. The **`kind`/`dimension`-as-data approach dissolves that fork**: with no subtypes there is no base to keep bare and no leaf to qualify — `Texture` is *the* type and "which kind" is a value.

**Naming hazard, resolved here:** texture `2D`/`3D` in the engines means *sampling dimensionality* (grid vs volume), which is a different axis from Flight's *scene* `2D`/`3D` (`Node2D` / `Scene2D`). Same label, orthogonal meanings. So Flight must **not** introduce a `Texture3D` type — it would read as "volume texture" to a graphics dev while colliding with scene-3D. Volume textures, if built, are `VolumeTexture`; the sampling-dimensionality axis lives in `storage.dimension`, never in a type name that reuses "3D."

## What this dissolves (and why)

| retired / never-built | becomes |
|---|---|
| `ImageTexture` (the rename) | never introduced — `Texture` stays the name; no subtype to disambiguate |
| `VideoTexture` (type) | a `Texture` whose surface is updated per-frame (`version` bumps); `baseColorVideoMap` folds back into `baseColorMap` |
| `RenderTexture` (type) | a produced `Texture` (`storage` backing = `target`, null surface) |
| `RenderTextureNode2D` (node) | a `Bitmap` whose `texture` is a produced `Texture` (no dedicated node) |
| separate `Texture2D` / `Texture3D` / `CubeTexture` types | `storage.dimension` values (with `TextureVolume` as the 3D CPU backing) |
| separate material slots / a `TextureSource` union / a source-kind registry | one slot (`baseColorMap: Texture`); the split is `storage` + the resolver registry |

## Open questions

**This document is intentionally not closed.** Live calls:

1. **How far `Surface` stretches.** `Surface` as "CPU 2D pixel buffer" is clean for loaded/procedural. But video's software backing is a `<video>` element and a canvas render-target's is an offscreen `<canvas>` — neither is a pixel buffer, yet canvas draws both. Either `Surface` broadens to "any software-side 2D pixel source" (`CanvasImageSource` ∪ pixel buffers), or those cases carry a different software backing. The one-sentence invariant ("software reads `storage.surface`") wants the broadening; decide before committing, since it changes what `Surface` *means* (and whether `@flighthq/surface`'s `ImageSource` → `Surface` rename is cosmetic or conceptual).
2. **Does `Bitmap` hold a `Texture` or something lighter?** Holding a `Texture` lets a bitmap show image/video/produced content uniformly, but carries `colorSpace` (a 3D concern, constant-`srgb` in 2D). The unification is accepted for now; the over-carry is the price. Revisit if it grates.
3. **The exact `TextureStorage` encoding** — `target?` per-variant vs hoisted; how `RenderTargetSpec` carries per-dimension params (faces/layers/depth). Illustrative above, not final.
4. **Whether the source-`kind` fully dissolves** or a minimal discriminant survives for upload-path dispatch (vs putting it on the surface backing). Current lean: on the surface backing, resolved per-state.
5. **Migration scope.** `Texture.image → storage`, drop the `resource` field, remove `VideoTexture`, consolidate the material video slot, retire the just-landed `RenderTargetNode2D` into `Bitmap`-with-a-produced-`Texture`. Sequencing and blast radius to be planned; this is a foundational resource-layer change.
6. **Naming of the produce wrapper family** (`renderIntoGlRenderTexture` / `renderIntoGlCubeTextureFace` / …) and whether `loadTexture` / `createTextureFromImage` are the right loader-layer entry names.

## Relationship to in-flight work

- **`pushGlRenderState` / `popGlRenderState` (landed).** Unaffected — the state-isolation bracket is the produce mechanism this model sits on. Keep.
- **`RenderTargetNode2D` (landed).** Superseded in intent — under this model the 2D render-output case is a `Bitmap` with a produced `Texture`, not a dedicated node. Do not extend it; fold it in during the migration (Open question 5).
- **The dispatched `RenderTexture` type + `RenderTextureNode2D` wgpu/canvas twins.** Superseded by this model; held pending this design.
