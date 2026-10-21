# flight-texture

Origin-pinned texture sampling views, sampler state, open source identities, closed hardware
dimensions, cube faces, UV transforms, color-space policy and voxel-grid sources. The crate owns no
image loader, video host or render backend.

## Source and export audit

The pinned `texture/src` package contributes `sampler.ts`, `texture.ts`, `cubeTexture.ts`,
`textureColorSpace.ts` and `voxelGrid.ts` to this crate. Its public lane contains the 42 surviving
functions exported by `index.ts`; the contract lane additionally exposes `initializeSampler`,
`initializeTexture2D`, the D9 string tables and the reviewed texture-owned types. The root keeps
those initializers and enum tables contract-only while exporting D18 Rust sugar.

`Texture` is a closed enum with four named Entity payloads: 2D, 2D array, 3D and cube. The enum has
no second runtime slot. Its 3D payload specifically carries `VoxelGrid`, while 2D, array and cube
slots carry the open `TextureSource` family. `TextureSource.kind` remains `Kind` (`String`), so
vendor keys such as `acme.camera` pass through unchanged; there is no closed kind enum, synthetic
discriminant or erased payload field.

## Identity, copying and revisions

Sampler and UV-vector state is independently cloned. Copy functions retain the destination's
inline sampler/vector storage while copying values. Texture-source references remain shared and
equality compares their exact `Ref` allocation identities, including every array layer and cube
face. Cube slots use the canonical `+X, -X, +Y, -Y, +Z, -Z` order and preserve null slots.

Source and cube-face mutations advance `u32` revisions with wrapping arithmetic and do nothing
when assigned the same reference. Voxel invalidation wraps the same way. Constructors apply the
pinned null/default state and allocate fresh sampling state. UV mutators update the existing
vectors, inverse calculation is safe when its geometry output is reused, and the exact quarter-turn
branches avoid avoidable floating-point residue.

## Deliberate ownership moves

The following pinned exports and their complete same-named `describe` test groups move from
`texture` to `flight-video`: `advanceVideoTexture`, `cloneVideoTexture`, `copyVideoTexture`,
`createVideoTexture`, `destroyVideoTexture`, `getVideoTextureHeight`,
`getVideoTextureInverseUvMatrix`, `getVideoTextureUvMatrix`, `getVideoTextureWidth`,
`initializeVideoImageResource`, `isVideoTextureFrameReady`, `resetVideoTextureFrame` and
`setVideoTextureSource`. This crate defines no compatibility stubs and does not project the video
signatures through `Unknown` or foreign placeholder records.

The following pinned exports and their complete same-named `describe` test groups move to
`flight-render`: `createRenderTexture` and `initializeRenderTextureTarget`. Their owned signature
types `CreateRenderTextureOptions` and `RenderTexture` move there as well. `RenderTargetColorSpace`
does not move: it is owned and implemented here because the texture color-space policy consumes it.

The `resource?: ImageResourceReference | null` member is deliberately removed from every Rust
projection of `CreateTextureOptions` and `CreateTexture2DOptions`; the private
`attachTextureToResource` helper is omitted. That signature edge and the `createTexture2D` test
named “joins the resource it was built against EXACTLY ONCE” move to `flight-image` as
`createTextureFromImageResource`. No `ImageResourceReference`, `Unknown`, attachment field or
synthetic resource discriminant remains in this crate.

## Sugar (D18)

`TextureExt` supplies delegates for the universal first-argument texture operations across every
closed variant. `Texture`, `Texture2D`, `CubeTexture` and `Sampler` expose constructors; sampler and
cube operations have direct delegates; `VoxelGrid` exposes invalidation. All eight closed enums
provide exact `parse` and `to_str` delegates. Fifty-one inline tests compare every method with its
free-function contract; no sampling or revision logic lives in sugar.

## Precision and arrays

The crate uses `f32` throughout and has no `f64` exceptions. Cube faces are a fixed six-element
non-numeric array, 2D-array layers are a growable `Vec`, and voxel bytes are the canonical owned
`Box<Uint8Array>` typed-array representation. No array or precision waiver is needed.

## Verification

The mirrored suites contain 60 integration tests plus 51 inline sugar comparisons. They cover all
owned free functions, enum tables, null/default behavior, source identity, fresh clone state,
destination storage preservation, open kind strings, cube ordering, color-space pairs, numeric UV
edges and u32 rollover. Video, render and resource-attachment cases are excluded only by the
explicit final-owner moves above.
