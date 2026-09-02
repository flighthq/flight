---
package: '@flighthq/image'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
---

# image -- Review

Full re-review against live source, tests, charter, and status. Supersedes the 2026-08-25 fast re-score and the 2026-07-13 re-verified review.

**Domain:** Image resource entity lifecycle (create, clone, invalidate), constructors over browser pixel sources, async DOM-based loading (URL/bytes/Base64/Blob), embedded/external image resource reference resolution with failure tracking and retry, and a backend seam for host-swappable image loading. Pixel manipulation (`@flighthq/bitmap`), byte-level decode/encode (`@flighthq/image-codec`), and GPU texture upload (render backends) are explicitly out of scope.

**Verdict:** solid -- 78/100

The package has grown substantially since the prior review. Three former Recommended items (abort leak, `crossOrigin` typing, `isImageResourceSameOrigin` rename) all landed, the approved `ImageBackend` seam was built with the `custom > host > sentinel` resolution model and `explain*`/`observe*` diagnostics, and an entire resource-reference resolution system (`imageResourceReference.ts`) was added -- giving the package embedded/external image reference lifecycle, async decode through `@flighthq/image-codec`, bitmap composition, and structured failure tracking. Every export has a colocated test (80 tests, all passing), tests cover contract-interesting paths (clone aliasing, object-URL revocation on failure, abort mid-decode, premultiplied alpha normalization, bitmap composition routing), and the code satisfies SDK conventions well. What keeps it from higher: `loadImageResourceFromBytes` still throws on undetectable MIME type (sentinel violation), `DECODED_ALPHA_TYPE`/`DECODED_GAMUT` are duplicated across two files, the charter is stale on scope and export count, and the reference-resolution system broadens the package's scope beyond what the charter describes.

## Present capabilities

Four source files, four colocated test files, 1526 total lines. 24 public-lane exports, 7 contract-only.

### Entity lifecycle (`imageResource.ts`)

- `createImageResource(image: CanvasImageSource): Image` -- wraps a host element; reads dimensions from the element, handling `HTMLVideoElement` via `videoWidth`/`videoHeight` and all other `CanvasImageSource` types via `width`/`height`.
- `cloneImageResource(resource: Readonly<Image>): Image` -- new entity identity over the same borrowed host handle; independent version counter. Well-commented aliasing contract.
- `invalidateImageResource(resource: Image): void` -- **contract-only**; bumps `version` via `(version + 1) >>> 0`, re-reads host dimensions. Used by canvas/DOM render caches that key on version.
- `createCompressedImage(compressed: Readonly<CompressedImageData>): CompressedImage` -- wraps a parsed block-compressed payload as its own GPU-only TextureSource.
- `isImageResourceEmpty(resource: Readonly<Image>): boolean` -- zero-or-negative dimension check.

### Constructors from DOM sources (`imageResourceFrom.ts`)

- `createImageResourceFromBitmap(bitmap: Readonly<Bitmap>): Image | null` -- routes through `getImageBackend().createImageFromBitmap`; returns `null` when the backend does not implement it (no silent DOM fallback). Tests verify premultiplied-to-straight normalization through the `putImageData` bridge.
- `createImageResourceFromCanvas(canvas: HTMLCanvasElement): Image`
- `createImageResourceFromImageBitmap(bitmap: ImageBitmap): Image`
- `createImageResourceFromImageElement(img: HTMLImageElement): Image`
- `isImageUrlSameOrigin(url: string): boolean` -- `data:`/`blob:` fast paths, `URL` resolution against `location.origin`.

### Async loading (`imageResourceFrom.ts`)

