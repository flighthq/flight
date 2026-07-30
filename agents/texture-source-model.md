# Texture Source Model

_Design spec. Settled with the user 2026-07-29 (review); revised and **locked** with the user
2026-07-30 (chief): the storage layer is deleted (Texture flattened), `VoxelGrid` replaces
`TextureVolume`, and the Texture↔TextureAtlas relationship is settled. M2 (`CubeTexture` /
`RenderTexture`) has landed; nothing else is implemented. Read this before touching `Texture`,
`TextureStorage`, `ImageBacking`, or any `create*Texture` / `create*Image*` constructor._

## Why this exists

The texture layer has two nouns for one axis, one type holding three unrelated things, a documented
invariant the types permit violating, and a family of constructors that assert types which do not
exist. Each is small. Together they make the layer unreadable: three separate readers of this code
(the user, review, and whoever wrote the kind constants) each derived a different model from it, and
review revised its own reading four times while writing this document. That is the cost being paid,
and it is why the fix is a re-shape rather than a rename pass.

Nothing here is a behavioural change. Every item is either naming, or splitting a type that fused
distinct things, or making an already-documented invariant unrepresentable.

## Current model, as built

```ts
Texture extends Entity, TextureUvTransform {   // Texture.ts:18 — NO kind field
  colorSpace: TextureColorSpace;
  sampler: Sampler;
  storage: TextureStorage;
  version: number;
}

TextureStorage =                                // TextureStorage.ts — discriminated on dimension
  | { dimension: '2d';       image: ImageBacking | null;              images?: never; target?: TextureTargetBacking; volume?: never }
  | { dimension: '2d-array'; images: readonly (ImageBacking | null)[]; image?: never;  target?: TextureTargetBacking; volume?: never }
  | { dimension: 'cube';     images: TextureCubeImages /* 6-tuple */;  image?: never;  target?: TextureTargetBacking; volume?: never }
  | { dimension: '3d';       volume: TextureVolume | null;             image?: never;  target?: TextureTargetBacking; images?: never }

ImageBacking extends Entity {                   // ImageBacking.ts:9
  height: number; width: number; version: number;
  kind: TextureBackingKind;                     // <- base is Image*, kind is Texture*
}

TextureBackingKind = string                     // open registry
  'bitmap' | 'compressedImage' | 'image' | 'video' | 'external' | 'renderTexture' | 'volume'
```

Members of the `ImageBacking` family today:

| Type              | Payload                                                                     | Pins its kind?                     |
| ----------------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `Bitmap`          | `data: Uint8ClampedArray`, `format: PixelFormat`, `alphaType`, `colorSpace` | yes — `'bitmap'`                   |
| `CompressedImage` | `compressed: CompressedImageData` (`{container, payload}`)                  | yes — `'compressedImage'`          |
| `ImageResource`   | `source: HostImageSource` (`= CanvasImageSource`)                           | **no** — open `TextureBackingKind` |

## Defects

Each is stated with the evidence that establishes it, so a future reader can re-verify rather than
trust this document.

### D1 — The base type names four of six members

`ImageBacking` is the base, but its own `kind` enum enumerates `'renderTexture'` and `'external'`,
which are not images and never carry a `HostImageSource`. `TextureTargetBacking` also declares
`kind: TextureBackingKind`, so target-side and image-side backings already share one namespace.

The namespace is **correct** — all of these are things a texture samples from. The base type name is
what is too narrow. An earlier draft of this spec proposed splitting the enum into `ImageKind` +
`RenderTargetKind`; that was wrong, and renaming the base removes the discrepancy with no enum
surgery.

### D2 — `ImageResource` fuses three unrelated things

