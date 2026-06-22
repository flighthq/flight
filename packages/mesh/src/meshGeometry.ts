import { createEntity } from '@flighthq/entity';
import { createAabb } from '@flighthq/geometry';
import type {
  MeshGeometry,
  MeshGeometryRuntime,
  MeshSubset,
  PrimitiveTopology,
  VertexAttributeLayout,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

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

// Deep-copies a MeshGeometry: fresh vertex/index typed arrays, a cloned bounds (or null), and a
// fresh single subset list mirroring the source. The clone carries its own runtime, so GPU
// upload slots are not shared with the source. `version` resets to 0 (a fresh upload target).
export function cloneMeshGeometry(source: Readonly<MeshGeometry>): MeshGeometry {
  const vertices = new Float32Array(source.vertices.length);
  vertices.set(source.vertices);

  let indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null = null;
  if (source.indices) {
    if (source.indices instanceof Uint32Array) {
      indices = new Uint32Array(source.indices.length);
    } else {
      indices = new Uint16Array(source.indices.length);
    }
    indices.set(source.indices);
  }

  const subsets: MeshSubset[] = [];
  for (let i = 0; i < source.subsets.length; i++) {
    subsets.push({ indexCount: source.subsets[i].indexCount, indexOffset: source.subsets[i].indexOffset });
  }

  let bounds = null;
  if (source.bounds) {
    const b = source.bounds;
    bounds = createAabb(b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
  }

  return createMeshGeometryRuntime({
    bounds: bounds,
    indices: indices,
    layout: source.layout,
    subsets: subsets,
    topology: source.topology,
    version: 0,
    vertices: vertices,
  });
}

// Allocates a MeshGeometry from CPU vertex/index data plus a layout. The vertices are taken by
// reference (the caller hands off ownership of the interleaved record stream). Indices, when
// present, are promoted to Uint32 automatically if any vertex index could exceed 65535 — that
// is, when the vertex count derived from the layout stride passes the Uint16 ceiling — so a
// 16-bit index buffer is never silently truncated.
export function createMeshGeometry(options: Readonly<MeshGeometryOptions>): MeshGeometry {
  const vertices = options.vertices;
  const vertexCount = getVertexCountFromLayout(vertices, options.layout);

  let indices: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null = null;
  if (options.indices) {
    indices = promoteIndices(options.indices, vertexCount);
  }

  let subsets = options.subsets;
  if (!subsets) {
    const count = indices ? indices.length : vertexCount;
    subsets = [{ indexCount: count, indexOffset: 0 }];
  }

  return createMeshGeometryRuntime({
    bounds: null,
    indices: indices,
    layout: options.layout,
    subsets: subsets,
    topology: options.topology ?? 'triangle-list',
    version: 0,
    vertices: vertices,
  });
}

// Releases the Gl2 GPU upload slot on a geometry's runtime back to null. The actual GL
// objects (VAO/buffers) are owned and freed by scene-gl through the branded concrete shape;
// this clears the named slot so the next draw re-uploads. Frees a non-GC GPU resource, hence
// destroy*, not dispose*.
export function destroyMeshGeometryGlData(geometry: Readonly<MeshGeometry>): void {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (runtime) runtime.webglData = null;
}

// Releases the Wgpu GPU upload slot on a geometry's runtime back to null. The vertex/index
// GPUBuffers are owned and freed by scene-wgpu through the branded concrete shape; this
// clears the named slot so the next draw re-uploads. Frees a non-GC GPU resource, hence
// destroy*, not dispose*.
export function destroyMeshGeometryWgpuData(geometry: Readonly<MeshGeometry>): void {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (runtime) runtime.webgpuData = null;
}

// Returns the number of indices in the geometry's index buffer, or 0 for non-indexed geometry.
export function getMeshGeometryIndexCount(geometry: Readonly<MeshGeometry>): number {
  return geometry.indices ? geometry.indices.length : 0;
}

// Returns the number of vertices, derived from the interleaved vertex stream and the layout
// stride (stride is in bytes; a Float32 is 4 bytes).
export function getMeshGeometryVertexCount(geometry: Readonly<MeshGeometry>): number {
  return getVertexCountFromLayout(geometry.vertices, geometry.layout);
}

// Allocates a MeshGeometry entity with a runtime carrying empty (null) GPU upload slots. This is
// the single construction point so every MeshGeometry shares the same runtime shape.
function createMeshGeometryRuntime(fields: Readonly<Omit<MeshGeometry, typeof EntityRuntimeKey>>): MeshGeometry {
  const geometry = createEntity({
    bounds: fields.bounds,
    indices: fields.indices,
    layout: fields.layout,
    subsets: fields.subsets,
    topology: fields.topology,
    version: fields.version,
    vertices: fields.vertices,
  }) as MeshGeometry;
  const runtime: MeshGeometryRuntime = { binding: null, webglData: null, webgpuData: null };
  geometry[EntityRuntimeKey] = runtime;
  return geometry;
}

function getVertexCountFromLayout(
  vertices: Readonly<Float32Array<ArrayBuffer>>,
  layout: Readonly<VertexAttributeLayout>,
): number {
  const floatsPerVertex = layout.stride / 4;
  if (floatsPerVertex <= 0) return 0;
  return Math.floor(vertices.length / floatsPerVertex);
}

// Copies an index source into the narrowest typed array that addresses `vertexCount` vertices,
// promoting to Uint32 once the count exceeds the Uint16 ceiling so high indices never truncate.
function promoteIndices(
  source: Readonly<Uint16Array<ArrayBuffer>> | Readonly<Uint32Array<ArrayBuffer>>,
  vertexCount: number,
): Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> {
  if (vertexCount > UINT16_INDEX_CEILING || source instanceof Uint32Array) {
    const out = new Uint32Array(source.length);
    out.set(source);
    return out;
  }
  const out = new Uint16Array(source.length);
  out.set(source);
  return out;
}

const UINT16_INDEX_CEILING = 65535;