- `loadImageResourceFromUrl(url, crossOrigin?, signal?): Promise<Image>` -- dispatches through `getImageBackend().loadImageFromUrl`. `crossOrigin` properly typed as `'anonymous' | 'use-credentials'`.
- `loadImageResourceFromBlob(blob, signal?): Promise<Image>` -- object-URL lifecycle with `finally` revoke.
- `loadImageResourceFromBytes(bytes: Uint8Array, mimeType?, signal?): Promise<Image>` -- sniffs via `detectImageMimeType` from `@flighthq/image-codec/contract`; handles `byteOffset` slicing correctly.
- `loadImageResourceFromBase64(base64, mimeType, signal?): Promise<Image>` -- data-URL composition.

All four loaders accept `AbortSignal`. The URL loader cancels the pending `img.decode()` by clearing `img.src` on abort and removes its abort listener in a `finally` block. Tests verify both abort-before-call and abort-mid-decode.

### Image resource references (`imageResourceReference.ts`)

A complete async resource-resolution layer added since the prior review. Embedded references carry byte payloads from document parsers; external references name URIs to fetch. The system supports failure tracking, retry, and bitmap composition through registered composers.

- `createEmbeddedImageResourceReference(bytes, mimeType?, alphaType?): EmbeddedImageResourceReference` -- borrows the byte view (no copy); starts unresolved with no subscribers.
- `createExternalImageResourceReference(uri, basePath?): ExternalImageResourceReference`
- `resolveImageResourceReference(ref, fetch, signal): Promise<TextureSource | null>` -- the full lifecycle atom. Embedded references decode through `@flighthq/image-codec` (straight or premultiplied per `ref.alphaType`). External references route through the caller's `ImageResourceFetch` seam. Abort reverts to `Unresolved` and rethrows; thrown errors are caught and recorded as `ImageResourceFailure`. Creates proper `Entity` objects for decoded bitmaps via `createEntity`.
- `resetFailedImageResourceReference(ref): boolean` -- clears a `Failed` reference back to `Unresolved`; leaves other states untouched.
- `createImageResourceFailure(cause: unknown): ImageResourceFailure` -- serialization-safe failure from Error or arbitrary throw.
- `explainImageResourceReferenceResolution(ref): ImageResourceReferenceResolutionExplanation` -- detached plain-data explanation; defensive copy of failure.
- `enableImageBitmapComposition() / disableImageBitmapComposition()` -- tree-shakable opt-in for the decoded-pixel composition hook. A format package calls `enableImageBitmapComposition` beside its composer registrations; without it, the nullable hook leaves the ordinary decode path untouched.

### Backend seam (`imageBackend.ts`)

Follows the approved `custom > host > sentinel` resolution model (Approved 2026-08-21, superseding the lazy-default approach):

- `createWebImageBackend(): ImageBackend` -- **contract-only**; builds the DOM-based backend with `new Image()` + `img.decode()` for URL loading and canvas `putImageData` bridge for bitmap-to-image.
- `getImageBackend(): ImageBackend` -- **contract-only**; returns `custom ?? host ?? sentinel`.
- `setImageBackend(backend: ImageBackend | null): void` -- **contract-only**; app-author seam for custom backends.
- `installImageHostBackend(backend): void` -- **contract-only**; first-host-wins with conflict tracking.
- `observeImageHostResult(operation, succeeded): void` -- **contract-only**; records runtime viability observation.
- `resetImageBackendForTest(): void` -- **contract-only**; clears all slots for test isolation.
- `explainImageBackend(): BackendExplanation` -- public; reports active layer, conflict state, and viability.
- `explainImageOperation(operation: ImageBackendOperation): BackendOperationExplanation` -- public; per-operation support query. Sentinel's `loadImageFromUrl` is reported as `layer: 'sentinel'` not `implemented: true`.
- `hasImageOperation(operation): boolean` -- public; shorthand for `explainImageOperation(op).implemented`.

The sentinel backend rejects with a descriptive error naming `enableHostWebImage()` and `setImageBackend()` as remediation, rather than silently returning null or an empty result. Tests verify that `getImageBackend` caches across calls, that `setImageBackend(null)` restores a usable default, and that `loadImageResourceFromUrl` actually dispatches through the active backend with arguments intact.

