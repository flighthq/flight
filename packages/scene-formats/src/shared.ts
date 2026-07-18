import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT } from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { isMesh } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { Mesh, SceneNode, Texture, VertexAttributeLayout } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';

export const CANONICAL_FLOATS_PER_VERTEX = 12;
export const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// Floats per vertex in the canonical skinned record (position/normal/tangent/uv0/joints0/weights0),
// derived from the shared skinned layout so no importer's interleave stride can drift from it.
export const SKINNED_FLOATS_PER_VERTEX = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.stride / 4;

// The joint influences per vertex the skinned layout carries (linear-blend skinning's standard 4).
// Source formats may list more influences per vertex (AWD's shambler uses 8); the top four by weight
// are kept and renormalized. See packSkinInfluences.
export const MAX_SKIN_INFLUENCES = 4;

// Flight uses a right-handed Y-up coordinate system with CCW front faces. Importers for formats
// that use different conventions apply the conversions below at parse time so every scene enters
// the graph in Flight's native frame. Every coordinate-space operation passes through one of
// these helpers so the reason for each transformation is explicit and grep-locatable.

// Right-handed Z-up → right-handed Y-up: a -90° rotation about X, (x, y, z) → (x, z, -y). The
// determinant is +1, so triangle winding and cross-product normals are unchanged and no reflection
// (mirroring) is introduced. Used by every RH Z-up importer — MD2, MD5, and 3DS. stride/offset walk
// interleaved vertex buffers.
export function convertPositionsZUpToYUp(
  values: ArrayLike<number> & { [i: number]: number },
  stride = 3,
  offset = 0,
): void {
  for (let i = offset; i + 2 < values.length; i += stride) {
    const y = values[i + 1];
    values[i + 1] = values[i + 2];
    values[i + 2] = -y + 0;
  }
}

// Quaternion companion to convertPositionsZUpToYUp: applies the same -90°-about-X rotation to the
// vector part (qx, qy, qz) → (qx, qz, -qy), leaving qw. Used for MD5 animation rotations.
export function convertQuaternionsZUpToYUp(values: number[], stride = 4, offset = 0): void {
  for (let i = offset; i + 3 < values.length; i += stride) {
    const qy = values[i + 1];
    values[i + 1] = values[i + 2];
    values[i + 2] = -qy + 0;
  }
}

export function convertTransformLhToRh(transform: Float64Array): void {
  // AWD 12-float layout: [c0x c0y c0z  c1x c1y c1z  c2x c2y c2z  tx ty tz]
  // S·M·S negates: c0z(2), c1z(5), c2x(6), c2y(7), tz(11). Index 8 (c2z) stays — double negation.
  transform[2] = -transform[2] + 0;
  transform[5] = -transform[5] + 0;
  transform[6] = -transform[6] + 0;
  transform[7] = -transform[7] + 0;
  transform[11] = -transform[11] + 0;
}

// Wraps already-in-hand encoded image bytes (a payload carved out of a container, e.g. a PNG inside a
// GLB buffer or an AWD texture block) as an Unresolved Embedded resource ref on a fresh Texture. The
// parser carries the bytes but does not decode them — @flighthq/scene-resources decodes on resolve.
// `mimeType` is null when the container did not declare one (the resolver sniffs it from the bytes).
export function createEmbeddedTextureRef(bytes: Uint8Array, mimeType: string | null): Texture {
  return createTexture({
    resource: {
      bytes,
      kind: SceneResourceRefKind.Embedded,
      mimeType,
      state: ResourceResolutionState.Unresolved,
    },
  });
}

// Wraps a texture file path/URI declared by a model format as an Unresolved External resource ref on
// a fresh Texture. The parser references the image, it does not load or decode it — @flighthq/scene-
// resources resolves the ref later. Shared by the OBJ/MD5/3DS/MD2 material decoders.
export function createExternalTextureRef(uri: string): Texture {
  return createTexture({
    resource: {
      basePath: null,
      kind: SceneResourceRefKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri,
    },
  });
}

// Walks a built scene for the first skinned mesh and returns its skeleton's joints — the same node
// handles the skin was bound to, so a clip bound to them deforms the mesh. Null when the scene has no
// skinned mesh. Shared by the AWD and MD5 whole-file importers, which fold a skeleton animation onto the
// joints the scene already holds rather than making the caller re-thread them.
export function findSceneSkeletonJoints(scene: Readonly<Scene>): readonly SceneNode[] | null {
  const stack: SceneNode[] = [...getNodeChildren(scene as unknown as SceneNode)];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isMesh(node)) {
      const skin = (node as unknown as Mesh).skin;
      if (skin != null) return skin.skeleton.joints;
    }
    stack.push(...getNodeChildren(node));
  }
  return null;
}

// Left-handed Y-up ↔ right-handed Y-up: negates Z (a reflection across the XY plane, det = -1) on a
// vec3 stream (positions, normals, tangents). A reflection flips triangle winding, so a caller must
// pair this with reverseTriangleWinding to keep front faces front-facing. Used by AWD/Stage3D.
export function negateVec3Z(values: number[]): void {
  for (let i = 2; i < values.length; i += 3) {
    values[i] = -values[i] + 0;
  }
}

// Reduces a vertex's joint influences to the 4-slot joints0/weights0 form linear-blend skinning
// consumes: keeps the (up to) four highest-weight influences and renormalizes their weights to sum 1,
// so dropping smaller influences does not dim the vertex. Writes joint indices into `outJoints` and
// weights into `outWeights` (both length 4), zero-filling unused slots. A vertex with no influence
// keeps all weights zero (it stays at its bind position). This is the single influence-packing seam
// every skinned-mesh importer (MD5, AWD) feeds — per-format extraction differs, the emit is shared.
export function packSkinInfluences(influences: SkinInfluence[], outJoints: number[], outWeights: number[]): void {
  for (let i = 0; i < MAX_SKIN_INFLUENCES; i++) {
    outJoints[i] = 0;
    outWeights[i] = 0;
  }
  // Descending by weight; per-vertex influence counts are tiny, so Array.sort is simplest.
  influences.sort((a, b) => b.weight - a.weight);
  const kept = Math.min(influences.length, MAX_SKIN_INFLUENCES);
  let sum = 0;
  for (let i = 0; i < kept; i++) sum += influences[i].weight;
  for (let i = 0; i < kept; i++) {
    outJoints[i] = influences[i].jointIndex;
    outWeights[i] = sum > 0 ? influences[i].weight / sum : 0;
  }
}

// Reverses each triangle's winding (swaps v1 and v2). Use whenever a source's front-face winding is
// opposite to Flight's counter-clockwise-front convention: either paired with a det = -1 reflection
// such as negateVec3Z (AWD/Stage3D) or on its own for a format whose native winding is clockwise
// (MD5/id Tech 4, whose Z-up→Y-up rotation preserves the source's clockwise winding).
export function reverseTriangleWinding(indices: number[]): void {
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const tmp = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = tmp;
  }
}

// One joint influence on a vertex: the joint's index in the skeleton and its blend weight. The unit
// packSkinInfluences reduces to the fixed 4-slot joints0/weights0 channels.
export interface SkinInfluence {
  jointIndex: number;
  weight: number;
}
