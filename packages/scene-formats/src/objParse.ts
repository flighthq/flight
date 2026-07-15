import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode } from '@flighthq/scene';
import type { SceneNode, VertexAttributeLayout } from '@flighthq/types';

import type { ObjMaterialLibrary } from './objSchema';

// Parses a Wavefront OBJ text source into a Scene. Groups (`g`) and objects (`o`) become
// transform-only SceneNode hierarchy containers; faces within each material group become a
// separate Mesh child (one Mesh per material, using the canonical PBR vertex layout). The
// optional `materials` argument supplies the material library referenced by `mtllib`/`usemtl`
// directives; without it material directives are acknowledged but no material data is attached.
//
// Supported directives: `v`, `vn`, `vt`, `f`, `g`, `o`, `mtllib`, `usemtl`. Faces may be
// triangles, quads, or N-gons (fan-triangulated). Face vertex references support independent
// position/uv/normal indices (`v/vt/vn`, `v//vn`, `v/vt`) and negative (relative) indices.
//
// Malformed lines push a warning and are skipped; the function never throws on bad input.
export function createSceneFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  warnings?: string[],
): Scene {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const scene = createScene();

  // Current hierarchy node for group/object scope. Null means top-level (faces attach to scene).
  let currentGroup: SceneNode | null = null;

  // Material-keyed face collectors. Each key is a material name (or '' for default). The value
  // accumulates interleaved vertex data and triangle indices for that material within the current
  // group scope.
  let materialBuckets = new Map<string, MaterialBucket>();
  let activeMaterial = '';

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue; // skip empty and # comments

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex < 0) continue;

    const directive = raw.slice(0, spaceIndex);
    const args = raw.slice(spaceIndex + 1).trim();

    switch (directive) {
      case 'v': {
        const parts = args.split(/\s+/);
        if (parts.length < 3) {
          warnings?.push(`createSceneFromObj: v on line ${i + 1} has fewer than 3 components`);
          break;
        }
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          warnings?.push(`createSceneFromObj: v on line ${i + 1} has non-numeric components`);
          break;
        }
        positions.push(x, y, z);
        break;
      }
      case 'vn': {
        const parts = args.split(/\s+/);
        if (parts.length < 3) {
          warnings?.push(`createSceneFromObj: vn on line ${i + 1} has fewer than 3 components`);
          break;
        }
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          warnings?.push(`createSceneFromObj: vn on line ${i + 1} has non-numeric components`);
          break;
        }
        normals.push(x, y, z);
        break;
      }
      case 'vt': {
        const parts = args.split(/\s+/);
        if (parts.length < 2) {
          warnings?.push(`createSceneFromObj: vt on line ${i + 1} has fewer than 2 components`);
          break;
        }
        const u = parseFloat(parts[0]);
        const v = parseFloat(parts[1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          warnings?.push(`createSceneFromObj: vt on line ${i + 1} has non-numeric components`);
          break;
        }
        uvs.push(u, v);
        break;
      }
      case 'f': {
        const vertexTokens = args.split(/\s+/);
        if (vertexTokens.length < 3) {
          warnings?.push(`createSceneFromObj: f on line ${i + 1} has fewer than 3 vertices`);
          break;
        }

        const bucket = getOrCreateBucket(materialBuckets, activeMaterial);
        const faceIndices: number[] = [];

        for (let vi = 0; vi < vertexTokens.length; vi++) {
          const idx = parseFaceVertex(vertexTokens[vi], positions, uvs, normals, bucket, warnings, i);
          if (idx < 0) break;
          faceIndices.push(idx);
        }

        // Fan-triangulate the polygon.
        if (faceIndices.length >= 3) {
          for (let t = 1; t < faceIndices.length - 1; t++) {
            bucket.indices.push(faceIndices[0], faceIndices[t], faceIndices[t + 1]);
          }
        }
        break;
      }
      case 'g':
      case 'o': {
        // Flush current material buckets into the current group before starting a new one.
        flushBuckets(materialBuckets, currentGroup, scene);
        materialBuckets = new Map<string, MaterialBucket>();
        activeMaterial = '';

        currentGroup = createSceneNode(undefined, { name: args || undefined });
        addNodeChild(scene, currentGroup);
        break;
      }
      case 'usemtl': {
        activeMaterial = args;
        break;
      }
      case 'mtllib': {
        // Acknowledged; the caller passes the parsed material library via the `materials` param.
        break;
      }
      default:
        break;
    }
  }

  // Flush remaining buckets.
  flushBuckets(materialBuckets, currentGroup, scene);

  // If the scene has exactly one group node and that group has no name, unwrap its children
  // directly into the scene to avoid a pointless wrapper.

  return scene;
}

// Accumulates interleaved vertex data and triangle indices for one material within a group.
interface MaterialBucket {
  // Dedup map: "posIdx/uvIdx/normalIdx" → emitted vertex index.
  dedup: Map<string, number>;
  indices: number[];
  // Interleaved floats: position(3) + normal(3) + tangent(4) + uv(2) = 12 floats per vertex.
  vertices: number[];
}