Its `kind` is the open `string` type rather than a pinned literal, so `'image'`, `'video'`, and
`'external'` all inhabit one type whose entire payload is `source: HostImageSource`. But
`HostImageSource = CanvasImageSource` — the DOM's own union of `HTMLImageElement |
HTMLCanvasElement | HTMLVideoElement | ImageBitmap | OffscreenCanvas | VideoFrame`. So the platform
flattens six things into one handle, and Flight's `kind` string exists to re-discriminate what that
union erased.

Consequences, in order of severity:

- **A canvas is indistinguishable from a read-only `<img>`.** `createImageResourceFromCanvas`,
  `createImageResourceFromImageBitmap`, and `createImageResourceFromImageElement` all set
  `kind: ImageTextureBackingKind` (`'image'`). The property that separates a canvas — you can _draw
  into it_ — has no representation anywhere in the model.
- **`'external'` is not an image at all.** It is produced only by `render-gl/src/glExternalTexture.ts`
  and `render-wgpu/src/wgpuExternalTexture.ts`, each registering a texture resolver for a GPU object
  Flight neither uploaded nor owns. Nothing in `packages/image` produces it.
- **Five kinds have no type.** Only `Bitmap` and `CompressedImage` pin a kind with `typeof`.
  `'image'`, `'video'`, `'external'`, `'renderTexture'`, and `'volume'` are strings the type system
  cannot see.

### D3 — A documented invariant the types permit violating

`TextureStorage`'s own comment states: _"CPU-origin content uses `image`; GPU-origin rendered content
uses `target` with no image."_ But `target?` is optional on **every** variant, alonga required
`image` / `images` / `volume`. So `{dimension: '2d', image: X, target: Y}` type-checks, and so does
`{dimension: '2d', image: null}` with no target — a texture with no content.

This is the same class review has pulled two builders up on this week: a documented caller obligation
is a missing guard. Here it needs neither a guard nor a comment — one content field makes both states
unrepresentable.

The `images?: never` / `volume?: never` scaffolding is a symptom: four variants each list four fields,
three of them `never`, to force discrimination that a single unified field would give for free.

### D4 — Constructors assert types that do not exist

| Constructor                                 | Returns                                                              | Is the modifier a type?      |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------- |
| `createVideoTexture(source: VideoResource)` | `Texture`                                                            | no — no `VideoTexture` type  |
| `createRenderTexture(options)`              | `Texture`                                                            | no — no `RenderTexture` type |
| `createCubeTexture(opts?)`                  | `Texture & { storage: Extract<TextureStorage, {dimension:'cube'}> }` | no — no `CubeTexture` type   |
| `createCompressedImage(data)`               | `CompressedImage`                                                    | **yes** — correct            |

A reader of `createVideoTexture` looks for `VideoTexture`, finds nothing, and must read the
implementation to learn it returns a plain `Texture` whose backing has `kind: 'video'`. Meanwhile
`createCubeTexture` writes its return type as a structural intersection — a type that exists but has
no name, so callers cannot declare or narrow to it.

### D5 — No Texture-layer constructor for compressed

`createVideoTexture`, `createRenderTexture`, and `createCubeTexture` all return `Texture`. Compressed
is the only source whose caller must assemble the storage slot by hand, which is why
`functional/scenes/compressed-texture.webgl.ts` writes `image: createCompressedImage({container,
payload})` inline. Every other source has a one-call path to a `Texture`.

### D6 — A CORS failure escapes as a raw platform exception

`createBitmapFromImageSource` (`packages/bitmap/src/bitmapFrom.ts:59`) does a canvas round-trip —
`createElement` → `drawImage` → `getImageData`. On a cross-origin source the canvas is tainted and
`getImageData` throws `SecurityError`. Per the diagnostics conventions a cross-origin image is an
_expected_ failure, not a programmer error, so it should return `null` with a shakeable `explain*`
rather than let a DOM exception escape.

This is independent of the taxonomy and can land on its own.

## Target model

```
Texture                          a sampling view — no kind; a CLOSED union on dimension (== glTF "texture")
├── sampler:     Sampler
├── colorSpace:  TextureColorSpace
├── uvOffset · uvScale · uvRotation · flipX · flipY
├── dimension:   readonly '2d' | '2d-array' | 'cube' | '3d'     set at creation, never mutates
├── source / sources                 exactly ONE content field per variant:
│     '2d'        source:  TextureSource | null
│     '2d-array'  sources: readonly TextureSource[]
│     'cube'      sources: TextureSourceCubeFaces               6-tuple, arity type-enforced
│     '3d'        source:  VoxelGrid | null
└── version

TextureSource                    one open kind namespace, every member pinning its own literal
├── Bitmap           'bitmap'           your bytes, flat RGBA8 — read + write
├── Surface          'surface'          host-managed draw target (canvas / SkSurface / cairo_surface_t)
├── Image            'image'            host handle, sample-only — includes video elements
├── CompressedImage  'compressedImage'  your bytes, GPU block format + mip/layer/face structure
├── RenderTarget     'renderTarget'     GPU-owned, Flight renders into it
├── ExternalTexture  'external'         foreign GPU texture — bound, never uploaded, not owned
└── VoxelGrid        'voxelGrid'        your bytes, 3D — a width×height×depth voxel lattice

