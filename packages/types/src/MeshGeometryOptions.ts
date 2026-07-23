import type { MeshSubset, PrimitiveTopology, VertexAttributeLayout } from './MeshGeometry';

// Inputs to createMeshGeometry. `vertices` is the raw interleaved record stream read through
// `layout`; with no `layout` the canonical PBR vertex record is assumed (see
// CANONICAL_VERTEX_LAYOUT in meshGeometryBuilders). `indices` is omitted for non-indexed
// geometry. `subsets` defaults to a single subset spanning the whole index (or vertex) range.
// `topology` defaults to triangle-list. `bounds` is left null until computed.
export interface MeshGeometryOptions {
  indices?: Readonly<Uint16Array<ArrayBuffer>> | Readonly<Uint32Array<ArrayBuffer>> | null;
  layout: VertexAttributeLayout;
  subsets?: readonly MeshSubset[];
  topology?: PrimitiveTopology;
  vertices: Float32Array<ArrayBuffer>;
}
