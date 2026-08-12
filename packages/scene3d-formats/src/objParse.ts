import { createTransform3D } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createBlinnPhongMaterial, createStandardPbrMaterial } from '@flighthq/materials/contract';
import { computeMeshGeometryNormals, computeMeshGeometryTangents, createMeshGeometry } from '@flighthq/mesh/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type {
  BlinnPhongMaterial,
  ImportDiagnostic,
  Material,
  MaterialLike,
  MeshSubset,
  PrimitiveTopology,
  Scene3DDocument,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
  StandardPbrMaterial,
  Texture,
  TextureColorSpace,
  ObjMaterial,
  ObjMaterialLibrary,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshKind } from '@flighthq/types/contract';

import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, createExternalTextureRef } from './shared';

// Parses a Wavefront OBJ text source into a Scene3D. Convenience over `createScene3DFromDocument(parseObj
// (source, materials))`. See parseObj for the import model.
export function createScene3DFromObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  diagnostics?: ImportDiagnostic[],
): Scene3D {
  return createScene3DFromDocument(parseObj(source, materials, diagnostics));
}

// Parses a Wavefront OBJ text source into a format-neutral Scene3DDocument. Each group (`g`) or object
// (`o`) — and any top-level faces before the first group — becomes one document Mesh (inline geometry),
// using the canonical vertex layout. A group that spans several `usemtl` materials becomes a single Mesh
// with one MeshSubset per material (contiguous index ranges) and a positional `materials` index array —
// not a wrapper over per-material child meshes. The optional `materials` argument supplies the material
// library referenced by `mtllib`/`usemtl`; each named material becomes a BlinnPhongMaterial (MTL's own
// Kd/Ks/Ns shading model) in the document's materials table, deduped by name. Without the library,
// material directives are acknowledged but the subset's material index stays absent (resolving to
// StandardMaterialKind at draw time). Assemble into a live Scene3D with `createScene3DFromDocument`.
//
// Supported directives: `v`, `vn`, `vt`, `f`, `g`, `o`, `mtllib`, `usemtl`. Faces may be
// triangles, quads, or N-gons (fan-triangulated). Face vertex references support independent
// position/uv/normal indices (`v/vt/vn`, `v//vn`, `v/vt`) and negative (relative) indices.
//
// Malformed lines record a diagnostic and are skipped; the function never throws on bad input.
export function parseObj(
  source: string,
  materials?: Readonly<ObjMaterialLibrary>,
  diagnostics?: ImportDiagnostic[],
): Scene3DDocument {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const document: Scene3DDocument = {
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

  // The smoothing group faces are currently declared under (`s`), and a running face ordinal used to give
  // every face in the OFF group a group of its own. See parseFaceVertex for why that produces flat
  // shading without a second normal-generation path.
  //
  // The initial state is UNSTATED, not OFF. The spec's default is off, but a file that never mentions
  // smoothing has not opted into the smoothing model at all — and reading it as off would split every
  // shared vertex in every existing plain OBJ, turning a smooth import flat. A file that uses `s` is
  // explicitly driving the shading and is honoured exactly, `s off` included.
  let activeSmoothingGroup = OBJ_SMOOTHING_UNSTATED;
  let faceOrdinal = 0;

  // Line (`l`) and point (`p`) elements for the current group, as resolved position indices. They cannot
  // ride the face mesh: PrimitiveTopology is a property of the whole MeshGeometry, not of a subset, so a
  // group mixing faces with lines becomes sibling meshes rather than one mesh with mixed subsets.
  let lineElements: number[][] = [];
  let pointElements: number[] = [];

  // One document material index per MTL material name, shared across every mesh (and group) that uses it.
  const resolvedMaterials = new Map<string, number>();

  // Repeated malformed lines/tokens are tallied here and flushed as ONE crumb per (kind, discriminator)
  // after the parse — the collector contract forbids a per-element report inside this line loop. Null (and
  // every tally call a no-op) when no collector is engaged, so an unopted parse stays allocation-free.
  const objDrops = diagnostics ? new Map<string, ObjDropTally>() : null;

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.charCodeAt(0) === 35) continue; // skip empty and # comments

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex < 0) {
      // A bare recognized directive (no arguments). For v/vn/vt/f it drops the geometry it announced — a
      // data-dropping branch, not a silent no-op. Bare `g` is the spec-defined DEFAULT (unnamed) group and
      // bare `usemtl` the spec-defined DEFAULT material (white / no material) — Wavefront Appendix B1 — so both
      // stay silent (valid input, no substitution). Bare `o` has NO spec default (the spec always names an
      // object): the importer RECOVERS with an unnamed boundary, which the collector contract requires be
      // recorded (a Recover crumb = continued with a substitute).
      if (raw === 'v')
        tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.vertex-malformed', 'too-few-components', {
          firstLine: i + 1,
          reason: 'too-few-components',
        });
      else if (raw === 'vn')
        tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.normal-malformed', 'too-few-components', {
          firstLine: i + 1,
          reason: 'too-few-components',
        });
      else if (raw === 'vt')
        tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.uv-malformed', 'too-few-components', {
          firstLine: i + 1,
          reason: 'too-few-components',
        });
      else if (raw === 'f')
        tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.face-too-few-vertices', '', { firstLine: i + 1 });
      else if (raw === 'g' || raw === 'o') {
        // A bare `o` is unnamed input the spec does not define — record the recovery before performing it.
        if (raw === 'o')
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Recover, 'obj.object-name-missing', '', {
            firstLine: i + 1,
          });
        // Close the current group and enter the unnamed group — the same boundary a named g/o makes.
        flushGroup(
          materialBuckets,
          lineElements,
          pointElements,
          positions,
          currentGroupName,
          document,
          materials,
          resolvedMaterials,
          normals.length > 0,
          uvs.length > 0,
          diagnostics,
        );
        materialBuckets = new Map<string, MaterialBucket>();
        lineElements = [];
        pointElements = [];
        currentGroupName = undefined;
      } else if (raw === 'usemtl') {
        // Reset to the default material rather than leaving the previous one bound to subsequent faces.
        activeMaterial = '';
      }
      // A bare `mtllib` names no library file; the library is supplied via the `materials` param, so — like a
      // filename-bearing `mtllib` — it is a deliberate no-op (nothing to load, no authored data dropped).
      continue;
    }

    const directive = raw.slice(0, spaceIndex);
    const args = raw.slice(spaceIndex + 1).trim();

    switch (directive) {
      case 'v': {
        const parts = args.split(/\s+/);
        if (parts.length < 3) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.vertex-malformed', 'too-few-components', {
            firstLine: i + 1,
            reason: 'too-few-components',
          });
          break;
        }
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.vertex-malformed', 'non-numeric', {
            firstLine: i + 1,
            reason: 'non-numeric',
          });
          break;
        }
        positions.push(x, y, z);
        break;
      }
      case 'vn': {
        const parts = args.split(/\s+/);
        if (parts.length < 3) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.normal-malformed', 'too-few-components', {
            firstLine: i + 1,
            reason: 'too-few-components',
          });
          break;
        }
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.normal-malformed', 'non-numeric', {
            firstLine: i + 1,
            reason: 'non-numeric',
          });
          break;
        }
        normals.push(x, y, z);
        break;
      }
      case 'vt': {
        const parts = args.split(/\s+/);
        if (parts.length < 2) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.uv-malformed', 'too-few-components', {
            firstLine: i + 1,
            reason: 'too-few-components',
          });
          break;
        }
        const u = parseFloat(parts[0]);
        const v = parseFloat(parts[1]);
        if (!Number.isFinite(u) || !Number.isFinite(v)) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.uv-malformed', 'non-numeric', {
            firstLine: i + 1,
            reason: 'non-numeric',
          });
          break;
        }
        uvs.push(u, 1 - v);
        break;
      }
      case 'f': {
        const vertexTokens = args.split(/\s+/);
        if (vertexTokens.length < 3) {
          tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.face-too-few-vertices', '', {
            firstLine: i + 1,
          });
          break;
        }

        const bucket = getOrCreateBucket(materialBuckets, activeMaterial);
        const faceIndices: number[] = [];

        for (let vi = 0; vi < vertexTokens.length; vi++) {
          const idx = parseFaceVertex(
            vertexTokens[vi],
            positions,
            uvs,
            normals,
            bucket,
            // A face in the OFF group smooths with nothing, so it gets a group nobody else can share.
            // An UNSTATED file keeps one shared group, which is the pre-smoothing-group behaviour.
            activeSmoothingGroup === OBJ_SMOOTHING_OFF ? -1 - faceOrdinal : activeSmoothingGroup,
            objDrops,
            i,
          );
          if (idx < 0) break;
          faceIndices.push(idx);
        }

        // Fan-triangulate the polygon.
        if (faceIndices.length >= 3) {
          for (let t = 1; t < faceIndices.length - 1; t++) {
            bucket.indices.push(faceIndices[0], faceIndices[t], faceIndices[t + 1]);
          }
        }
        // Advances for EVERY face, smoothed or not, so the unsmoothed ordinals stay unique across the
        // whole file rather than colliding after a group boundary.
        faceOrdinal++;
        break;
      }
      case 'g':
      case 'o': {
        // A group/object boundary flushes the accumulated faces as one Mesh (one subset per
        // material) and starts a fresh group. `usemtl` state persists across the boundary per the
        // OBJ spec — `g`/`o` name geometry, they do not reset the active material.
        flushGroup(
          materialBuckets,
          lineElements,
          pointElements,
          positions,
          currentGroupName,
          document,
          materials,
          resolvedMaterials,
          normals.length > 0,
          uvs.length > 0,
          diagnostics,
        );
        materialBuckets = new Map<string, MaterialBucket>();
        lineElements = [];
        pointElements = [];
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
      case 's': {
        // `s off` and `s 0` both mean no smoothing. Anything else is a group id; faces sharing one smooth
        // together and faces across a boundary do not.
        const group = args === 'off' ? OBJ_SMOOTHING_OFF : parseInt(args, 10);
        activeSmoothingGroup = Number.isFinite(group) && group > 0 ? group : OBJ_SMOOTHING_OFF;
        break;
      }
      case 'l': {
        // A polyline is a CHAIN of vertices, so N references become N-1 segments. Only the position ref
        // is read: `l` may carry a uv, and line topology has nowhere to sample it.
        const resolved = resolveObjElementIndices(args, positions.length / 3, objDrops, i);
        if (resolved.length >= 2) lineElements.push(resolved);
        break;
      }
      case 'p': {
        const resolved = resolveObjElementIndices(args, positions.length / 3, objDrops, i);
        for (let k = 0; k < resolved.length; k++) pointElements.push(resolved[k]);
        break;
      }
      default:
        break;
    }
  }

  // Flush the final group's accumulated faces.
  flushGroup(
    materialBuckets,
    lineElements,
    pointElements,
    positions,
    currentGroupName,
    document,
    materials,
    resolvedMaterials,
    normals.length > 0,
    uvs.length > 0,
    diagnostics,
  );

  // Emit the aggregated malformed-line/token tallies here in parseObj (the emitting function, so `parseObj`
  // is the crumbs' origin per the collector contract) — one crumb per (kind, discriminator) with its count.
  if (objDrops !== null) {
    for (const tally of objDrops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parseObj', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }

  return document;
}

// The OBJ smoothing-group id meaning "no smoothing" — both `s off` and `s 0` select it. UNSTATED is the
// separate pre-`s` state: one shared group, so a file that never mentions smoothing imports exactly as it
// did before smoothing groups were read.
const OBJ_SMOOTHING_OFF = 0;
const OBJ_SMOOTHING_UNSTATED = -1;

// Accumulates interleaved vertex data and triangle indices for one material within a group.
interface MaterialBucket {
  // Dedup map: "posIdx/uvIdx/normalIdx", or "posIdx/uvIdx/s<group>" for a corner whose normal will be
  // generated → emitted vertex index.
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
  smoothingGroup: number,
  objDrops: Map<string, ObjDropTally> | null,
  lineIndex: number,
): number {
  const parts = token.split('/');
  const posCount = positions.length / 3;
  const uvCount = uvs.length / 2;
  const normalCount = normals.length / 3;

  // Position index (1-based, may be negative). Every drop is tallied — parseFaceVertex runs once per face
  // vertex, so a per-token report would violate the collector's aggregate-once contract; the parseObj-level
  // flush emits every tallied crumb (its origin).
  const rawPosIdx = parseInt(parts[0], 10);
  if (!Number.isFinite(rawPosIdx) || rawPosIdx === 0) {
    tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.face-vertex-invalid', '', {
      firstLine: lineIndex + 1,
      firstToken: token,
    });
    return -1;
  }
  const posIdx = rawPosIdx > 0 ? rawPosIdx - 1 : posCount + rawPosIdx;
  if (posIdx < 0 || posIdx >= posCount) {
    tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.position-index-out-of-range', '', {
      firstIndex: rawPosIdx,
      firstLine: lineIndex + 1,
    });
    return -1;
  }

  // Optional uv/normal refs: a present-but-invalid token (non-numeric, zero, OR out of range) drops that
  // attribute and keeps the vertex (Recover). The raw token in `firstToken` describes every case uniformly.
  let uvIdx = -1;
  if (parts.length >= 2 && parts[1].length > 0) {
    uvIdx = resolveFaceAttrIndex(parts[1], uvCount);
    if (uvIdx < 0) {
      tallyObjDrop(objDrops, ImportDiagnosticSeverity.Recover, 'obj.uv-index-invalid', '', {
        firstLine: lineIndex + 1,
        firstToken: parts[1],
      });
    }
  }

  let normalIdx = -1;
  if (parts.length >= 3 && parts[2].length > 0) {
    normalIdx = resolveFaceAttrIndex(parts[2], normalCount);
    if (normalIdx < 0) {
      tallyObjDrop(objDrops, ImportDiagnosticSeverity.Recover, 'obj.normal-index-invalid', '', {
        firstLine: lineIndex + 1,
        firstToken: parts[2],
      });
    }
  }

  // Dedup key: unique combination of resolved indices.
  // The smoothing group joins the dedup key ONLY for a corner with no authored normal. Splitting the
  // vertex at a smoothing boundary is what makes the generated normals hard there: computeMeshGeometryNormals
  // averages across shared vertices, so two faces that no longer share a vertex cannot average together.
  // That reuses the existing generation pass instead of adding a second, smoothing-aware one. A corner
  // that DOES carry a normal is already authoritative, and keying it by group would only split vertices
  // that should have stayed merged.
  const key = normalIdx >= 0 ? `${posIdx}/${uvIdx}/${normalIdx}` : `${posIdx}/${uvIdx}/s${smoothingGroup}`;
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
// (a null slot resolves to StandardMaterialKind at draw time). A single-material group is one Mesh
// with one subset spanning the whole buffer; a multi-material group is one Mesh with several
// subsets, never a wrapper over per-material child meshes. A group with no faces adds nothing.
function flushGroup(
  buckets: Readonly<Map<string, MaterialBucket>>,
  lineElements: readonly (readonly number[])[],
  pointElements: readonly number[],
  sourcePositions: readonly number[],
  name: string | undefined,
  document: Scene3DDocument,
  library: Readonly<ObjMaterialLibrary> | undefined,
  resolvedMaterials: Map<string, number>,
  sourceHasNormals: boolean,
  sourceHasUvs: boolean,
  diagnostics: ImportDiagnostic[] | undefined,
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
    materials.push(resolveObjMaterial(materialName, library, resolvedMaterials, document, diagnostics));
  }

  // Lines and points are emitted as sibling meshes of the face mesh, before the early return, so a group
  // consisting ONLY of lines still produces geometry.
  appendObjTopologyMesh(lineElements.flatMap(toObjLineSegments), sourcePositions, 'line-list', name, document);
  appendObjTopologyMesh(pointElements, sourcePositions, 'point-list', name, document);

  if (subsets.length === 0) return;

  const geometry = createMeshGeometry({
    indices: Uint32Array.from(indices),
    layout: CANONICAL_LAYOUT,
    subsets,
    vertices: new Float32Array(vertices),
  });
  // An OBJ carrying no `vn` at all leaves every normal slot zeroed, and a zero normal shades black under
  // any lit material — so the geometry is generated from the faces instead, matching what AWD and MD5
  // already do when their own files omit normals. Smooth (area-weighted across shared vertices) rather
  // than flat: it is the same choice the 3DS path makes for a mesh with no smoothing chunk, and OBJ's
  // own smoothing-group directive is not modeled, so there is no authored hard edge to honor.
  if (!sourceHasNormals) computeMeshGeometryNormals(geometry, geometry);
  // OBJ carries no tangent directive at all, so every tangent slot is left zeroed — and a zero
  // tangent collapses the TBN basis a normal-mapped material reconstructs (B = w * cross(N, T)),
  // which is precisely the frame the `norm` map above needs. Derive one from the UV gradient, the
  // same obligation AWD and MD5 already meet when their own files omit the stream. Only when the
  // file has UVs: the gradient is what the tangent is derived FROM, and without it there is nothing
  // to derive. Normals must already be present or generated above, since the basis is built
  // relative to them.
  if (sourceHasUvs) computeMeshGeometryTangents(geometry, geometry);
  const meshIndex = document.meshes.length;
  const mesh: Scene3DDocumentMesh = { geometry, materials };
  document.meshes.push(mesh);
  const nodeIndex = document.nodes.length;
  const node: Scene3DDocumentNode = { children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() };
  if (name !== undefined) node.name = name;
  document.nodes.push(node);
  document.scenes[0].rootNodes.push(nodeIndex);
}

