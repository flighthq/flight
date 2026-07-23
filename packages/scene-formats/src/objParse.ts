import { createTransform3D } from '@flighthq/geometry';
import { createBlinnPhongMaterial } from '@flighthq/materials';
import { createMeshGeometry } from '@flighthq/mesh';
import { createSceneFromDocument } from '@flighthq/scene';
import type { Scene } from '@flighthq/types';
import type {
  BlinnPhongMaterial,
  Material,
  MaterialLike,
  MeshSubset,
  SceneDocument,
  SceneDocumentMesh,
  SceneDocumentNode,
  Texture,
  ObjMaterial,
  ObjMaterialLibrary,
} from '@flighthq/types';
import { MeshKind } from '@flighthq/types';

import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, createExternalTextureRef } from './shared';

// Parses a Wavefront OBJ text source into a Scene. Convenience over `createSceneFromDocument(parseObj
// (source, materials))`. See parseObj for the import model.
export function createSceneFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  warnings?: string[],
): Scene {
  return createSceneFromDocument(parseObj(source, materials, warnings));
}

// Parses a Wavefront OBJ text source into a format-neutral SceneDocument. Each group (`g`) or object
// (`o`) — and any top-level faces before the first group — becomes one document Mesh (inline geometry),
// using the canonical vertex layout. A group that spans several `usemtl` materials becomes a single Mesh
// with one MeshSubset per material (contiguous index ranges) and a positional `materials` index array —
// not a wrapper over per-material child meshes. The optional `materials` argument supplies the material
// library referenced by `mtllib`/`usemtl`; each named material becomes a BlinnPhongMaterial (MTL's own
// Kd/Ks/Ns shading model) in the document's materials table, deduped by name. Without the library,
// material directives are acknowledged but the subset's material index stays absent (resolving to
// DefaultMaterialKind at draw time). Assemble into a live Scene with `createSceneFromDocument`.
//
// Supported directives: `v`, `vn`, `vt`, `f`, `g`, `o`, `mtllib`, `usemtl`. Faces may be
// triangles, quads, or N-gons (fan-triangulated). Face vertex references support independent
// position/uv/normal indices (`v/vt/vn`, `v//vn`, `v/vt`) and negative (relative) indices.
//
// Malformed lines push a warning and are skipped; the function never throws on bad input.
export function parseObj(source: string, materials?: Readonly<ObjMaterialLibrary>, warnings?: string[]): SceneDocument {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const document: SceneDocument = {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };

  // Name of the current group/object scope (undefined for top-level faces before the first group).
  let currentGroupName: string | undefined;

  // Material-keyed face collectors for the current group. Each key is a material name (or '' for
  // no active material). The value accumulates interleaved vertex data and triangle indices for
  // that material within the current group scope; each key becomes one subset of the group's Mesh.
  let materialBuckets = new Map<string, MaterialBucket>();
  let activeMaterial = '';

  // One document material index per MTL material name, shared across every mesh (and group) that uses it.
  const resolvedMaterials = new Map<string, number>();

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
        uvs.push(u, 1 - v);
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
        // A group/object boundary flushes the accumulated faces as one Mesh (one subset per
        // material) and starts a fresh group. `usemtl` state persists across the boundary per the
        // OBJ spec — `g`/`o` name geometry, they do not reset the active material.
        flushGroup(materialBuckets, currentGroupName, document, materials, resolvedMaterials);
        materialBuckets = new Map<string, MaterialBucket>();
        currentGroupName = args || undefined;
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

  // Flush the final group's accumulated faces.
  flushGroup(materialBuckets, currentGroupName, document, materials, resolvedMaterials);

  return document;
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

// Flushes a group's accumulated material buckets as ONE Mesh: the buckets' vertex records are
// concatenated into a single interleaved buffer and their triangles into a single index buffer,
// with one MeshSubset per non-empty bucket addressing that material's contiguous index range. The
// Mesh's positional `materials` array carries one entry per subset — the Flight material the
// bucket's `usemtl` name resolves to, or null when the name is unknown or no library was supplied
// (a null slot resolves to DefaultMaterialKind at draw time). A single-material group is one Mesh
// with one subset spanning the whole buffer; a multi-material group is one Mesh with several
// subsets, never a wrapper over per-material child meshes. A group with no faces adds nothing.
function flushGroup(
  buckets: Readonly<Map<string, MaterialBucket>>,
  name: string | undefined,
  document: SceneDocument,
  library: Readonly<ObjMaterialLibrary> | undefined,
  resolvedMaterials: Map<string, number>,
): void {
  const vertices: number[] = [];
  const indices: number[] = [];
  const subsets: MeshSubset[] = [];
  const materials: number[] = [];

  for (const [materialName, bucket] of buckets) {
    if (bucket.indices.length === 0) continue;

    // Rebase this bucket's local indices onto the combined vertex buffer (its vertices are appended
    // after everything already collected), then record its contiguous index range as one subset.
    const vertexBase = vertices.length / CANONICAL_FLOATS_PER_VERTEX;
    const indexOffset = indices.length;
    for (let k = 0; k < bucket.indices.length; k++) indices.push(bucket.indices[k] + vertexBase);
    for (let k = 0; k < bucket.vertices.length; k++) vertices.push(bucket.vertices[k]);

    subsets.push({ indexCount: bucket.indices.length, indexOffset });
    materials.push(resolveObjMaterial(materialName, library, resolvedMaterials, document));
  }

  if (subsets.length === 0) return;

  const geometry = createMeshGeometry({
    indices: Uint32Array.from(indices),
    layout: CANONICAL_LAYOUT,
    subsets,
    vertices: new Float32Array(vertices),
  });
  const meshIndex = document.meshes.length;
  const mesh: SceneDocumentMesh = { geometry, materials };
  document.meshes.push(mesh);
  const nodeIndex = document.nodes.length;
  const node: SceneDocumentNode = { children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() };
  if (name !== undefined) node.name = name;
  document.nodes.push(node);
  document.scenes[0].rootNodes.push(nodeIndex);
}

// Converts a parsed MTL material to Flight's BlinnPhongMaterial — OBJ/MTL's own shading model.
// Kd → diffuse, Ks → specular, Ns → shininess, d (dissolve) → diffuse alpha plus blend mode, and the
// map_Kd/map_Ks/bump filenames → Unresolved External texture refs (the parser references, it does not
// load). Ka/map_Ka and the illum model have no Blinn-Phong equivalent — ambient is a scene light in
// Flight, not a material property — so they are dropped; a caller wanting metallic-roughness PBR
// converts explicitly downstream.
function objMaterialToBlinnPhong(material: Readonly<ObjMaterial>, document: SceneDocument): BlinnPhongMaterial {
  const result = createBlinnPhongMaterial({
    diffuse: packObjColor(material.diffuse, material.dissolve),
    diffuseMap: externalObjTexture(material.mapDiffuse, document),
    normalMap: externalObjTexture(material.mapBump, document),
    shininess: material.specularExponent,
    specular: packObjColor(material.specular, 1),
    specularMap: externalObjTexture(material.mapSpecular, document),
  });
  // A dissolve below 1 is a translucent material; carry it as the diffuse alpha (above) plus a blend
  // alphaMode so the renderer actually blends rather than treating the alpha as coverage-only.
  if (material.dissolve < 1) result.alphaMode = 'blend';
  return result;
}

// Wraps an MTL texture filename as an Unresolved External resource ref; null filename → no map.
function externalObjTexture(uri: string | null, document: SceneDocument): Texture | null {
  return uri === null ? null : createExternalTextureRef(uri, null, document.resources);
}

// Packs an MTL sRGB-space [r,g,b] triple (each in [0,1]) plus an alpha into a 0xRRGGBBAA integer.
function packObjColor(rgb: readonly [number, number, number], alpha: number): number {
  const r = clampChannel(rgb[0]);
  const g = clampChannel(rgb[1]);
  const b = clampChannel(rgb[2]);
  const a = clampChannel(alpha);
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

function clampChannel(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 0xff);
}

// Resolves an MTL material name to a document material INDEX, memoizing so a name shared across meshes
// registers one material entry. Empty name (no `usemtl`) or unknown name → -1 (no material; the assembler
// resolves an out-of-range index to null, DefaultMaterialKind at draw time). A resolved material is
// appended to the document's materials table and its index cached by name.
function resolveObjMaterial(
  name: string,
  library: Readonly<ObjMaterialLibrary> | undefined,
  cache: Map<string, number>,
  document: SceneDocument,
): number {
  if (name === '') return -1;
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const parsed = library?.materials.get(name);
  if (parsed === undefined) {
    cache.set(name, -1);
    return -1;
  }
  const material = objMaterialToBlinnPhong(parsed, document) as unknown as Material;
  // Preserve the MTL `newmtl` handle as the material's authored name (findSceneMaterialByName).
  material.name = name;
  const index = document.materials.length;
  document.materials.push(material as unknown as MaterialLike);
  cache.set(name, index);
  return index;
}