Narrowings — names for Texture shapes that already exist, not new data
├── Texture2D     = Texture & { dimension: '2d' }
├── CubeTexture   = Texture & { dimension: 'cube' }
└── RenderTexture = Texture & { source: RenderTarget }
```

There is **no middle layer** between `Texture` and its sources — `TextureStorage` is deleted, not
renamed (see below). `RenderTexture` is a narrowing of `Texture`, **not** a source: you render
_into_ a `RenderTarget`; the `Texture` that samples it _is_ a `RenderTexture`. One object on the
allocation seam, one wrapping view on the sampling seam — the type names the owning role, the
`source` field names the consuming role.

### Why these seven are the members

Two questions place any candidate, and each member differs from the others in its **data**, not
merely its behaviour:

|                   | read/write pixels | draw into | payload                                                             |
| ----------------- | ----------------- | --------- | ------------------------------------------------------------------- |
| `Bitmap`          | yes               | no        | flat `Uint8ClampedArray` + `PixelFormat`                            |
| `Surface`         | via readback      | **yes**   | host-managed drawing object                                         |
| `Image`           | no                | no        | opaque `HostImageSource`                                            |
| `CompressedImage` | no                | no        | `TextureContainer` + payload                                        |
| `RenderTarget`    | via readback      | yes (GPU) | `RenderTargetDescriptor`                                            |
| `ExternalTexture` | no                | no        | foreign GPU handle                                                  |
| `VoxelGrid`       | yes               | no        | flat `Uint8Array` over a width×height×depth lattice + `PixelFormat` |

### `Surface` — one entity, a platform-swappable handle

`Surface` is a named type from the start, minimally realized. It follows the pattern
`HostImageSource` already established: the Flight entity is uniform, and the **host handle inside it**
is a platform-varying alias.

```ts
// Web target aliases the platform's drawable-surface union; native ports replace this alias with
// their own owned surface handle (SkSurface, cairo_surface_t, …). Expands as host backends land.
export type HostSurface = HTMLCanvasElement | OffscreenCanvas;