// Resolves the whitespace-separated vertex references of an `l` or `p` element to zero-based position
// indices, dropping any that do not resolve. Only the position component is read — a `l` reference may
// carry a uv, and neither line nor point topology has anywhere to sample one.
function resolveObjElementIndices(
  args: string,
  positionCount: number,
  objDrops: Map<string, ObjDropTally> | null,
  lineIndex: number,
): number[] {
  const resolved: number[] = [];
  const tokens = args.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].length === 0) continue;
    const index = resolveFaceAttrIndex(tokens[i].split('/')[0], positionCount);
    if (index < 0) {
      tallyObjDrop(objDrops, ImportDiagnosticSeverity.Drop, 'obj.element-index-out-of-range', '', {
        firstLine: lineIndex + 1,
        firstToken: tokens[i],
      });
      continue;
    }
    resolved.push(index);
  }
  return resolved;
}

// Expands one polyline's vertex chain into the vertex PAIRS a line-list wants: N references describe
// N-1 connected segments, not N independent ones.
function toObjLineSegments(chain: readonly number[]): number[] {
  const segments: number[] = [];
  for (let i = 0; i + 1 < chain.length; i++) segments.push(chain[i], chain[i + 1]);
  return segments;
}

// Appends one line-list or point-list mesh built from `elements` (position indices into the file's
// vertex table) as a sibling node of the group's face mesh. Only positions are written: the canonical
// layout still reserves normal/tangent/uv slots, but neither topology shades or samples, so they stay
// zero rather than carrying invented values. No material is bound — OBJ states none for these elements.
function appendObjTopologyMesh(
  elements: readonly number[],
  sourcePositions: readonly number[],
  topology: PrimitiveTopology,
  name: string | undefined,
  document: Scene3DDocument,
): void {
  if (elements.length === 0) return;

  const vertices: number[] = [];
  const indices: number[] = [];
  const dedup = new Map<number, number>();
  for (let i = 0; i < elements.length; i++) {
    const source = elements[i];
    let emitted = dedup.get(source);
    if (emitted === undefined) {
      emitted = vertices.length / CANONICAL_FLOATS_PER_VERTEX;
      vertices.push(sourcePositions[source * 3], sourcePositions[source * 3 + 1], sourcePositions[source * 3 + 2]);
      for (let pad = 0; pad < CANONICAL_FLOATS_PER_VERTEX - 3; pad++) vertices.push(0);
      dedup.set(source, emitted);
    }
    indices.push(emitted);
  }

  const geometry = createMeshGeometry({
    indices: Uint32Array.from(indices),
    layout: CANONICAL_LAYOUT,
    subsets: [{ indexCount: indices.length, indexOffset: 0 }],
    topology,
    vertices: new Float32Array(vertices),
  });
  const meshIndex = document.meshes.length;
  document.meshes.push({ geometry, materials: [-1] });
  const node: Scene3DDocumentNode = { children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() };
  if (name !== undefined) node.name = name;
  document.nodes.push(node);
  document.scenes[0].rootNodes.push(document.nodes.length - 1);
}

