import type { MeshGeometry, MeshSubset } from '@flighthq/types';

// Subset range management over a MeshGeometry's index buffer. A subset is a contiguous draw range
// (indexOffset + indexCount) addressing one material binding; a single-material geometry is one
// subset spanning the whole index buffer. These functions read or replace the geometry's `subsets`
// array — they never touch vertex or index data, so `version` is unchanged (a re-upload is only
// needed when the buffers themselves change). Out-of-range subset lookups return the sentinel 0.

// Appends a subset range to the geometry's subset list, replacing the array reference so existing
// readers of the old array are unaffected. The new subset is added as-is; the caller owns choosing
// a non-overlapping range within the index buffer.
export function addMeshGeometrySubset(geometry: MeshGeometry, subset: Readonly<MeshSubset>): void {
  const next: MeshSubset[] = [];
  for (let i = 0; i < geometry.subsets.length; i++) {
    next.push({ indexCount: geometry.subsets[i].indexCount, indexOffset: geometry.subsets[i].indexOffset });
  }
  next.push({ indexCount: subset.indexCount, indexOffset: subset.indexOffset });
  geometry.subsets = next;
}

// Returns the number of triangles a subset spans, derived from its `indexCount` and the geometry's
// topology: triangle-list yields floor(indexCount / 3), triangle-strip yields max(0, indexCount - 2).
// Non-triangle topologies and out-of-range subset indices return the sentinel 0.
export function getMeshGeometrySubsetTriangleCount(geometry: Readonly<MeshGeometry>, subsetIndex: number): number {
  if (subsetIndex < 0 || subsetIndex >= geometry.subsets.length) return 0;
  const indexCount = geometry.subsets[subsetIndex].indexCount;
  if (geometry.topology === 'triangle-list') return Math.floor(indexCount / 3);
  if (geometry.topology === 'triangle-strip') return indexCount >= 2 ? indexCount - 2 : 0;
  return 0;
}

// Returns the subset containing all three elements of a logical triangle, or -1 when no subset owns
// it. Subset offsets/counts address the index/vertex element stream, so triangle lists advance by
// three while triangle strips advance by one. Overlapping subsets resolve to the first declaration.
export function getMeshGeometryTriangleSubsetIndex(geometry: Readonly<MeshGeometry>, triangleIndex: number): number {
  if (triangleIndex < 0) return -1;
  let firstElement: number;
  if (geometry.topology === 'triangle-list') firstElement = triangleIndex * 3;
  else if (geometry.topology === 'triangle-strip') firstElement = triangleIndex;
  else return -1;

  const subsets = geometry.subsets;
  for (let subsetIndex = 0; subsetIndex < subsets.length; subsetIndex++) {
    const subset = subsets[subsetIndex];
    if (firstElement >= subset.indexOffset && firstElement + 3 <= subset.indexOffset + subset.indexCount) {
      return subsetIndex;
    }
  }
  return -1;
}

// Replaces the geometry's entire subset list with a fresh copy of `subsets`, taking ownership of
// the range definitions while leaving the vertex/index buffers untouched. Pass a single
// whole-buffer subset to collapse back to one material binding.
export function setMeshGeometrySubsets(geometry: MeshGeometry, subsets: readonly Readonly<MeshSubset>[]): void {
  const next: MeshSubset[] = [];
  for (let i = 0; i < subsets.length; i++) {
    next.push({ indexCount: subsets[i].indexCount, indexOffset: subsets[i].indexOffset });
  }
  geometry.subsets = next;
}
