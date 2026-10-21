# flight-image

Portable host-image resources, encoded image references, and their texture-source lifecycle.

The crate performs no native image, browser, renderer, or decoder work itself. Host operations and
source measurement arrive through explicit capabilities and caller-owned resolver state.

## Ownership and source audit

The pinned `image/src` package contributes `imageResource.ts`, `imageResourceFrom.ts`,
`imageResourceReference.ts`, `imageSourceDimensions.ts` and the portable dimension test helper.
The public lane mirrors `index.ts`; construction initializers, resolver registration, enum string
tables and the test helper remain contract-only. Image-owned declarations formerly centralized in
the TypeScript types package live here, while decode capability records remain in
`flight-image-codec`, raw bitmaps and the opaque host source live in `flight-bitmap`, texture views
live in `flight-texture`, and drawable surfaces live in `flight-surface`.

`ImageResourceFetch` is image-owned because this is the lowest package that names both its external
reference input and image-resource output. Higher scene-resource packages import that callback
contract rather than copying it.

## Resources and identities

`ImageResource` and `CompressedImageResource` compose canonical `TextureSourceFields` and implement
the open texture-source family with the exact `image` and `compressedImage` registry keys. Cloning
an image resource allocates a distinct entity while retaining the same opaque host-source identity.
Compressed wrappers retain their immutable container/payload record by `Arc`, and typed-array
payloads remain shared by `Ref`.

Host-source dimensions are resolved only through an explicit `ImageResolverState`. Registrations
are last-wins, unregistration affects only the caller's state, a declined resolver leaves the out
record untouched, and invalidation wraps the `u32` revision after remeasurement.

## Portable host loading

`HostImageCapability` carries the canonical provider identity, optional synchronous Bitmap and
Surface bridges, and one required asynchronous URL loader. Base64, Blob and byte loaders all funnel
through that URL callback. Blob and byte inputs become data URLs in portable code; no DOM object
URL, native decoder, canvas, renderer or filesystem operation is performed here. Blob provider
rejections retain canonical `Unknown` values, abort is checked before and after the asynchronous
read, and the exact cloned AbortSignal state crosses the host callback.

Same-origin classification accepts explicit caller context instead of reading global `location`.
Data and blob URLs are local, relative URLs resolve against the supplied href, and malformed inputs
retain the source's conservative same-origin result.

## Reference and texture lifecycle

Embedded references retain the exact encoded byte allocation, requested alpha representation and
optional plain composition payload. External references retain URI and base path. Both are entities
with the shared resource lifecycle, detached serialization-safe failures and exact waiting-texture
handles. Resolver registration is caller-owned; executable composition callbacks never enter the
plain reference data.

The D8 attachment edge moved down from texture as `createTextureFromImageResource`. Each call
creates one 2D texture and joins it to the reference exactly once, keeping `flight-texture`
independent of image references.

## Rust conveniences

D18 methods delegate to the free-function contract for resource construction and mutation,
reference construction and diagnostics, host loading, resolver registration, same-origin checks and
texture attachment. Closed image enums provide exact case-sensitive `parse` and `to_str` delegates;
no method contains independent domain logic.