// Converts a parsed MTL material to Flight's BlinnPhongMaterial — OBJ/MTL's own shading model.
// Kd → diffuse, Ks → specular, Ns → shininess, d (dissolve) → diffuse alpha plus blend mode, and the
// map_Kd/map_Ks/bump filenames → Unresolved External texture refs (the parser references, it does not
// load). Ka/map_Ka and the illum model have no Blinn-Phong equivalent — ambient is a scene light in
// Flight, not a material property — so they are dropped; a caller wanting metallic-roughness PBR
// converts explicitly downstream.
function objMaterialToBlinnPhong(
  material: Readonly<ObjMaterial>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): BlinnPhongMaterial {
  const result = createBlinnPhongMaterial({
    // map_d is a dedicated coverage image, separate from the diffuse map's own alpha channel.
    alphaMap: externalObjTexture(material.mapDissolve, document, 'linear'),
    diffuse: packObjColor(material.diffuse, material.dissolve),
    diffuseMap: externalObjTexture(material.mapDiffuse, document, 'srgb'),
    // ONLY `norm` binds. `map_Bump`/`bump` is a grayscale HEIGHT field, not a tangent-space normal
    // map: a shader decoding its RGB as 2*c-1 direction vectors reads elevation as orientation and
    // lights the surface from nonsense normals. It is parsed and reported, never bound, until a real
    // height-map feature exists to consume it — the same call 3DS already makes for MAT_BUMPMAP.
    normalMap: externalObjTexture(material.mapNormal, document, 'linear'),
    shininess: material.specularExponent,
    specular: packObjColor(material.specular, 1),
    specularMap: externalObjTexture(material.mapSpecular, document, 'srgb'),
  });
  // A dissolve below 1 is a translucent material; carry it as the diffuse alpha (above) plus a blend
  // alphaMode so the renderer actually blends rather than treating the alpha as coverage-only. A map_d
  // does the same: an alphaMap is INERT while alphaMode is 'opaque', so an authored coverage image would
  // silently do nothing. The scalar and the map multiply, so a material stating both keeps both.
  if (material.dissolve < 1 || material.mapDissolve !== null) result.alphaMode = 'blend';
  // Blinn-Phong has no emissive channel in Flight, so a file that stated one WITHOUT also stating any
  // metallic-roughness value loses it. Reinterpreting the whole material as PBR to keep it would trade a
  // stated Ns for a guessed roughness plus an uncompensable π brightness shift — a worse loss than this.
  if (material.emissive !== null || material.mapEmissive !== null) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'mtl.emissive-dropped', 'resolveObjMaterial', {
      name: material.name,
    });
  }
  // A `map_Bump`/`bump` entry is carried into ObjMaterial but never bound: it is a height field and
  // there is no height-map feature to consume it yet. Reported so a consumer can see their authored
  // map was understood and deliberately not used, rather than silently ignored.
  if (material.mapBump !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.bump-height-map-unbound',
      'objMaterialToBlinnPhong',
      { name: material.name },
    );
  }

  return result;
}