Host integration lives in `@flighthq/host-web` (`enableHostWebImage`) which wraps `createWebImageBackend` and calls `installImageHostBackend` + `observeImageHostResult` -- image itself carries no top-level registration.

## Gaps

### Within this package's current scope

- **`loadImageResourceFromBytes` throws on undetectable MIME type.** `imageResourceFrom.ts:87` -- `throw new Error('Unable to determine image type from bytes')`. Arbitrary bytes are valid input, making this an expected failure. The sentinel rule says return `null` (or resolve to `null`). This is parked in the assessment as a breaking change affecting `tileset` and `textureatlas` callers.

- **No teardown for Image entities.** The prior source had `disposeImageResource`; the current source has none. An `Image` holding an `ImageBitmap` cannot call `bitmap.close()`, and there is no documented path for releasing that handle. Whether teardown is needed at this layer (vs bitmap's layer, vs the render-state layer) is unrecorded.

- **No `createImageResourceFromVideoElement`.** `createImageResource(CanvasImageSource)` handles video via the `videoWidth`/`videoHeight` sizing branch, but there is no dedicated constructor for `HTMLVideoElement` matching the pattern of the other three (`FromCanvas`, `FromImageBitmap`, `FromImageElement`). The union member with the special sizing rule is the one without a dedicated constructor.

- **`DECODED_ALPHA_TYPE`/`DECODED_GAMUT` duplicated.** `imageResource.ts:77-78` and `imageResourceFrom.ts:101-102` both declare identical `const DECODED_ALPHA_TYPE = 'straight'` and `const DECODED_GAMUT = 'srgb'`. These should be a single shared constant.

### Beyond current scope (subject-level)

- **Loaders do not route through the codec registry.** `loadImageResourceFromBytes` sniffs via `detectImageMimeType` but still decodes via `Blob` -> object URL -> `new Image()` + `decode()`. The `resolveImageResourceReference` path does use `decodeImage`/`decodeImagePremultiplied` from `@flighthq/image-codec`, so there are now two decode paths: the reference resolver (codec-routed, worker-viable) and the direct loaders (DOM-bound, not worker-viable). Whether the direct loaders should unify with the codec path is the cross-package integration fork noted in the assessment.

- **No data-backed constructor.** No `createImageResourceFromPixels(data, width, height, format?)` at this layer; only `@flighthq/bitmap` can mint data-only images. The charter's Decision #1 scope ceiling is in tension with this.

- **No browser-native encode wrapper.** `encodeImage` exists in `image-codec` for byte-level encode; there is no `encodeImageResourceToBlob(resource, format, quality?)` wrapping canvas `toBlob` at the resource layer.

## Charter contradictions

**No hard contradictions, but two pieces of staleness and one scope tension:**

1. **"What it is" description is stale.** The charter says "18 exports" -- the actual count is 31 (24 public + 7 contract-only). The charter also says "Two halves: `imageResource` and `imageResourceFrom`" -- the package now has four source files, with `imageResourceReference.ts` and `imageBackend.ts` as substantial additions. The description does not mention resource reference resolution or the backend seam.

2. **North star #2 wording is stale.** "Dependencies: entity + types only" -- `package.json` lists `entity`, `image-codec`, and `types`. The `image-codec` dependency was a consequence of executing Decision #3 (sniffer migration), which the charter records, but the North star's dependency claim was not updated.

3. **Boundaries list stale entries.** The "In scope" list includes `detectImageMimeType` which has migrated to `image-codec` per Decision #3. The list does not include the new resource-reference functions (`createEmbeddedImageResourceReference`, `resolveImageResourceReference`, etc.) or the backend seam functions (`explainImageBackend`, `hasImageOperation`, etc.).

4. **Decision #1 scope ceiling vs actual growth.** The charter says "No missing capabilities within this scope" with 18 exports. The package has since gained 13 exports (the entire reference resolution system and the backend seam). These were approved work, not scope creep, but the ceiling decision's premise has changed without amendment.

## Contract and docs fit

**Package fit is strong:**

- Two blessed lanes: `index.ts` (24 public exports) and `contract.ts` (star-exports all 4 source files). No banned subpath exports.
- `sideEffects: false` declared and observed -- no top-level registration, no module-scope listeners or timers.
- Full unabbreviated names on all exports: `createImageResourceFromImageBitmap`, `explainImageResourceReferenceResolution`, `resolveImageResourceReference`.
- `Readonly<>` discipline applied consistently on all non-mutating parameters.
- Sentinel values for expected failures: `createImageResourceFromBitmap` returns `null`, `resolveImageResourceReference` returns `null` on failure. One violation: `loadImageResourceFromBytes` throws.
- All types imported from `@flighthq/types/contract` -- no inline type definitions.
- Entity via `createEntity` from `@flighthq/entity/contract`.
- Colocated `*.test.ts` for every source file; `describe` blocks alphabetized and mirror exported names.
- Durable ownership and aliasing comments in source (e.g. clone aliasing contract, decode alpha semantics, byte view borrowing).

**Fit issues:**

- **Module-scoped mutable state.** `imageBackend.ts` has four module-scope variables (`_custom`, `_host`, `_hostConflict`, `_hostObservation`); `imageResourceReference.ts` has one (`_resolveImageBitmapComposition`). The design constraint says "No `set*Backend` singletons, no module-scoped mutable state that functions reach for." The backend pattern was explicitly approved (Approved 2026-08-08 and superseded 2026-08-21) and matches the `@flighthq/net` model, so this is an acknowledged architectural pattern rather than an accidental violation. The bitmap-composition hook in `imageResourceReference.ts` matches the same `enable*/disable*` opt-in pattern used in signals.

- **`invalidateImageResource` is contract-only.** The charter's Boundaries list it as in scope (implying public), and status.md flags that "the public lane cannot invalidate an image" as an open issue. An app importing `@flighthq/image` can construct and mutate a resource but cannot make the change repaint. Whether this is deliberate is unrecorded.

- **Backend seam is contract-only.** `createWebImageBackend`, `getImageBackend`, `setImageBackend`, `installImageHostBackend`, and `observeImageHostResult` are all absent from `index.ts`. The approved architecture routes the web implementation through `host-web`'s `enableHostWebImage()`, and `setImageBackend` is the app-author seam -- both are contract-only. Whether `setImageBackend` belongs in the public lane (since it is the user-facing API for custom backends) is an unrecorded decision.

**Candidate doc revisions:**

- The codebase-map Package Map Resources section lists `image` without describing its scope. Could read: "image resource entity lifecycle, DOM-based loading, embedded/external reference resolution, and backend seam."
- The prior assessment notes that the Package Map implies image re-exports `detectImageMimeType` -- it does not; the sniffer is imported internally from `@flighthq/image-codec/contract` but not re-exported.

## Candidate open directions

These are questions the charter does not answer that the review had to assume:

1. **Should `setImageBackend` be in the public lane?** It is the app-author entry point for custom backends, but it is contract-only. The `explain*` and `has*` functions are public, which creates a mixed signal: you can query the backend from the public lane but not set it.

2. **Should `invalidateImageResource` be in the public lane?** Without it, an app that mutates a resource's backing element cannot trigger a repaint. The status.md flags this as the top open issue.

3. **What is the teardown story for Image entities?** The prior source had `disposeImageResource`; nothing replaced it. An `ImageBitmap` handle leaks without `close()`.

4. **Should the charter's scope description and Decision #1 be updated to reflect the reference-resolution and backend-seam additions?** The package has grown from "entity lifecycle + DOM loading" to include structured async resolution and a swappable backend layer.

5. **Should the two decode paths (direct loaders via DOM, reference resolver via codec) be unified?** The reference resolver already routes through `@flighthq/image-codec`; the direct loaders do not.
