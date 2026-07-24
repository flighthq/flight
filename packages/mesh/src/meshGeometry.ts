import { createEntity } from '@flighthq/entity';
import { createAabb } from '@flighthq/geometry';
import type {
  MeshGeometry,
  MeshGeometryOptions,
  MeshGeometryRuntime,
  MeshMorphBindPose,
  MeshSkinBindPose,
  MeshSubset,
  VertexAttributeLayout,
} from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

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

// Returns the CPU-morph base pose cached on the geometry's runtime, or null before the first morph
// capture. The morph deform subsystem (mesh/scene) owns this slot; a non-morphed geometry never fills
// it, so plain meshes pay nothing. Sibling of getMeshGeometrySkinBindPose.
export function getMeshGeometryMorphBindPose(geometry: Readonly<MeshGeometry>): MeshMorphBindPose | null {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  return runtime ? runtime.morphBindPose : null;
}

// Returns the CPU-skinning bind pose cached on the geometry's runtime, or null before the first
// skin capture. The deform subsystem (skeleton3d/scene) owns this slot; a rigid geometry never
// fills it, so plain meshes pay nothing.
export function getMeshGeometrySkinBindPose(geometry: Readonly<MeshGeometry>): MeshSkinBindPose | null {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  return runtime ? runtime.skinBindPose : null;
}

// Returns the number of vertices, derived from the interleaved vertex stream and the layout
// stride (stride is in bytes; a Float32 is 4 bytes).
export function getMeshGeometryVertexCount(geometry: Readonly<MeshGeometry>): number {
  return getVertexCountFromLayout(geometry.vertices, geometry.layout);
}

// Returns true when the geometry's vertex layout carries the joints0 skinning channel — the signal
// that it can be skeletally deformed (CPU via skinMeshGeometry, or the GPU HAS_SKIN shader variant).
// The renderer selects the skinned program variant off this, exactly as it would off uv1.
export function hasMeshGeometrySkin(geometry: Readonly<MeshGeometry>): boolean {
  const attributes = geometry.layout.attributes;
  for (let i = 0; i < attributes.length; i++) {
    if (attributes[i].semantic === 'joints0') return true;
  }
  return false;
}

// Stores (or clears, with null) the CPU-morph base pose on the geometry's runtime. Called once by the
// morph deform glue when a morphed geometry is first captured; pass null to force a recapture (e.g.
// after the vertex layout or base data changes). Sibling of setMeshGeometrySkinBindPose.
export function setMeshGeometryMorphBindPose(
  geometry: Readonly<MeshGeometry>,
  bindPose: MeshMorphBindPose | null,
): void {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (runtime) runtime.morphBindPose = bindPose;
}

// Stores (or clears, with null) the CPU-skinning bind pose on the geometry's runtime. Called once
// by the deform glue when a skinned geometry is first captured; pass null to force a recapture
// (e.g. after the vertex layout or bind-pose data changes).
export function setMeshGeometrySkinBindPose(geometry: Readonly<MeshGeometry>, bindPose: MeshSkinBindPose | null): void {
  const runtime = geometry[EntityRuntimeKey] as MeshGeometryRuntime | undefined;
  if (runtime) runtime.skinBindPose = bindPose;
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
  const runtime: MeshGeometryRuntime = {
    binding: null,
    // -1 unless the caller supplied bounds up front: authored bounds are trusted at the version they
    // were computed for, so ensureMeshGeometryBounds does not re-sweep a geometry that arrived with a
    // correct box. Anything else recomputes on the first bounds query.
    boundsVersion: fields.bounds !== null ? fields.version : -1,
    morphBindPose: null,
    morphBlendedWeights: null,
    skinBindPose: null,
    webglData: null,
    webgpuData: null,
  };
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