// Converts a parsed MTL material to Flight's StandardPbrMaterial — the reading for a file that states
// metallic-roughness values of its own. Kd → baseColor, Pr → roughness, Pm → metallic, Ke → emissive, and
// the map_Kd/map_Ke/norm filenames → Unresolved External refs. Nothing is inferred here: an absent Pr or
// Pm takes the constructor's own default rather than a value derived from Ns or Ks, because the point of
// this branch is that the file said what it wanted.
function objMaterialToStandardPbr(
  material: Readonly<ObjMaterial>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): StandardPbrMaterial {
  const result = createStandardPbrMaterial({
    alphaMap: externalObjTexture(material.mapDissolve, document, 'linear'),
    baseColor: packObjColor(material.diffuse, material.dissolve),
    baseColorMap: externalObjTexture(material.mapDiffuse, document, 'srgb'),
    emissiveMap: externalObjTexture(material.mapEmissive, document, 'srgb'),
    // Only `norm` binds; `map_Bump` is a height field, not a normal map. See objMaterialToBlinnPhong.
    normalMap: externalObjTexture(material.mapNormal, document, 'linear'),
    ...(material.emissive !== null ? { emissive: packObjColor(material.emissive, 1) } : {}),
    ...(material.metallic !== null ? { metallic: material.metallic } : {}),
    ...(material.roughness !== null ? { roughness: material.roughness } : {}),
  });
  if (material.dissolve < 1 || material.mapDissolve !== null) result.alphaMode = 'blend';

  // MTL states roughness and metallic as SEPARATE grayscale images; glTF — and so StandardPbrMaterial —
  // carries one packed texture sampling roughness from G and metallic from B. Binding a lone grayscale
  // map to that slot would feed the same channel to both terms, so the filenames are parsed and left
  // unbound. Merging them is an image operation over decoded pixels, which a parser must not do:
  // resources are referenced here and resolved later, by an explicit pass.
  if (material.mapRoughness !== null || material.mapMetallic !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.metallic-roughness-map-unpacked',
      'resolveObjMaterial',
      { name: material.name },
    );
  }

  // Sheen, clearcoat, and anisotropy are read into ObjMaterial but not composed onto an
  // ExtendedPbrMaterial here. That gap is a property of THIS PARSER, not of the caller's file, so it is
  // recorded in agents/scene3d-format-coverage.md rather than crumbed — a diagnostic whose cause is our
  // own unfinished wiring tells a consumer nothing they can act on. See the import-diagnostics rule in
  // agents/conventions/diagnostics.md.
  // A `map_Bump`/`bump` entry is carried into ObjMaterial but never bound: it is a height field and
  // there is no height-map feature to consume it yet. Reported so a consumer can see their authored
  // map was understood and deliberately not used, rather than silently ignored.
  if (material.mapBump !== null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'mtl.bump-height-map-unbound',
      'objMaterialToStandardPbr',
      { name: material.name },
    );
  }

  return result;
}