export interface Surface extends TextureSource {
  readonly kind: typeof SurfaceTextureSourceKind;
  readonly target: HostSurface;
}
```

Both members of the web alias are already live here — `HTMLCanvasElement` broadly, `OffscreenCanvas`
in `glyphatlas` and `image-codec`.

**The union belongs at the alias, not at the Flight entity.** A Flight-level `Surface = CanvasSurface
| SkiaSurface | CairoSurface` would be a union with exactly one inhabitant per build target: a web
bundle would carry type surface for Skia it can never reach, and every consumer would switch on a
discriminant that can only hold one value. If a build genuinely needs two surface backends at once,
the open kind registry is already the escape hatch — a vendor registers `'acme.skiaSurface'` as its
own `TextureSource` kind, exactly as the kind conventions intend.

**Surface is the target, not the context.** The alias names the drawable object
(`HTMLCanvasElement`), not `CanvasRenderingContext2D`. Both reference implementations work this way:
Skia's `SkSurface` hands out an `SkCanvas` via `getCanvas()`, and Cairo's `cairo_surface_t` is what a
`cairo_t` is created from. A context is derived from the surface per draw pass; it is not the thing a
`Texture` samples.

#### Teardown differs by host, and must be designed in now

`HostImageSource`'s contract is that resources never own or free the handle. `Surface` cannot inherit
that unchanged: an `HTMLCanvasElement` is GC-managed with nothing to free, but an `SkSurface` and a
`cairo_surface_t` are non-GC resources requiring explicit release. By the teardown convention that is
`destroySurface` — `destroy*` frees a non-GC resource deterministically and leaves the entity invalid.

So `Surface` ships with `destroySurface` from the start, a no-op on the web backend. Retrofitting it
when the first native port lands would mean changing the lifecycle of a shipped type and revisiting
every call site that never called it.

### Video is not a member

Video dirty-tracking is `version` — the field every source already has. `packages/texture/src/videoTexture.ts`
bumps `image.version` and mirrors it to `texture.version`; there is no separate frame counter (the
only `frameId` in `types/src` is on `Velocity.ts`, unrelated). So "video" is a **cadence**, not a
representation: something calls a function each frame to bump `version`, exactly as a `Surface` being
drawn into or a `Bitmap` being mutated does.

A video element is a `CanvasImageSource`, therefore an ordinary `Image`.
`createTextureFromVideoResource` survives as the convenience that wires up the per-frame bump.

### `Bitmap` and `Image` both exist because the platform forces it

Flash's model — a loaded resource _is_ a `BitmapData` with pixel ops — is not available on the web. A
loaded `<img>` holds pixels in driver memory JS cannot address; obtaining bytes requires the canvas
round-trip in D6, which is a full copy and **can fail outright** on cross-origin content. Fusing the
two would mean either paying that copy for every image loaded, or pretending pixel access exists and
throwing at the point of use.

`Bitmap`'s existing doc already states the decision: _"Bitmap is a sibling of ImageResource rather
than a subtype: converting between raw pixels and a host-drawable image is an explicit allocating
operation."_ Skia keeps the same three-way split (`SkBitmap` / `SkSurface` / `SkImage`), and the web
itself ships both halves (`ImageData` vs `ImageBitmap`). Flash is the outlier, and could afford to be
because it owned decoding end to end. Note that even Flash drew this line — `BitmapData.draw()` threw
`SecurityError` on cross-domain content; it encoded the distinction as a runtime error where Flight
encodes it as a type.

### `CompressedImage` stays a type

Not because of the read restriction — readability is better expressed as a capability query, since a
tainted-canvas `Surface` is unreadable at runtime and no type boundary catches that. It stays because
its **data is differently shaped**: `TextureContainer` carries `format`, `mipLevels`, `layers`,
`faces`, `supercompression`, and per-level byte ranges, where a `Bitmap` is one uncompressed 2D
level. `PixelFormat`'s own doc scopes itself deliberately: _"block-compressed payloads use the
sibling `CompressedImage` backing."_

## Why there is no middle layer

An earlier revision of this spec kept a `TextureStorage` record between `Texture` and its sources,
and 2026-07-30 weighed `TextureContent` / `TextureData` as renames for it. It was **deleted**
instead, on a keep-test it failed three ways:

- **It was never a sharing seam.** `cloneTexture` copies the storage record per texture; only the
  source reference inside is shared. The share point — what region textures, resolver caches, and
  uploads key on — is the source, and always was. No two textures ever held one storage object.
- **It had no independent consumer.** Resolver caches key off the source; materials, sprites, and
  the atlas all take `Texture`. The record existed only to be reached through.
- **Its content was two fields** — `dimension` plus source ref(s). A hop, not a concept.

Flattening also _improves_ shape stability: previously 1 Texture shape + 2 storage shapes on the
read path; now 2 Texture shapes (the `source`/`sources` field-name fork — `dimension`'s value does
not fork hidden classes), fewer objects total, and `readonly dimension` prevents shape-shifting
after creation.

The scene graph's `data.*` quarantine (`texture.data.source`) was considered and rejected: that
pattern earns its hop from forces Texture does not have — an **open** kind registry (user-defined
kinds must not change `Node2D`'s shape) and uniform traversal machinery walking mixed kinds in hot
loops touching only shell fields. Texture's variance is a **closed** four-way `dimension` with a
single-field difference and no traversal machinery. The general rule: open kind families quarantine
variant payload behind `data`; closed unions discriminate inline, as every other closed union in the
SDK does.

One consequence worth exploiting: `SpriteData.texture: Texture` today silently accepts a
cube-storage texture. With the flat union and its narrowings, 2D-consuming APIs can declare
`Texture2D` and the mismatch becomes a compile error instead of a runtime surprise.

Sources are the **floor** of the model: no member is or contains a `Texture`. "Sample what that
texture shows" is expressed as a second view over the same source — views never nest, which is the
type-level form of the composition rule below.

## Texture and TextureAtlas — view and catalog

```
Spritesheet     frames + timing        (over one atlas)
TextureAtlas    named texel regions    (over one page Texture)
Texture         sampling state         (over one source)
TextureSource   the texels
```

`TextureAtlas` holds a page `Texture`, and this is load-bearing, not convenience: the batch
renderers (tilemap, quadbatch, bitmaptext) bind the page through `atlas.texture` — sampler,
colorSpace, GPU resolve — while reading `atlas.regions` per element. Every "sibling" design (atlas
and Texture side by side over a shared source) collapses back into this one: binding needs a
sampler, correct sampling needs a colorSpace, a render-target page on GL needs flipY, minting needs
template state — each need restates one more view field on the atlas until it _is_ a Texture. The
fixed point is holding one.

**Views multiply when sampling state varies; sources multiply when content layers.** A
`TextureAtlas` is many views over one source (many windows, one page). An `ArrayTexture` is one view
over many sources (one sampler, many layers — per-layer sampler/colorSpace/uv would permit states
the GPU cannot honor, the D3 class again). Same two building blocks, multiplied on opposite sides;
neither ever nests a Texture in a Texture.

**Regions are texel rects relative to the page texture's window, and minting composes in pixel
space.** `getTextureAtlasRegionTexture` compiles the page window down to a texel frame (multiply by
source dimensions), composes rects there — closed and exact, including flips and the `rotated`
quarter-turn — and compiles the result back up into the minted view's window. The one configuration
pixel space cannot express is nonzero `uvRotation` on the page: refused with `null` + `explain*`
and an `enable*Guards` warning. uv windows are never composed in uv space — SRT ∘ SRT with nonzero
rotation and non-uniform scale produces shear the representation cannot hold. **Composition happens
in the catalog, never in the view.**

Minting is declared template behavior with nothing inherited silently: `sampler` and `colorSpace`
copy from the page; the window is computed; page flips fold into the computed frame. (The pre-lock
bake was an accidental hybrid — it overwrote `uvOffset`/`uvScale` while silently inheriting flips
and rotation through `cloneTexture` — and is superseded by this rule.)

Beyond correctness this buys a capability: an atlas over a windowed page inside a mega-texture
(packed atlas pages, the direction `binpack`/`glyphatlas` already point) is legal and meaningful.
The identity-window common case costs nothing — relative and absolute coordinates coincide.

Two deliberate limitations, recorded so they are not "fixed":

- **One uv tier.** The window serves both windowing (atlas frames) and tiling/scroll (materials); a
  minted region texture cannot also tile. glTF and Three share the limitation; the escape is mesh
  uvs or a texel copy. Do not add a second transform tier.
- **Flat uv fields on every Texture.** Textures that never window still carry them; making them
  optional would fork the hidden class to save bytes on objects numbering in the hundreds. Stable
  shape over memory, chosen deliberately.

## The narrowing grid

Narrowings are generated by two orthogonal axes — `dimension` (closed, four values) and source kind
(open, seven built-ins) — eleven single-axis cells plus combinations. Three are named; the rest are
**reserved** (recorded here so future demand does not invent a divergent name) or **deliberately
never** (with the reason). Two different rules earn a name, one per axis:

- **A dimension narrowing is earned by signature demand** (rule #2 below): an API that must accept
  only that shape. Internal `dimension === …` branches are discrimination, not demand — the `'3d'`
  upload branches do not earn `Texture3D`; a volumetric material slot would.
- **A source narrowing is earned by a capability difference at the Texture level, not a payload
  difference.** `RenderTarget` changes what you can do with the Texture
  (`renderInto`/`bind`/`destroy`) → `RenderTexture`. `Bitmap`, `Image`, `CompressedImage`, and
  `VoxelGrid` change nothing at the Texture level — each is sampled identically, and renderers
  dispatch on source kind through the open registry, which owns that discrimination.
  `BitmapTexture`/`ImageTexture`/`CompressedTexture` would pull kind-switching up out of the
  registry: **deliberately never**.

| Cell                                                        | Name                | Status                          |
| ----------------------------------------------------------- | ------------------- | ------------------------------- |
| `dimension: '2d'`                                           | `Texture2D`         | locked — M4 adds it             |
| `dimension: 'cube'`                                         | `CubeTexture`       | landed (M2)                     |
| `dimension: '3d'`                                           | `Texture3D`         | reserved                        |
| `dimension: '2d-array'`                                     | `ArrayTexture`      | reserved                        |
| source `RenderTarget`                                       | `RenderTexture`     | landed (M2)                     |
| source `Surface`                                            | `SurfaceTexture`    | reserved (draw-into capability) |
| source `ExternalTexture`                                    | —                   | open question 1 (name squatted) |
| source `Bitmap` / `Image` / `CompressedImage` / `VoxelGrid` | —                   | deliberately never              |
| cube × `RenderTarget`                                       | `CubeRenderTexture` | reserved (render-to-cubemap)    |
| cube × array                                                | `CubeArrayTexture`  | reserved (GPU cube-map arrays)  |

Structural notes a future implementer needs:

- `RenderTexture` is implicitly 2D **structurally**: `'cube'`/`'2d-array'` carry `sources` (no
  `source` field), and the `'3d'` variant's source is `VoxelGrid | null`, which `RenderTarget` does
  not inhabit. Do not widen `RenderTexture` when render-to-cubemap arrives — that is
  `CubeRenderTexture`'s cell.
- `Texture3D` and "voxel-sourced" coincide today (the `'3d'` source is `VoxelGrid | null`); they
  diverge only if 3D render targets arrive. There is no `VoxelTexture`, ever.

### The grammar that names every cell

One syntactic rule covers the whole grid with zero exceptions: **word-qualifiers lead; digit-tags
trail; stacked words keep spoken order.** "Cube texture", "render texture", "array texture", "cube
render texture" — each name is the phrase a graphics programmer already says, with `2D`/`3D`
trailing because an identifier cannot start with a digit and because the SDK's dimensional-tag
family (`Node2D`, `Scene2D`, `Camera2D`) already trails.

D3D's fully-trailing scheme (`TextureCube`, `Texture2DArray`) was considered greenfield and
rejected on the merits: full regularity is unreachable anyway (`TextureRender` is nonsense, so the
source axis must lead regardless), and — decisively — leading-`Texture` position is already
load-bearing as the **part** position under rule #3 (`TextureUvTransform`, `TextureCubeFace`,
`TextureContainer` are parts). `TextureCube` would read as a part of a texture named "cube".
Kind-position (modifier leads) versus part-position (`Texture` leads) is what keeps both families
legible SDK-wide — which validates `CubeTexture`/`RenderTexture` on the merits, not by sunk cost.

## Naming rules established

These generalise beyond this spec and should be extracted to `agents/conventions/function-naming.md`
when the first item lands.

1. **Function names are verb + type + modifier.** The subject slot holds the name of the type
   returned or operated on. A modifier never occupies the subject slot, because doing so silently
   asserts a type exists. `createImageResourceFromBitmap` is the model;
   `createVideoTexture` is the counter-example.
2. **If a constructor's return type needs an intersection or `Extract<>`, the type wants a name.**
   `createCubeTexture`'s signature is a type with no name, which callers cannot declare or narrow to.
3. **Parts of a thing take its prefix; kinds of a thing take its suffix.** `TextureStorage`,
   `TextureUvTransform`, `TextureColorSpace` are parts. `CubeTexture`, `RenderTexture` are kinds.
   Keeping both forms distinct is what makes the two families legible now that both exist.
4. **A union of first-class entities is named for the role, not the containment path.**
   `TextureSource`, not `TextureStorageSource` — `Bitmap` and `Surface` are entities a user creates
   and holds independently, then attaches. Contrast `TextureContainerLevel`, which is genuinely a
   sub-part and earns the longer name.
5. **Name the seam, not the platform.** `HostImage`/`HostImageSource` stay true across ports;
   `ImageElement` would bake a DOM concept into a type a C++ or Haxe port must reimplement with no
   elements in sight.
6. **Kind and type are the same word in two cases.** `'voxelGrid'`/`VoxelGrid`,
   `'renderTarget'`/`RenderTarget`. Splitting them (kind `'volume'`, type `VoxelGrid`) breaks the
   grep-pairing every other member keeps.
7. **Open kind families quarantine variant payload behind `data`; closed unions discriminate
   inline.** The scene graph's `data.*` earns its hop from an open registry plus uniform traversal
   machinery; Texture's closed four-way `dimension` has neither, so its variants live flat.
8. **Word-qualifiers lead; digit-tags trail; stacked words keep spoken order.** `CubeTexture`,
   `RenderTexture`, `CubeRenderTexture`; `Texture2D`, `Texture3D`. See the narrowing grid for the
   derivation and the rejected D3D alternative.

## Migration

Staged so the model can be approved without committing to a big-bang rewrite. Each stage is
independently gateable and leaves the tree green.

| Stage | Change                                                                                                                                                                                 | Notes                                                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1    | `createBitmapFromImageSource` → `null` + `explain*` on tainted source                                                                                                                  | D6; independent of everything else                                                                                                                                                                                                    |
| M2    | Name `CubeTexture` and `RenderTexture` as types                                                                                                                                        | **Landed** (a40e730f1). D4/#2; `createCubeTexture` and `createRenderTexture` become correct untouched. `RenderTexture` also tightens the `renderInto`/`bind`/`destroy` API, moving a class of runtime sentinel checks to compile time |
| M3    | `ImageBacking` → `TextureSource`; `TextureBackingKind` → `TextureSourceKind`; `TextureTargetBacking` → `RenderTarget`; `TextureVolume` → `VoxelGrid` (kind `'volume'` → `'voxelGrid'`) | D1; mechanical rename. Largest site count — `ImageTextureBackingKind` alone has ~32 uses, plus two `imageBacking*TextureCache` fields in `GlRenderState`                                                                              |
| M4    | **Flatten**: delete `TextureStorage`; `Texture` absorbs `readonly dimension` + `source`/`sources` (one content field per variant, hoisted)                                             | D3; deletes the `?: never` scaffolding, adds `Texture2D`, re-expresses `CubeTexture`/`RenderTexture` against the flat shape; 2D-consuming APIs (`SpriteData.texture`, …) may tighten to `Texture2D`                                   |
| M5    | Split `ImageResource` → `Image` + `ExternalTexture`; pin every member's kind with `typeof`                                                                                             | D2; `'external'` moves to a renderer-produced source with its own type                                                                                                                                                                |
| M6    | Introduce `Surface` + `HostSurface` alias + `destroySurface`; reclassify `createImageResourceFromCanvas` → `createSurfaceFromCanvas`                                                   | D2; the only genuinely new construct. Scope is deliberately small — one entity, one alias, one no-op teardown                                                                                                                         |
| M7    | `createVideoTexture` → `createTextureFromVideoResource`; add `createTextureFromCompressedImage`                                                                                        | D4/D5                                                                                                                                                                                                                                 |
| M8    | Add the readability capability query                                                                                                                                                   | pairs with M1                                                                                                                                                                                                                         |
| M9    | Correct `AGENTS.md`, which currently describes `VideoTexture`, `CubeTexture`, and `RenderTexture` as existing types                                                                    | doc drift caused by D4                                                                                                                                                                                                                |

M2 landed 2026-07-30 (a40e730f1). M1 remains independent and safe alone. M3–M5 are the re-shape and
should land as one reviewed sequence — M4 now includes the flatten, so `TextureStorage` is deleted
rather than renamed, and the atlas compose-semantics change (view-and-catalog section above) rides
with M4 since the mint math is where the window/region seam lives. M6 is a design commitment (see
below).

## Open questions

1. **Does `ExternalTexture` want a `Texture` narrowing** the way `RenderTarget` gets `RenderTexture`?
   Nothing currently needs one, and rule #2 above says wait until a signature demands it. Note for
   whoever meets the demand (plausible — WebGPU external textures have per-frame expiry, a genuine
   lifecycle capability): the source already **squats on the name** its narrowing would want, so the
   narrowing must be named from the demand-site's semantics rather than by the `[Kind]Texture`
   pattern.
2. **Should `Sampler` become `TextureSampler`?** Left as `Sampler` here: it is an independent object
   in every GPU API (`GPUSampler`, `VkSampler`), and the prefix would imply it cannot exist apart
   from a texture. Recorded because it was raised and deliberately declined.
3. **Readback as a capability query** — shape not settled. Needed regardless of taxonomy because
   `Surface` readability is a runtime property (CORS tainting), not a static one.

## Decisions log

- **[2026-07-29] `TextureSource`, not `TextureStorageSource`.** Members are first-class entities, not
  sub-parts. User + review.
- **[2026-07-29] Discriminate storage on `dimension`, unify only the content type.** Considered and
  rejected: a flat `sources: TextureSource[]` on every variant, which would allocate an array for the
  common single-source 2D case and lose type-enforced cube arity. Considered and rejected: a
  two-level `TextureSourceStorage | TextureTargetStorage` split, which the six-member union makes
  unnecessary. User + review.
- **[2026-07-29] The kind namespace is not split.** One namespace for all sources is correct; the
  base type name was the defect. Reverses an earlier draft of this spec. User.
- **[2026-07-29] Video is not a type.** `version` already expresses it; video is a cadence, not a
  representation. User.
- **[2026-07-29] `CompressedImage` stays a type.** Differently-shaped data, not merely a read
  restriction. Review, on user challenge.
- **[2026-07-29] `Surface` is in scope now, as a named type with a platform-swappable `HostSurface`
  alias.** Web aliases `HTMLCanvasElement | OffscreenCanvas` and expands as host backends land, exactly
  as `HostImageSource` already does. Considered and rejected: a Flight-level `CanvasSurface |
