---
package: '@flighthq/image'
status: solid
score: 62
updated: 2026-07-03
ingested:
  - source
  - tests
---

# image — Review

_Migrated from the 2026-07-03 depth-review generation (reviews/depth/image.md)._

**Domain:** Image resource entity layer — the `ImageResource` lifecycle (create, clone, dispose, invalidate, queries), constructors over browser pixel sources, async loading/decoding entry points (URL/bytes/Base64/Blob), and byte-level format identification. Pixel manipulation is explicitly out of scope (owned by `@flighthq/surface`), as is GPU texture ownership (owned per render state).

**Verdict:** solid — completeness 62/100

Extracted from the dissolved `resources` package, this is the data-primitive layer of the image subject, and within that layer it is genuinely well built: the lifecycle functions carry careful ownership comments (clone shares pixels but gives independent identity/version; dispose releases for GC but does not free GPU textures or close ImageBitmaps), the `ImageResource` type in `@flighthq/types` is thoroughly documented with a reserved `compressed` slot already sketched, and the loader family covers the four canonical inputs with AbortSignal support and correct object-URL cleanup. What keeps it from higher is the decode path (HTMLImageElement-only — no `createImageBitmap`, no worker viability), a format sniffer missing AVIF/SVG/ICO, no encode/export direction at all, no data-backed constructor, and no metadata probing. The boundary with `surface` is clean — no pixel ops leaked in — but the loading layer is hard-bound to the DOM with no backend seam, which matters for the Rust port and workers.

## Present capabilities

- **Lifecycle:** `createImageResource(image?)`, `cloneImageResource` (new entity identity + version counter over the *same* pixels — a deliberate, well-documented aliasing contract), `disposeImageResource` (releases `source`/`data` for GC, bumps version), `invalidateImageResource` (monotonic `>>> 0` version bump, the resource-tier analog of `invalidateNodeLocalContent`), `setImageResourceSource` (swap element, re-read size, invalidate).
- **Queries:** `getImageResourceByteSize` (CPU-side `data.byteLength`, 0 for element-only), `hasImageResourceData`, `hasImageResourceSource`, `isImageResourceEmpty`.
- **Wrapping constructors:** `createImageResourceFromCanvas` / `FromImageBitmap` / `FromImageElement`; the generic `createImageResource(CanvasImageSource)` additionally handles `HTMLVideoElement` sizing (`videoWidth`/`videoHeight`).
- **Loading:** `loadImageResourceFromUrl` (crossOrigin passthrough, `img.decode()`, AbortSignal raced against decode), `FromBlob` (object URL with `finally` revoke), `FromBytes` (MIME sniff or explicit type, correct `byteOffset` slicing), `FromBase64` (data-URL composition).
- **Identification:** `detectImageMimeType` — magic-byte sniffing for PNG, JPEG, GIF, WebP (RIFF+WEBP), BMP.
- **Origin:** `isImageResourceSameOrigin` — `data:`/`blob:` fast paths, `URL` resolution against `location`.

Every export has a colocated test; the tests cover the interesting contracts (clone aliasing, object-URL revocation on failure, abort-before-call, byte-offset handling), not just happy paths. Package is `sideEffects: false`, depends only on `entity` + `types`.

## Gaps vs an authoritative image-resource library

Compare the browser's own decode surface (`createImageBitmap`) and the resource layer of a mature engine:

- **No `createImageBitmap` decode path.** All loading funnels through `new Image()` + `decode()`, which requires a DOM document and cannot run in a worker. The modern canonical decode is `createImageBitmap(blob, options)` — worker-safe, with `imageOrientation` (EXIF), `premultiplyAlpha`, and `colorSpaceConversion` controls that map directly onto the resource's `alphaType` field. A `loadImageResourceFromBlob`-via-bitmap variant (or an options bag selecting the decoder) is the single biggest missing capability.
- **No data-backed constructor.** The `ImageResource` doc explicitly describes data-only resources ("a freshly generated `Surface` is data-only"), but this package cannot make one: there is no `createImageResourceFromPixels(data, width, height, format?)`. Today only `surface` can mint the data-only shape, which inverts the layering — the entity layer should own all entity constructors.
- **Format sniffer gaps:** no AVIF/HEIC (ISO BMFF `ftyp` brands — AVIF is mainstream browser content in 2026), no SVG (`<?xml`/`<svg` text sniff — an `HTMLImageElement` decodes it fine), no ICO, no TIFF. Also no `isAnimatedImage` probe (GIF frame count, aPNG `acTL`, animated WebP `ANIM`) — loaders routinely branch on this.
- **No encode/export direction.** `ImageFormat` (`'jpeg' | 'png'`) exists in `@flighthq/types` with zero producers or consumers here — no `encodeImageResourceToBlob(resource, format, quality?)` (canvas `toBlob`) or data-URL export. Image encoding is squarely in the feature target. (If codecs are destined for the planned `image-formats` package per `register.md`, the browser-native `toBlob` wrapper still belongs at this layer; the byte-level codecs go there.)
- **No header-only metadata probe:** `getImageDimensionsFromBytes` (PNG IHDR / JPEG SOFn / GIF logical screen / WebP VP8X) — standard in loaders that want dimensions before committing to a full decode.
- **No EXIF orientation story** at all (see `createImageBitmap` above).
- **No fetch-based load** with progress reporting or explicit HTTP error surfacing; `img.decode()` failures reject with an opaque `EncodingError` and network vs decode failures are indistinguishable.
- **No backend seam.** Unlike the platform suite's `*Backend` pattern, loading and `isImageResourceSameOrigin` hard-reference `Image`, `URL.createObjectURL`, and `location`. The Rust port and any worker/native host need the load layer behind a seam (or the DOM-bound loaders acknowledged as the web fill of one).
- **Minor:** `loadImageResourceFromUrl`'s abort race leaves the underlying fetch running (no `img.src = ''` cancel) and leaks the abort listener on the success path; `crossOrigin` is typed `string` instead of `'anonymous' | 'use-credentials'`.

## Naming / API-shape notes

- `isImageResourceSameOrigin(url: string)` violates the "function name includes the type it operates on" rule — it takes a URL, not an `ImageResource`. `isImageUrlSameOrigin` (or moving it toward a future network/url home) would be self-identifying.
- `detectImageMimeType` returns a raw MIME string while `@flighthq/types` already defines `ImageFormat`; the sniffer and the type should meet (widen `ImageFormat` to the sniffable set, return it here) — header-layer-first.
- `loadImageResourceFromBytes` **throws** on undetectable type. Per the sentinel rule that is an expected failure (arbitrary bytes are valid input), so `null` — or resolving the promise to `null` — fits the SDK convention better than an `Error`.
- `createImageResource(image?)` overlaps the three `createImageResourceFrom*` constructors; keeping the generic one as the video-capable entry is fine, but a `createImageResourceFromVideoElement` would complete the family symmetrically (the union member with the *special* sizing rule is the one without a dedicated constructor).
- Verb usage is otherwise exemplary: `create`/`clone`/`dispose` match the SDK teardown taxonomy precisely, `invalidate` mirrors the node tier, `Readonly<ImageResource>` is applied on every non-mutating parameter, and the durable ownership comments are exactly the kind the style guide asks for.

## Recommendation

Keep the lifecycle core as-is — it is the strongest part and close to final shape. Build out the load/identify layer to authoritative: (1) add a `createImageBitmap`-based decode path with `imageOrientation`/`premultiplyAlpha` options wired to `alphaType`, making loads worker-safe; (2) add `createImageResourceFromPixels` so the entity layer owns the data-only constructor `surface` currently monopolizes; (3) extend `detectImageMimeType` with AVIF/HEIC, SVG, and ICO, and return the (widened) `ImageFormat` type; (4) add `encodeImageResourceToBlob` for the browser-native export path, leaving byte-level codecs to the planned `image-formats` sibling; (5) rename `isImageResourceSameOrigin` and switch the bytes loader to a sentinel. A header-only `getImageDimensionsFromBytes` probe and a backend seam for the load layer are the follow-on steps that would push this toward authoritative.