// Whether the file stated any metallic-roughness PBR value for this material — the test that picks the
// shading model. Only directives describing the SHADING MODEL count: Ke/map_Ke name a channel both models
// could carry, so an otherwise-classic material with an emissive does not get reinterpreted as PBR.
function hasObjPbrDirectives(material: Readonly<ObjMaterial>): boolean {
  return (
    material.roughness !== null ||
    material.metallic !== null ||
    material.sheen !== null ||
    material.clearcoat !== null ||
    material.clearcoatRoughness !== null ||
    material.anisotropy !== null ||
    material.anisotropyRotation !== null ||
    material.mapRoughness !== null ||
    material.mapMetallic !== null
  );
}

// Wraps an MTL texture filename as an Unresolved External resource ref; null filename → no map.
function externalObjTexture(
  uri: string | null,
  document: Scene3DDocument,
  colorSpace: TextureColorSpace,
): Texture | null {
  if (uri === null) return null;
  const texture = createExternalTextureRef(uri, null, document.resources);
  texture.colorSpace = colorSpace;
  return texture;
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
// resolves an out-of-range index to null, StandardMaterialKind at draw time). A resolved material is
// appended to the document's materials table and its index cached by name.
//
// A `usemtl` name absent from a SUPPLIED library drops that subset's authored material assignment — a
// data-dropping branch, so it records `obj.material-missing` (deduped by the same name cache, one crumb per
// distinct missing name). When no library was supplied at all the drop is the documented intentional path
// (materials resolved downstream), so it stays quiet.
function resolveObjMaterial(
  name: string,
  library: Readonly<ObjMaterialLibrary> | undefined,
  cache: Map<string, number>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): number {
  if (name === '') return -1;
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const parsed = library?.materials.get(name);
  if (parsed === undefined) {
    if (library !== undefined) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'obj.material-missing', 'resolveObjMaterial', {
        name,
      });
    }
    cache.set(name, -1);
    return -1;
  }
  // The file decides the shading model. See hasObjPbrDirectives — a file that STATED metallic-roughness
  // values is read as PBR; one that did not is read as the Blinn-Phong it actually is.
  const material = (hasObjPbrDirectives(parsed)
    ? objMaterialToStandardPbr(parsed, document, diagnostics)
    : objMaterialToBlinnPhong(parsed, document, diagnostics)) as unknown as Material;
  // Preserve the MTL `newmtl` handle as the material's authored name (findScene3DMaterialByName).
  material.name = name;
  const index = document.materials.length;
  document.materials.push(material as unknown as MaterialLike);
  cache.set(name, index);
  return index;
}

// Resolves a 1-based (possibly negative) OBJ face attribute index against `count`; -1 when the token is
// non-numeric, zero, or resolves outside the table — every case of which drops that attribute reference.
function resolveFaceAttrIndex(token: string, count: number): number {
  const raw = parseInt(token, 10);
  if (!Number.isFinite(raw) || raw === 0) return -1;
  const idx = raw > 0 ? raw - 1 : count + raw;
  return idx < 0 || idx >= count ? -1 : idx;
}

// One accumulated OBJ drop: a total occurrence `count` plus the first offender's `detail` (line, and a
// reason/index/token where the kind carries one), keyed while tallying by kind + discriminator. No origin
// is stored — the tallies are flushed (physically reported) by parseObj, so `parseObj` is every aggregated
// crumb's origin per the collector's emitting-function contract; the drop-site granularity lives in `kind`.
interface ObjDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-element `reportImportDiagnostic` in the parse loop. No-op (and never allocates) when no collector is
// engaged. `firstDetail` is kept from the FIRST offender; later ones only bump the count.
function tallyObjDrop(
  tallies: Map<string, ObjDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}
