# Texture Source Model

_Design spec. Settled with the user 2026-07-29 (review). Not yet implemented — no code in this
repository follows the target model. Read this before touching `Texture`, `TextureStorage`,
`ImageBacking`, or any `create*Texture` / `create*Image*` constructor._

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

| Type | Payload | Pins its kind? |
| --- | --- | --- |
| `Bitmap` | `data: Uint8ClampedArray`, `format: PixelFormat`, `alphaType`, `colorSpace` | yes — `'bitmap'` |
| `CompressedImage` | `compressed: CompressedImageData` (`{container, payload}`) | yes — `'compressedImage'` |
| `ImageResource` | `source: HostImageSource` (`= CanvasImageSource`) | **no** — open `TextureBackingKind` |

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
  `kind: ImageTextureBackingKind` (`'image'`). The property that separates a canvas — you can *draw
  into it* — has no representation anywhere in the model.
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

| Constructor | Returns | Is the modifier a type? |
| --- | --- | --- |
| `createVideoTexture(source: VideoResource)` | `Texture` | no — no `VideoTexture` type |
| `createRenderTexture(options)` | `Texture` | no — no `RenderTexture` type |
| `createCubeTexture(opts?)` | `Texture & { storage: Extract<TextureStorage, {dimension:'cube'}> }` | no — no `CubeTexture` type |
| `createCompressedImage(data)` | `CompressedImage` | **yes** — correct |

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
*expected* failure, not a programmer error, so it should return `null` with a shakeable `explain*`
rather than let a DOM exception escape.

This is independent of the taxonomy and can land on its own.

## Target model

```
Texture                          a sampling view — no kind (== glTF "texture")
├── sampler:     Sampler
├── colorSpace:  TextureColorSpace
├── uvOffset · uvScale · uvRotation · flipX · flipY
├── storage:     TextureStorage
└── version

TextureStorage                   discriminated on dimension; exactly ONE content field per variant
├── { dimension: '2d';       source:  TextureSource }
├── { dimension: '2d-array'; sources: readonly TextureSource[] }
├── { dimension: 'cube';     sources: TextureSourceCubeFaces }   6-tuple, arity type-enforced
└── { dimension: '3d';       source:  TextureSource }            a volume source

TextureSource                    one open kind namespace, every member pinning its own literal
├── Bitmap           'bitmap'           your bytes, flat RGBA8 — read + write
├── Surface          'surface'          host-managed draw target (canvas / SkSurface / cairo_surface_t)
├── Image            'image'            host handle, sample-only — includes video elements
├── CompressedImage  'compressedImage'  your bytes, GPU block format + mip/layer/face structure
├── RenderTarget     'renderTarget'     GPU-owned, Flight renders into it
├── ExternalTexture  'external'         foreign GPU texture — bound, never uploaded, not owned
└── TextureVolume    'volume'           3D voxel source (already a type; joins the union)

Narrowings — names for structure that already exists, not new data
├── CubeTexture   = Texture & { storage: { dimension: 'cube' } }
└── RenderTexture = Texture & { storage: { source: RenderTarget } }
```

### Why these six-plus-one are the members

Two questions place any candidate, and each member differs from the others in its **data**, not
merely its behaviour:

|  | read/write pixels | draw into | payload |
| --- | --- | --- | --- |
| `Bitmap` | yes | no | flat `Uint8ClampedArray` + `PixelFormat` |
| `Surface` | via readback | **yes** | host-managed drawing object |
| `Image` | no | no | opaque `HostImageSource` |
| `CompressedImage` | no | no | `TextureContainer` + payload |
| `RenderTarget` | via readback | yes (GPU) | `RenderTargetDescriptor` |
| `ExternalTexture` | no | no | foreign GPU handle |
| `TextureVolume` | — | — | voxel extent |

### Video is not a member

Video dirty-tracking is `version` — the field every source already has. `packages/texture/src/videoTexture.ts`
bumps `image.version` and mirrors it to `texture.version`; there is no separate frame counter (the
only `frameId` in `types/src` is on `Velocity.ts`, unrelated). So "video" is a **cadence**, not a
representation: something calls a function each frame to bump `version`, exactly as a `Surface` being
drawn into or a `Bitmap` being mutated does.

A video element is a `CanvasImageSource`, therefore an ordinary `Image`.
`createTextureFromVideoResource` survives as the convenience that wires up the per-frame bump.

### `Bitmap` and `Image` both exist because the platform forces it

Flash's model — a loaded resource *is* a `BitmapData` with pixel ops — is not available on the web. A
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

## Migration

Staged so the model can be approved without committing to a big-bang rewrite. Each stage is
independently gateable and leaves the tree green.

| Stage | Change | Notes |
| --- | --- | --- |
| M1 | `createBitmapFromImageSource` → `null` + `explain*` on tainted source | D6; independent of everything else |
| M2 | Name `CubeTexture` and `RenderTexture` as types | D4/#2; `createCubeTexture` and `createRenderTexture` become correct untouched. `RenderTexture` also tightens the `renderInto`/`bind`/`destroy` API, moving a class of runtime sentinel checks to compile time |
| M3 | `ImageBacking` → `TextureSource`; `TextureBackingKind` → `TextureSourceKind`; `TextureTargetBacking` → `RenderTarget` | D1; mechanical rename. Largest site count — `ImageTextureBackingKind` alone has ~32 uses, plus two `imageBacking*TextureCache` fields in `GlRenderState` |
| M4 | Collapse `image`/`images`/`volume`/`target?` into one `source`/`sources` per variant | D3; deletes the `?: never` scaffolding |
| M5 | Split `ImageResource` → `Image` + `ExternalTexture`; pin every member's kind with `typeof` | D2; `'external'` moves to a renderer-produced source with its own type |
| M6 | Introduce `Surface`; reclassify `createImageResourceFromCanvas` | D2; the only genuinely new construct here |
| M7 | `createVideoTexture` → `createTextureFromVideoResource`; add `createTextureFromCompressedImage` | D4/D5 |
| M8 | Add the readability capability query | pairs with M1 |
| M9 | Correct `AGENTS.md`, which currently describes `VideoTexture`, `CubeTexture`, and `RenderTexture` as existing types | doc drift caused by D4 |

M1 and M2 are safe to take first and buy real value alone. M3–M5 are the re-shape and should land as
one reviewed sequence. M6 is a design commitment (see below).

## Open questions

1. **Is `Surface` in scope now, or reserved?** It is the only new concept in this spec. Canvas-as-
   `Surface` is straightforward on web; the question is whether the draw-into API lands in this pass
   or whether the type is reserved with canvas continuing to arrive as `Image` until a consumer needs
   it. Reserving is defensible; leaving it unmodelled is what produced D2.
2. **Does `ExternalTexture` want a `Texture` narrowing** the way `RenderTarget` gets `RenderTexture`?
   Nothing currently needs one, and rule #2 above says wait until a signature demands it.
3. **Should `Sampler` become `TextureSampler`?** Left as `Sampler` here: it is an independent object
   in every GPU API (`GPUSampler`, `VkSampler`), and the prefix would imply it cannot exist apart
   from a texture. Recorded because it was raised and deliberately declined.
4. **Readback as a capability query** — shape not settled. Needed regardless of taxonomy because
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
- **[2026-07-29] `HostImage`/`Image` over `ImageElement`.** Too narrow (kind `'image'` covers canvas,
  `ImageBitmap`, and `<img>`) and DOM-bound against `HostImageSource`'s stated port contract. Review,
  on user question.
