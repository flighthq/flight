---
package: '@flighthq/image'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - source
  - tests
---

# image — Review

_LIGHT re-verification 2026-07-13 of the 2026-07-03 depth review; exports and loader source re-checked against the live tree. The major event since the last pass: `@flighthq/image-codec` now exists (charter Decision #2 executed) and `detectImageMimeType` has migrated there (Decision #3 executed) — image imports it, no longer defines or exports it._

**Domain:** Image resource entity layer — the `ImageResource` lifecycle (create, clone, dispose, invalidate, queries), constructors over browser pixel sources, and async DOM-based loading entry points (URL/bytes/Base64/Blob). Pixel manipulation is explicitly out of scope (owned by `@flighthq/surface`), byte↔pixel decode/encode and format identification are now owned by `@flighthq/image-codec`, and GPU texture ownership stays per render state.

**Verdict:** solid — 68/100

Extracted from the dissolved `resources` package, this is the data-primitive layer of the image subject, and within that layer it is genuinely well built: the lifecycle functions carry careful ownership comments (clone shares pixels but gives independent identity/version; dispose releases for GC but does not free GPU textures or close ImageBitmaps), the `ImageResource` type in `@flighthq/types` is thoroughly documented with a reserved `compressed` slot already sketched, and the loader family covers the four canonical inputs with AbortSignal support and correct object-URL cleanup. The charter declares this package at its natural scope ceiling (Decision #1), and with `image-codec` built the biggest prior subject-level gaps (no DOM-free decode/encode direction, sniffer ownership) have moved to the neighbor where the charter routes them. What keeps this package from higher within its own scope: the URL loader's abort race leaves the underlying fetch running and leaks its listener on success, `crossOrigin` is untyped `string`, `loadImageResourceFromBytes` throws where the sentinel rule wants `null`, `isImageResourceSameOrigin` is misnamed for what it takes, image's own loaders remain HTMLImageElement-bound and do not route through the codec registry, and there is still no data-backed constructor (`createImageResourceFromPixels`) at the entity layer.

## Present capabilities

- **Lifecycle:** `createImageResource(image?)`, `cloneImageResource` (new entity identity + version counter over the *same* pixels — a deliberate, well-documented aliasing contract), `disposeImageResource` (releases `source`/`data` for GC, bumps version), `invalidateImageResource` (monotonic `>>> 0` version bump, the resource-tier analog of `invalidateNodeLocalContent`), `setImageResourceSource` (swap element, re-read size, invalidate).
- **Queries:** `getImageResourceByteSize` (CPU-side `data.byteLength`, 0 for element-only), `hasImageResourceData`, `hasImageResourceSource`, `isImageResourceEmpty`.
- **Wrapping constructors:** `createImageResourceFromCanvas` / `FromImageBitmap` / `FromImageElement`; the generic `createImageResource(CanvasImageSource)` additionally handles `HTMLVideoElement` sizing (`videoWidth`/`videoHeight`).
- **Loading:** `loadImageResourceFromUrl` (crossOrigin passthrough, `img.decode()`, AbortSignal raced against decode), `FromBlob` (object URL with `finally` revoke), `FromBytes` (MIME sniff or explicit type, correct `byteOffset` slicing), `FromBase64` (data-URL composition).
- **Identification (moved):** `detectImageMimeType` now lives in `@flighthq/image-codec`; image imports it inside `loadImageResourceFromBytes` and does **not** re-export it from its barrel (`index.ts` re-exports only `imageResource` + `imageResourceFrom`).
- **Origin:** `isImageResourceSameOrigin` — `data:`/`blob:` fast paths, `URL` resolution against `location`.

Every export has a colocated test; the tests cover the interesting contracts (clone aliasing, object-URL revocation on failure, abort-before-call, byte-offset handling), not just happy paths. Package is `sideEffects: false`, depends on `entity` + `image-codec` + `types` (the codec dependency is new since the last review; it slightly widens the bottleneck footprint the charter's North star #2 wants minimal, though `sideEffects: false` keeps the unused registry code shakeable).

## Gaps vs an authoritative image-resource library

The image *subject* is now split across image (entity + DOM loading) and `image-codec` (byte↔pixel seam, sniffing, decode/encode registries). Gaps that migrated with the sniffer/codec — AVIF/SVG/ICO sniff coverage, header-only dimension probes, `isAnimatedImage`, EXIF orientation, byte-level encode — belong to the `image-codec` cell now. What remains at *this* layer:

- **Loaders do not route through the codec registry.** `loadImageResourceFromBytes` sniffs via the codec's `detectImageMimeType` but still decodes via Blob → object URL → `new Image()` + `decode()` — DOM-bound, not worker-viable. Whether image's loaders should dispatch through `decodeImage`/the registered `createImageBitmap` web decoders (making loads worker-safe and wiring `premultiplyAlpha` to `alphaType`) is the open integration fork between the two packages.
- **No data-backed constructor.** The `ImageResource` doc explicitly describes data-only resources ("a freshly generated `Surface` is data-only"), but this package cannot make one: there is no `createImageResourceFromPixels(data, width, height, format?)`. Today only `surface` can mint the data-only shape, which inverts the layering — the entity layer should own all entity constructors. (Sits in tension with charter Decision #1's scope ceiling.)
- **No browser-native export.** `encodeImage` now exists in `image-codec` for the byte-level direction, but there is still no `encodeImageResourceToBlob(resource, format, quality?)` (canvas `toBlob`) wrapper at the resource layer; the charter currently routes all encode to the codec.
- **No fetch-based load** with progress reporting or explicit HTTP error surfacing; `img.decode()` failures reject with an opaque `EncodingError` and network vs decode failures are indistinguishable.
- **No backend seam.** Loading and `isImageResourceSameOrigin` hard-reference `Image`, `URL.createObjectURL`, and `location`. `image-codec` provides the DOM-free seam for decode/encode, but image's own load layer remains the acknowledged web fill without a formal `*Backend`.
- **Minor (verified still present 2026-07-13):** `loadImageResourceFromUrl`'s abort race leaves the underlying fetch running (no `img.src = ''` cancel) and leaks the abort listener on the success path; `crossOrigin` is typed `string` instead of `'anonymous' | 'use-credentials'`.

## Naming / API-shape notes

- `isImageResourceSameOrigin(url: string)` (still exported as of 2026-07-13) violates the "function name includes the type it operates on" rule — it takes a URL, not an `ImageResource`. `isImageUrlSameOrigin` (or moving it toward a future network/url home) would be self-identifying.
- `loadImageResourceFromBytes` **throws** on undetectable type (verified: `throw new Error('Unable to determine image type from bytes')`). Per the sentinel rule that is an expected failure (arbitrary bytes are valid input), so `null` — or resolving the promise to `null` — fits the SDK convention better than an `Error`.
- `createImageResource(image?)` overlaps the three `createImageResourceFrom*` constructors; keeping the generic one as the video-capable entry is fine, but a `createImageResourceFromVideoElement` would complete the family symmetrically (the union member with the *special* sizing rule is the one without a dedicated constructor).
- Verb usage is otherwise exemplary: `create`/`clone`/`dispose` match the SDK teardown taxonomy precisely, `invalidate` mirrors the node tier, `Readonly<ImageResource>` is applied on every non-mutating parameter, and the durable ownership comments are exactly the kind the style guide asks for.

## Charter contradictions

None found — and two prior Decisions (#2 image-codec neighbor, #3 sniffer migration) have been executed in source. The only soft tension: North star #2 says "dependency footprint light (entity + types only)" while package.json now also depends on `@flighthq/image-codec` — a consequence of Decision #3 the charter's North-star wording hasn't caught up with.

## Contract & docs fit

- Contract fit is strong: single root export, `sideEffects: false`, full unabbreviated names, `Readonly<>` discipline, sentinels except the one throw noted above, colocated tests for every export.
- **Stale doc claim:** the codebase-map Package Map says image "re-exports `detectImageMimeType` from image-codec" — it does not; the barrel exports only `imageResource` + `imageResourceFrom` and the sniffer is an internal import. Candidate revision: either add the re-export or fix the map line.
- The charter's "What it is" line ("18 exports … Dependencies: entity, types") is stale on both counts (17 exports; deps now include image-codec) — candidate charter touch-up next direction session.

## Candidate open directions

- Should image's loaders dispatch through the `image-codec` registry (worker-safe decode, `premultiplyAlpha`→`alphaType`) or stay a parallel DOM path? This is the successor to the old "createImageBitmap decode path" question now that the codec exists.
- `createImageResourceFromPixels` vs Decision #1's scope ceiling.
- Whether the resource-layer `toBlob` export wrapper is in or out of scope.