function getOrCreateBucket(buckets: Map<string, MaterialBucket>, material: string): MaterialBucket {
  let bucket = buckets.get(material);
  if (bucket === undefined) {
    bucket = { dedup: new Map(), indices: [], vertices: [] };
    buckets.set(material, bucket);
  }
  return bucket;
}

// Parses one face vertex token (e.g. "1/2/3", "1//3", "1/2", "1") and emits the vertex into the
// bucket, returning the emitted vertex index. Returns -1 on malformed input.
function parseFaceVertex(
  token: string,
  positions: readonly number[],
  uvs: readonly number[],
  normals: readonly number[],
  bucket: MaterialBucket,
  warnings: string[] | undefined,
  lineIndex: number,
): number {
  const parts = token.split('/');
  const posCount = positions.length / 3;
  const uvCount = uvs.length / 2;
  const normalCount = normals.length / 3;

  // Position index (1-based, may be negative).
  const rawPosIdx = parseInt(parts[0], 10);
  if (!Number.isFinite(rawPosIdx) || rawPosIdx === 0) {
    warnings?.push(`createSceneFromObj: invalid face vertex index '${token}' on line ${lineIndex + 1}`);
    return -1;
  }
  const posIdx = rawPosIdx > 0 ? rawPosIdx - 1 : posCount + rawPosIdx;
  if (posIdx < 0 || posIdx >= posCount) {
    warnings?.push(`createSceneFromObj: position index ${rawPosIdx} out of range on line ${lineIndex + 1}`);
    return -1;
  }

  let uvIdx = -1;
  if (parts.length >= 2 && parts[1].length > 0) {
    const rawUvIdx = parseInt(parts[1], 10);
    if (Number.isFinite(rawUvIdx) && rawUvIdx !== 0) {
      uvIdx = rawUvIdx > 0 ? rawUvIdx - 1 : uvCount + rawUvIdx;
      if (uvIdx < 0 || uvIdx >= uvCount) {
        warnings?.push(`createSceneFromObj: uv index ${rawUvIdx} out of range on line ${lineIndex + 1}`);
        uvIdx = -1;
      }
    }
  }

  let normalIdx = -1;
  if (parts.length >= 3 && parts[2].length > 0) {
    const rawNormalIdx = parseInt(parts[2], 10);
    if (Number.isFinite(rawNormalIdx) && rawNormalIdx !== 0) {
      normalIdx = rawNormalIdx > 0 ? rawNormalIdx - 1 : normalCount + rawNormalIdx;
      if (normalIdx < 0 || normalIdx >= normalCount) {
        warnings?.push(`createSceneFromObj: normal index ${rawNormalIdx} out of range on line ${lineIndex + 1}`);
        normalIdx = -1;
      }
    }
  }

  // Dedup key: unique combination of resolved indices.
  const key = `${posIdx}/${uvIdx}/${normalIdx}`;
  const existing = bucket.dedup.get(key);
  if (existing !== undefined) return existing;

  const vertexIndex = bucket.vertices.length / CANONICAL_FLOATS_PER_VERTEX;

  // Position (3 floats).
  bucket.vertices.push(positions[posIdx * 3], positions[posIdx * 3 + 1], positions[posIdx * 3 + 2]);

  // Normal (3 floats).
  if (normalIdx >= 0) {
    bucket.vertices.push(normals[normalIdx * 3], normals[normalIdx * 3 + 1], normals[normalIdx * 3 + 2]);
  } else {
    bucket.vertices.push(0, 0, 0);
  }

  // Tangent (4 floats) — OBJ does not carry tangents; zero-filled.
  bucket.vertices.push(0, 0, 0, 0);

  // UV (2 floats).
  if (uvIdx >= 0) {
    bucket.vertices.push(uvs[uvIdx * 2], uvs[uvIdx * 2 + 1]);
  } else {
    bucket.vertices.push(0, 0);
  }

  bucket.dedup.set(key, vertexIndex);
  return vertexIndex;
}

// Flushes all non-empty material buckets as Mesh children of `parent` (or of `scene` when parent
// is null). Each bucket becomes one Mesh node with its own MeshGeometry.
function flushBuckets(buckets: Readonly<Map<string, MaterialBucket>>, parent: SceneNode | null, scene: Scene): void {
  for (const [, bucket] of buckets) {
    if (bucket.indices.length === 0) continue;

    const vertices = new Float32Array(bucket.vertices);
    const indices = Uint32Array.from(bucket.indices);
    const geometry = createMeshGeometry({ indices, layout: CANONICAL_LAYOUT, vertices });
    const meshNode = createMesh(geometry, []) as unknown as SceneNode;

    if (parent !== null) {
      addNodeChild(parent, meshNode);
    } else {
      addNodeChild(scene, meshNode);
    }
  }
}

const CANONICAL_FLOATS_PER_VERTEX = 12;
const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};
