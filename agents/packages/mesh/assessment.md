---
package: '@flighthq/mesh'
updated: 2026-07-22
basedOn: ./review.md
---

# mesh — Assessment

See [charter](./charter.md) for blessed direction.

## Depth gaps

1. **Make the interleaved vertex stream byte-native.** `MeshGeometry.vertices` is documented and
   uploaded as raw records described by byte offsets and packed formats, but its public type remains
   `Float32Array` and many authoring operations still derive record counts and copies through float
   elements. Use an owned byte view/record stream at the bedrock boundary; keep the canonical
   12-float PBR record as a convenience constructor above it. Clone, merge, deindex, weld, validation,
   deformation, and upload must use `byteLength` plus the declared layout so packed records are never
   reinterpreted as a float array merely to fit the container type.
2. **Make every declared vertex channel usable end to end.** Typed read/edit support now covers `uv1`,
   `color0`, `joints0`, and `weights0` across float, packed integer, and normalized storage, and layout
   conversion preserves or converts those declared encodings by semantic. Importers
   still need to preserve those encodings instead of eagerly expanding common data. The format
   vocabulary itself is not yet sufficient for common packed sources: two-component uint/unorm UVs,
   16-bit normalized colors/weights, and signed-normalized quantized normals/tangents have no truthful
   `VertexFormat`. Add only the needed arities/encodings, with format-aware edit, GL binding, and raster
   proof; secondary influence channels remain a separate semantic-depth item.
3. **Complete topology-editing primitives.** Exact full-record welding, explicit index conversion,
   deindexing, validation, index-width selection, and unused-vertex compaction now exist as separate
   atoms. Tolerance/semantic welding, subset split/merge/edit operations, and topology conversion remain.
4. **Deepen normal/tangent/UV authoring.** Add angle-threshold smoothing/split normals, robust tangent generation across seams, and basic planar/box/spherical UV projection as independent functions.
5. **Realize instancing and LOD instead of leaving header-only types.** Instance records need a
   contiguous versioned entity rather than `Matrix4[]`; LOD selection must be per prepared view rather
   than the node-global `activeLevelIndex`. These compose through scene preparation, GL, bounds, and
   picking. Keep a full simplifier as later tooling rather than blocking authored level primitives.

## Recommended

1. **Extract the shared `vertexFormat.ts` primitive.** `meshGeometryLayout.ts` and
   `meshGeometryAttributes.ts` each define their own `getVertexFormatByteLength` /
   `getVertexFormatComponentCount` / read-write-component switch over the same 6-member `VertexFormat`
   union — eight functions, two copies — and they have already drifted cosmetically (`/0xff` vs `/255`,
   inline clamp vs a `clamp()` helper). This is the decomposition smell: the byte-native vertex-format
   is a bedrock primitive silently bundled by two files, so any future format (`snorm8x4`, half-float)
   is a two-site edit with a correctness-drift trap. Extract one `vertexFormat.ts` both files import;
   pure and `sideEffects:false`, so DCE keeps zero bundle cost. Sweep-safe, within-package.
   _(User-approved 2026-07-22.)_
2. **Stop allocating a `DataView` + object literal per packed-channel accessor call.**
   `getAttributeByteLocation` (`meshGeometryAttributes.ts`) does `new DataView(...)` **and** returns a
   fresh `{attribute, byteOffset, view}` on every `get/setMeshGeometryVertexColor0/Joints0/Weights0`,
   while the float fast-paths read straight off the `Float32Array` with zero allocation. The charter's
   north star promises out-param accessors "safe for hot-loop reuse"; read components directly via a
   reused/cached view (or an inline byte offset) and return the location by out-param, not a per-call
   object. (Only consumer today is the once-per-geometry skin bind-pose capture, so it is transient
   capture-time garbage, not per-frame — but the accessor is a general primitive.)
3. **Add a metadata-only geometry clone for weld/compact/expand.** `weldMeshGeometryVertices`,
   `compactMeshGeometryVertices`, and `expandMeshGeometryIndices` each `cloneMeshGeometry` (deep-copying
   `vertices` *and* `indices`) purely to carry layout/subsets/topology/bounds, then overwrite both
   arrays — one wasted full vertex-buffer allocation per op. Add `cloneMeshGeometryMetadata` (copies
   descriptors + fresh runtime, not the big arrays) and build these three on it; `indexMeshGeometryVertices`
   legitimately keeps `vertices` and can stay on the full clone.

Already clean: the copied `getMeshGeometryVertexNormal` position/semantic comment is corrected;
logical triangle decoding is one allocation-free primitive shared by consumers (indexed/non-indexed
lists and alternating-winding strips resolve consistently, out-of-range queries leave caller output
untouched); `refreshMeshGeometryBounds` allocates an AABB once and refreshes in place; logical
triangle-to-subset identity is one topology-aware primitive consumed by picking, not re-derived from
list-only offsets. `VertexFormat` is correctly a **closed union**, not a registry — it is a bounded
GPU-hardware set, so the closed-system exception applies; the finding above is duplication, not the
union choice.

## Approved

- [2026-07-21 · completed] The declared `uv1`, `color0`, `joints0`, and `weights0` semantics have
  separately importable caller-owned-output getters and in-place setters. Packed uint8/uint16 and
  unorm8 values decode and encode through the same byte-accurate contract, failed queries do not
  mutate output, and successful edits advance geometry version exactly once.
- [2026-07-21 · completed] Indexed conversion and exact welding are independent operations. Sequential
  indexing preserves vertex identity; welding compares the complete raw record (including packed
  channels/padding), remaps indexed or non-indexed element streams, preserves topology/subsets/bounds,
  and chooses the narrowest safe index width. Deindex likewise preserves subset ranges and cached
  bounds while detaching storage; validation completes the base loop.
- [2026-07-22 · completed] `PrimitiveTopology` is now draw-authoritative in GL for line/triangle
  lists and strips plus point lists, including non-indexed geometry. This closes the runtime half of
  the topology contract; format importers still owe honest mapping/conversion for source modes that do
  not have a direct Flight topology.
- [2026-07-22 · completed] Unused-vertex compaction is independent from welding: indexed geometry is
  remapped in first-reference order, complete packed records and draw metadata survive, the result uses
  the narrowest valid index width, and malformed or non-indexed input returns an unchanged deep clone.
- [2026-07-22 · completed] Layout conversion no longer zero-fills packed channels or reads beyond a
  smaller source arity. Same-format attributes copy byte-exactly; float, uint8/uint16, and unorm8
  channels convert component values by semantic, with absent channels/components remaining zero.
- [2026-07-22 · picked] Extract the shared `vertexFormat.ts` primitive so the byte-length/component-
  count/read-write-component switch is not duplicated (and drifting) across `meshGeometryLayout.ts` and
  `meshGeometryAttributes.ts` — assessment.md#recommended item 1. Blessed, not yet implemented.

## Backlog

- Angle-threshold smooth normals.
- Projection UV unwrapping.