SkiaSurface | CairoSurface` union, which would have exactly one inhabitant per build target; the open
  kind registry is the escape hatch if a build ever needs two at once. The alias names the drawable
  _target_, not the 2D _context_ — matching `SkSurface`/`SkCanvas` and `cairo_surface_t`/`cairo_t`.
  User + review.
- **[2026-07-29] Surface ownership: Flight never assumes it must free, and never prohibits the caller
  from freeing.** `destroySurface` exists and is caller-invoked only — Flight itself never calls it
  implicitly, including when a `Texture` referencing the surface is disposed. No ownership flag on the
  entity, deliberately: the model is deferred rather than guessed, so nothing has to be unwound later.
  This also matches the standing posture that teardown is something the caller invokes by name and
  nothing happens internally that the caller did not ask for. **Revisit when a second host backend
  lands** (Skia/Cairo) — real non-GC surfaces are what will show whether ownership needs tracking. User.
- **[2026-07-29] `destroySurface` ships with the type, no-op on web.** Canvas is GC-managed but
  `SkSurface`/`cairo_surface_t` are not, so the teardown verb cannot be retrofitted after the type is
  shipped without changing its lifecycle and every existing call site. Review.
- **[2026-07-29] `HostImage`/`Image` over `ImageElement`.** Too narrow (kind `'image'` covers canvas,
  `ImageBitmap`, and `<img>`) and DOM-bound against `HostImageSource`'s stated port contract. Review,
  on user question.
- **[2026-07-30] The storage layer is deleted, not renamed.** `Texture` absorbs `dimension` +
  `source`/`sources` inline. The keep-test it failed: not a sharing seam (`cloneTexture` copies the
  record; the source is the share point), no independent consumer, two fields. Resolves the
  `TextureStorage` → `TextureContent`/`TextureData` naming question by deletion. Full flatten was
  never among the 2026-07-29 rejected options (those were the uniform `sources` array and the
  two-level source/target split, both still rejected). User + chief.
- **[2026-07-30] No `data.*` quarantine on Texture.** `texture.data.source` considered against the
  scene-graph pattern and rejected: `data.*` is earned by open kind families with uniform traversal
  machinery; Texture's `dimension` is a closed, `readonly`, GPU-enumerated four-way. Closed unions
  discriminate inline. User question.
- **[2026-07-30] The content field is `source`; members keep role names.** The `texture.data:
RenderTextureData` scheme was rejected: `.data` already means literal bytes on sources
  (`Bitmap.data`), `*Data` already means authored/parsed blocks (`SpriteData`, `SpritesheetData`,
  `CompressedImageData`), DOM owns `ImageData`, and consumer-derived member names invert the
  first-class-entity rule — a `Bitmap` does not exist for the texture that views it.
  `texture.source: RenderTarget` is one object on two seams: the type names the owning role, the
  field names the consuming role (Unity/Three split the vocabulary identically). User + chief.
- **[2026-07-30] Sources are the floor.** No `TextureSource` member is or contains a `Texture`;
  `RenderTexture` is a Texture narrowing, never a source. A second view over rendered content points
  at the same `RenderTarget`. Views never nest. User question.
- **[2026-07-30] `TextureVolume` → `VoxelGrid`, kind `'voxelGrid'`.** `Volume*` rejected (audio
  volume, geometry's bounding volumes, and "a volume with textures on it" reading); `Voxelmap`
  considered for the `Bitmap`/`Tilemap` -map family but `VoxelGrid` preferred: the established
  volumetric term (OpenVDB grids, voxel-grid filters) and the SDK's own grid = uniform-lattice usage
  (`textureAtlasGrid`, spatial's grid). Kind and type stay grep-paired. User.
- **[2026-07-30] `TextureAtlas` holds a page `Texture` — not a sibling over a shared source.**
  Batch renderers (tilemap, quadbatch, bitmaptext) bind the page through `atlas.texture`; every
  sibling design collapses back by restating view fields one at a time until it is a Texture again.
  User + chief.
- **[2026-07-30] Region minting composes in pixel space; nonzero page `uvRotation` is refused.**
  Regions are texel rects relative to the page window; mint compiles the window to a texel frame,
  composes rects (closed, exact, flips + `rotated` included), and compiles back up. `null` +
  `explain*` + guard warning on a rotated page. Supersedes the accidental overwrite/inherit hybrid.
  uv windows never compose in uv space (SRT ∘ SRT shears). Chief, on user question.
- **[2026-07-30] The narrowing grid is closed by rule, not enumeration.** Dimension narrowings are
  earned by signature demand; source narrowings by a Texture-level capability difference —
  payload-only sources are deliberately never named, because registry dispatch owns that
  discrimination. Reserved against future demand: `Texture3D`, `ArrayTexture`, `SurfaceTexture`,
  `CubeRenderTexture`, `CubeArrayTexture`. User + chief.
- **[2026-07-30] `CubeTexture`, not `TextureCube`.** Re-derived greenfield against D3D's
  fully-trailing scheme rather than kept by sunk cost: leading-`Texture` is the part position (rule
  #3), so a trailing-kind scheme would collide part/kind legibility SDK-wide, and full regularity is
  unreachable regardless (`TextureRender` is nonsense). Word/tag grammar adopted as rule #8. User +
  chief.
