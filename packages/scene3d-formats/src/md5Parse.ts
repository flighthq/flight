import {
  composeMatrix4,
  conjugateQuaternion,
  createMatrix4,
  createQuaternion,
  createTransform3D,
  inverseMatrix4,
  multiplyQuaternion,
  rotateVector3ByQuaternion,
  setQuaternion,
  setVector3,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryPositionGroups,
  computeMeshGeometryTangents,
  createMeshGeometry,
  getMeshGeometryTriangleCount,
  getMeshGeometryTriangleVertexIndices,
  getVertexAttributeFloatOffset,
} from '@flighthq/mesh/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type {
  ImportDiagnostic,
  Material,
  MaterialLike,
  Matrix4,
  MeshGeometry,
  MeshTriangleVertexIndices,
  Scene3DDocument,
  Scene3DDocumentMesh,
  Scene3DDocumentSkin,
  Md5Joint,
  Md5Mesh,
  Md5Vertex,
  Md5Weight,
  SkinInfluence,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshKind, Node3DKind } from '@flighthq/types/contract';

import { parseMd5Anim } from './md5AnimParse';
import { findScene3DSkeletonJoints } from './sceneSkeleton';
import {
  convertPositionsZUpToYUp,
  convertQuaternionsZUpToYUp,
  createExternalTextureRef,
  MAX_SKIN_INFLUENCES,
  packSkinInfluences,
  reverseTriangleWinding,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';

// A single MD5 joint influence on a vertex, extended (over the shared SkinInfluence) with the weight's
// resolved model-space position so the bind position can be baked from the same top-4 reduced set the
// skin stores. File-local: it never leaves this parser's bind-baking loop.
interface Md5WeightInfluence extends SkinInfluence {
  mx: number;
  my: number;
  mz: number;
}

// Parses an id Tech 4 MD5 mesh file (.md5mesh) into a Scene3D. Convenience over
// `createScene3DFromDocument(parseMd5Mesh(source, diagnostics))`. See parseMd5Mesh for the import model.
export function createScene3DFromMd5Mesh(source: string, diagnostics?: ImportDiagnostic[]): Scene3D {
  return createScene3DFromDocument(parseMd5Mesh(source, diagnostics));
}

// One-call MD5 import: builds the Scene3D from the `.md5mesh` source and, when a `.md5anim` source is
// given, binds its skeletal animation to that mesh's skeleton and stores it in `scene.animations`. MD5
// splits mesh and animation across two files that must be composed against the same skeleton — the mesh
// supplies the joint nodes the animation's channels bind to — so this is the composition callers would
// otherwise hand-write (createScene3DFromMd5Mesh, then findScene3DSkeletonJoints, then parseMd5Anim). The
// `.md5anim` carries no name of its own, so the clip is keyed 'default'; a caller loading several
// animations against one mesh uses parseMd5Anim directly and keys each as it likes. Warns (and skips the
// animation) when `animSource` is given but the mesh carries no skeleton to bind it to.
export function importMd5Mesh(
  meshSource: string,
  animSource?: string | null,
  diagnostics?: ImportDiagnostic[],
): Scene3D {
  const scene = createScene3DFromMd5Mesh(meshSource, diagnostics);
  if (animSource == null) return scene;

  const joints = findScene3DSkeletonJoints(scene.root);
  if (joints === null) {
    // The mesh carried no skeleton, so a recognized-but-unbindable animation is skipped (the mesh is fine).
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'md5mesh.animation-no-skeleton',
      'importMd5Mesh',
    );
    return scene;
  }

  const clip = parseMd5Anim(animSource, joints, diagnostics);
  if (clip !== null) scene.animations.default = clip;
  return scene;
}

// Parses an id Tech 4 MD5 mesh file (.md5mesh) into a format-neutral Scene3DDocument. The ASCII
// line-oriented format contains a skeleton (joints) and one or more mesh sections. Each mesh section
// becomes one document Mesh node (skinned layout, joints0/weights0), and the joints become a "skeleton"
// group + joint node subtree in the document `nodes` table plus one entry in `skins` (joints by node
// index, inverse-bind per joint). The subtlety that MD5 skinning gets wrong: .md5mesh joint transforms
// are ABSOLUTE (object-space), but .md5anim frames are parent-RELATIVE — so each joint node here carries
// its parent-RELATIVE local transform (parent × child rebuilds the absolute world), while parseMd5Anim
// drives its already-relative values onto the same joints. Both then pose one consistent hierarchy. The
// skin's inverse-bind is derived directly from the ABSOLUTE bind world (the document requires it explicit,
// where the live scene path let createSkeleton3D derive it from the joint nodes' world transforms).
//
// Vertex positions are computed from weighted joint influences: for each vertex, the final position is the
// sum of each weight's bias multiplied by the joint-space-transformed weight position plus the joint
// position. MD5's per-section `shader` becomes a BlinnPhongMaterial (the id Tech texture-and-lighting
// model) whose diffuseMap references the shader path as an unresolved External ref — the parser
// references, it does not load; resolution is @flighthq/scene3d-resources's explicit step.
//
// MD5 splits mesh and animation across two files, so the document's `animations` table is empty. Use the
// `importMd5Mesh(meshSource, animSource?)` composer to bind a paired `.md5anim` in one call, or compose
// onto the assembled scene directly:
// `scene.animations['walk'] = parseMd5Anim(animSource, findScene3DSkeletonJoints(scene.root)!)`.
//
// Malformed lines record a diagnostic and are skipped; the function never throws on bad input.
export function parseMd5Mesh(source: string, diagnostics?: ImportDiagnostic[]): Scene3DDocument {
  const document = emptyMd5Document();

  // Repeated malformed lines/indices are tallied here and flushed as ONE crumb per (kind, discriminator)
  // at the end — parseMd5Mesh is the emitting function, so it is every aggregated crumb's origin. Null
  // (and every tally call a no-op) when no collector is engaged, so an unopted parse stays allocation-free.
  const md5Drops = diagnostics ? new Map<string, Md5DropTally>() : null;

  const joints: Md5Joint[] = [];
  const meshes: Md5Mesh[] = [];

  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('MD5Version')) {
      const version = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(version) && version !== 10) {
        // The block layout is assumed to be v10 and parsing continues regardless — a degraded recovery.
        tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.unsupported-version', '', { version });
      }
      continue;
    }

    if (line.startsWith('commandline') || line.startsWith('numJoints') || line.startsWith('numMeshes')) {
      continue;
    }

    if (line === 'joints {') {
      i = parseJointsBlock(lines, i, joints, md5Drops);
      continue;
    }

    if (line === 'mesh {') {
      const mesh = parseMeshBlock(lines, i, md5Drops);
      i = mesh.nextLine;
      meshes.push(mesh.result);
      continue;
    }
  }

  // Nothing recognisable was found. Without this the parser returns a structurally valid, completely
  // empty document and an EMPTY diagnostics array — so feeding it an .obj, an .md5anim, or an HTML error
  // page is indistinguishable from successfully importing a file that happens to contain no geometry.
  // `parseMd5Anim` already rejects its equivalent (`md5anim.no-data`); this is the missing twin.
  if (joints.length === 0 && meshes.length === 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md5mesh.no-data', 'parseMd5Mesh');
  }

  // Emit the skeleton into the document node table (skeleton group + joint nodes) and its skin (joints by
  // node index + inverse-bind). The skin index every mesh section binds to.
  let skinIndex: number | undefined;
  if (joints.length > 0) {
    skinIndex = document.skins.length;
    document.skins.push(buildMd5SkeletonDocument(joints, document, md5Drops));
  }

  // Build mesh geometry from weighted vertices. Each vertex bakes its bind-pose position from the joint
  // influences and keeps those influences as the skinned layout's joints0/weights0 channels so the mesh can
  // be re-deformed every frame from an animated skeleton. Linear-blend skinning carries at most
  // MAX_SKIN_INFLUENCES influences per vertex; vertices with more are reduced to the highest-weight four,
  // counted here so the truncation is reported once rather than staying silent.
  let truncatedVertexCount = 0;
  let maxObservedInfluences = 0;
  for (let m = 0; m < meshes.length; m++) {
    const md5Mesh = meshes[m];
    const vertices: number[] = [];
    const indices: number[] = [];

    // Reused per-vertex influence scratch (up to 4 joint/weight pairs, top-by-bias).
    const jointScratch = [0, 0, 0, 0];
    const weightScratch = [0, 0, 0, 0];

    for (let v = 0; v < md5Mesh.vertices.length; v++) {
      const vert = md5Mesh.vertices[v];
      // Each influence keeps its joint index, bias, and the weight's model-space position (mx,my,mz) so
      // the bind position can be baked from the SAME reduced set the skin stores (see below).
      const influences: Md5WeightInfluence[] = [];

      for (let w = 0; w < vert.countWeights; w++) {
        const weightIndex = vert.startWeight + w;
        if (weightIndex >= md5Mesh.weights.length) {
          // The vertex keeps the influences read so far (a partial, degraded vertex) — Recover.
          tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.vertex-weight-out-of-range', '', {
            firstIndex: weightIndex,
            firstVertex: v,
          });
          break;
        }
        const weight = md5Mesh.weights[weightIndex];
        if (weight.jointIndex < 0 || weight.jointIndex >= joints.length) {
          // The bad weight is skipped; the vertex keeps its other influences — Recover.
          tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.weight-joint-out-of-range', '', {
            firstIndex: weight.jointIndex,
            firstWeight: weightIndex,
          });
          continue;
        }
        const joint = joints[weight.jointIndex];

        // Rotate weight position by joint orientation quaternion.
        const rx = quatRotateVec3X(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );
        const ry = quatRotateVec3Y(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );
        const rz = quatRotateVec3Z(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );

        influences.push({
          jointIndex: weight.jointIndex,
          mx: joint.positionX + rx,
          my: joint.positionY + ry,
          mz: joint.positionZ + rz,
          weight: weight.bias,
        });
      }

      // Bake the bind position from the top-MAX_SKIN_INFLUENCES highest-bias influences, renormalized —
      // the exact reduced set packSkinInfluences emits as joints0/weights0. Baking from all influences
      // while skinning from only the top four would leave a >4-influence vertex's stored bind position
      // disagreeing with what the CPU/GPU skin reproduces at bind pose. Sorting once here also fixes the
      // reduction order packSkinInfluences (which re-sorts identically) will keep.
      influences.sort((a, b) => b.weight - a.weight);
      const kept = Math.min(influences.length, MAX_SKIN_INFLUENCES);
      if (influences.length > MAX_SKIN_INFLUENCES) {
        truncatedVertexCount++;
        if (influences.length > maxObservedInfluences) maxObservedInfluences = influences.length;
      }
      let biasSum = 0;
      for (let i = 0; i < kept; i++) biasSum += influences[i].weight;
      let px = 0;
      let py = 0;
      let pz = 0;
      for (let i = 0; i < kept; i++) {
        const normWeight = biasSum > 0 ? influences[i].weight / biasSum : 0;
        px += normWeight * influences[i].mx;
        py += normWeight * influences[i].my;
        pz += normWeight * influences[i].mz;
      }

      packSkinInfluences(influences, jointScratch, weightScratch);

      // Position (3 floats) in MD5's native Z-up space; batch-converted below.
      vertices.push(px, py, pz);
      // Normal (3 floats) — MD5 mesh carries none; zero-filled here, regenerated after Y-up convert.
      vertices.push(0, 0, 0);
      // Tangent (4 floats) — MD5 mesh does not carry tangents; zero-filled.
      vertices.push(0, 0, 0, 0);
      // UV (2 floats).
      vertices.push(vert.u, vert.v);
      // joints0 (4 floats) — the influencing joint indices, carried as float indices.
      vertices.push(jointScratch[0], jointScratch[1], jointScratch[2], jointScratch[3]);
      // weights0 (4 floats) — the blend weights, renormalized to sum 1 (or all-zero for no influence).
      vertices.push(weightScratch[0], weightScratch[1], weightScratch[2], weightScratch[3]);
    }

    // Convert vertex positions from Z-up to Y-up in the interleaved buffer (positions only; the
    // stride walk skips the other channels).
    convertPositionsZUpToYUp(vertices, SKINNED_FLOATS_PER_VERTEX, 0);

    // Triangle indices address the vertex array, and nothing before this point bounds them. An index past
    // the end reads undefined during normal derivation and poisons the normals of the two GOOD vertices it
    // shares a triangle with; a negative one is worse, because `Uint32Array.from` wraps it to roughly 4.29
    // billion and hands that to the GPU index buffer. Drop the triangle and keep the mesh — a missing face
    // is a visible, bounded loss, where either alternative is silent and unbounded.
    const vertexCount = md5Mesh.vertices.length;
    for (let t = 0; t + 2 < md5Mesh.indices.length; t += 3) {
      const v0 = md5Mesh.indices[t];
      const v1 = md5Mesh.indices[t + 1];
      const v2 = md5Mesh.indices[t + 2];
      if (v0 < 0 || v1 < 0 || v2 < 0 || v0 >= vertexCount || v1 >= vertexCount || v2 >= vertexCount) {
        tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.triangle-vertex-out-of-range', '', {
          firstCount: vertexCount,
          firstIndex: v0 < 0 || v0 >= vertexCount ? v0 : v1 < 0 || v1 >= vertexCount ? v1 : v2,
          firstTriangle: t / 3,
        });
        continue;
      }
      indices.push(v0, v1, v2);
    }

    // id Tech 4 winds MD5 triangles clockwise (front-facing under D3's convention); the Z-up→Y-up
    // position conversion is a rotation (determinant +1) so it preserves that winding, leaving the
    // triangles clockwise in Flight's counter-clockwise-front space. Reverse them here so front faces
    // stay front (backface culling) and computeMeshGeometryNormals — which crosses (v1−v0)×(v2−v0),
    // the CCW convention — derives outward normals rather than inward. Mirrors the AWD importer.
    reverseTriangleWinding(indices);

    if (indices.length > 0) {
      const geometry = createMeshGeometry({
        indices: Uint32Array.from(indices),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
        vertices: new Float32Array(vertices),
      });
      // MD5 carries one UV per vertex and no smoothing groups, so texture-coordinate seams duplicate
      // otherwise identical bind positions. Share their normal and tangent accumulation while keeping
      // the complete vertex records and each mirrored side's handedness independent.
      const positionGroups = computeMeshGeometryPositionGroups(geometry);
      computeMeshGeometryNormals(geometry, geometry, positionGroups);
      // MD5 carries no tangent stream either. Generate a real tangent basis from the newly derived
      // normals and authored UVs before any skin bind pose is captured; mirrored UV orientations may
      // split a vertex, and computeMeshGeometryTangents copies its complete joints/weights record.
      computeMeshGeometryTangents(geometry, geometry, positionGroups);
      // MD5 authors its tangent frames from TEXTURE POLARITY, and Flight's source-winding reversal
      // already produces the equivalent handedness — so the final order is the thing to read the sign
      // from, per triangle, rather than applying one flip to the whole format. Runs after the split
      // above so it reads the vertices that will actually be emitted.
      canonicalizeMd5TangentHandedness(geometry, md5Drops);
      // MD5's per-section `shader` names the material/texture the mesh uses. MD5 has no lighting-model
      // parameters, so decode it as a BlinnPhongMaterial (the id Tech texture-and-lighting model) whose
      // diffuseMap references the shader path; resolution of that path is the caller's step.
      const meshMaterials: number[] = [];
      if (md5Mesh.shader.length > 0) {
        const material = createBlinnPhongMaterial({
          diffuseMap: createExternalTextureRef(md5Mesh.shader, null, document.resources),
        }) as unknown as Material;
        // MD5's shader path is the material's authored identity — preserve it as the name.
        material.name = md5Mesh.shader;
        meshMaterials.push(document.materials.length);
        document.materials.push(material as unknown as MaterialLike);
      }
      const documentMesh: Scene3DDocumentMesh = { geometry, materials: meshMaterials };
      if (skinIndex !== undefined) documentMesh.skin = skinIndex;
      const meshIndex = document.meshes.length;
      document.meshes.push(documentMesh);
      const nodeIndex = document.nodes.length;
      document.nodes.push({ children: [], kind: MeshKind, mesh: meshIndex, transform: createTransform3D() });
      document.scenes[0].rootNodes.push(nodeIndex);
    } else {
      // A parsed mesh section with no triangles produces no node — the section's geometry is dropped.
      tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.mesh-empty', '', {});
    }
  }

  if (truncatedVertexCount > 0) {
    // Pre-counted total (not a per-occurrence tally): linear-blend skinning keeps at most 4 influences, so
    // the extras are reduced to the highest-weight four — a universal, benign clamp. Emitted from parseMd5Mesh.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'md5mesh.vertex-over-influenced',
      'parseMd5Mesh',
      {
        count: truncatedVertexCount,
        maxInfluences: maxObservedInfluences,
      },
    );
  }

  // Flush the aggregated tallies as one crumb per (kind, discriminator) with its total count.
  if (md5Drops !== null) {
    for (const tally of md5Drops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parseMd5Mesh', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }

  return document;
}

// Resolves tangent.w from the authored UV texture polarity of the triangles each vertex actually
// belongs to, in FINAL emitted order. MD5 derives its tangent frames from texture polarity, and the
// source-winding reversal this importer already performs produces the equivalent handedness, so the
// sign is a per-triangle property to be read — not a format-wide flip to be applied.
//
// TWO PASSES, DELIBERATELY. The census reads every triangle before a single w is written, because a
// vertex is shared by several triangles and writing as we go would let an earlier write change what a
// later triangle sees. Collapsing these into one loop reintroduces exactly that hazard.
//
// A vertex whose triangles disagree on a NONZERO sign is an invariant failure, not a last-write-wins:
// the geometry claims two handednesses for one frame, which the mirrored-UV split upstream exists to
// prevent. It is reported rather than silently resolved. Where polarity is zero — a degenerate UV
// triangle with no orientation to read — the generated handedness is left untouched.
//
// Importer-local ON PURPOSE: `writeAccumulatedTangent` serves formats that supply their own normals,
// which may legitimately disagree with face winding. MD5 derives its normals from the just-reversed
// indices, so the convention is only well-founded at this one seam.
function canonicalizeMd5TangentHandedness(geometry: MeshGeometry, md5Drops: Map<string, Md5DropTally> | null): void {
  const floatsPerVertex = geometry.layout.stride / 4;
  const tangentOffset = getVertexAttributeFloatOffset(geometry.layout, 'tangent');
  const uvOffset = getVertexAttributeFloatOffset(geometry.layout, 'uv0');
  if (floatsPerVertex <= 0 || tangentOffset < 0 || uvOffset < 0) return;

  const vertices = geometry.vertices;
  const vertexCount = Math.floor(vertices.length / floatsPerVertex);
  const triangleCount = getMeshGeometryTriangleCount(geometry);
  const corner: MeshTriangleVertexIndices = { i0: 0, i1: 0, i2: 0 };
  const resolved = new Int8Array(vertexCount);
  let contradictions = 0;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    if (!getMeshGeometryTriangleVertexIndices(corner, geometry, triangle)) continue;
    const u0 = corner.i0 * floatsPerVertex + uvOffset;
    const u1 = corner.i1 * floatsPerVertex + uvOffset;
    const u2 = corner.i2 * floatsPerVertex + uvOffset;
    const determinant =
      (vertices[u1] - vertices[u0]) * (vertices[u2 + 1] - vertices[u0 + 1]) -
      (vertices[u2] - vertices[u0]) * (vertices[u1 + 1] - vertices[u0 + 1]);
    if (determinant === 0) continue;
    const sign = determinant < 0 ? -1 : 1;
    for (const vertex of [corner.i0, corner.i1, corner.i2]) {
      if (resolved[vertex] === 0) resolved[vertex] = sign;
      else if (resolved[vertex] !== sign) contradictions++;
    }
  }

  if (contradictions > 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.tangent-handedness-contradiction', '', {
      firstVertices: contradictions,
    });
  }

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    if (resolved[vertex] === 0) continue;
    vertices[vertex * floatsPerVertex + tangentOffset + 3] = resolved[vertex];
  }
}

// Emits an MD5 joint list into a Scene3DDocument as a "skeleton" group node + one joint node per MD5 joint
// (with its parent-RELATIVE local transform), and returns the Scene3DDocumentSkin whose joints are those node
// indices and whose inverse-bind is derived from the ABSOLUTE bind world. Appends the nodes to
// `document.nodes` and wires the skeleton-group node as a scene root plus each joint under its parent joint
// (roots under the group) via `children` index lists.
function buildMd5SkeletonDocument(
  joints: readonly Md5Joint[],
  document: Scene3DDocument,
  md5Drops: Map<string, Md5DropTally> | null,
): Scene3DDocumentSkin {
  const skeletonRootIndex = document.nodes.length;
  document.nodes.push({ children: [], kind: Node3DKind, name: 'skeleton', transform: createTransform3D() });
  document.scenes[0].rootNodes.push(skeletonRootIndex);

  // Convert joint positions and orientations from Z-up to Y-up.
  const jointPositions: number[] = [];
  const jointOrientations: number[] = [];
  for (const joint of joints) {
    jointPositions.push(joint.positionX, joint.positionY, joint.positionZ);
    jointOrientations.push(joint.orientationX, joint.orientationY, joint.orientationZ, joint.orientationW);
  }
  convertPositionsZUpToYUp(jointPositions);
  convertQuaternionsZUpToYUp(jointOrientations);

  const jointNodeIndices: number[] = [];
  for (let j = 0; j < joints.length; j++) {
    jointNodeIndices.push(document.nodes.length);
    document.nodes.push({ children: [], kind: Node3DKind, name: joints[j].name, transform: createTransform3D() });
  }

  // The .md5mesh joints are ABSOLUTE (object-space) transforms, but the Node3D hierarchy composes parent
  // × child, so each joint's LOCAL transform must be its transform relative to its parent: localQuat =
  // parentAbsQuat⁻¹ · absQuat, localPos = parentAbsQuat⁻¹ · (absPos − parentAbsPos). This is the crux MD5
  // skinning gets wrong two ways: setting the absolute transform directly as the local (double-accumulates →
  // explodes under animation), or flattening the skeleton (breaks the .md5anim frames, which are
  // parent-RELATIVE and rely on the hierarchy to compose to absolute — see parseMd5Anim). With bind
  // converted to relative here and anim already relative, both pose the same nested joints consistently.
  // Roots (parentIndex < 0) keep their absolute transform as local.
  const parentConj = createQuaternion();
  const relPos = { x: 0, y: 0, z: 0 };
  const relQuat = createQuaternion();
  for (let j = 0; j < joints.length; j++) {
    const pi = j * 3;
    const qi = j * 4;
    const parentIndex = joints[j].parentIndex;
    let localPx = jointPositions[pi];
    let localPy = jointPositions[pi + 1];
    let localPz = jointPositions[pi + 2];
    let localQx = jointOrientations[qi];
    let localQy = jointOrientations[qi + 1];
    let localQz = jointOrientations[qi + 2];
    let localQw = jointOrientations[qi + 3];
    // Self-parent and cycles are excluded HERE too, not only in the nesting pass below: a joint that took
    // the parent-relative branch while the nesting pass treated it as a root would have its transform
    // made relative to a parent it is never composed against, which double-counts nothing and silently
    // misplaces it.
    if (parentIndex >= 0 && parentIndex < joints.length && parentIndex !== j && !isMd5JointCycle(joints, j)) {
      const ppi = parentIndex * 3;
      const pqi = parentIndex * 4;
      conjugateQuaternion(parentConj, {
        w: jointOrientations[pqi + 3],
        x: jointOrientations[pqi],
        y: jointOrientations[pqi + 1],
        z: jointOrientations[pqi + 2],
      });
      rotateVector3ByQuaternion(
        relPos,
        {
          x: localPx - jointPositions[ppi],
          y: localPy - jointPositions[ppi + 1],
          z: localPz - jointPositions[ppi + 2],
        },
        parentConj,
      );
      multiplyQuaternion(relQuat, parentConj, { w: localQw, x: localQx, y: localQy, z: localQz });
      localPx = relPos.x;
      localPy = relPos.y;
      localPz = relPos.z;
      localQx = relQuat.x;
      localQy = relQuat.y;
      localQz = relQuat.z;
      localQw = relQuat.w;
    } else if (parentIndex !== -1) {
      // Every parent that is neither a real joint nor the -1 root sentinel lands here, and it is one
      // report rather than only the too-large half: `parentIndex < -1` used to match no branch at all and
      // was silently indistinguishable from a legitimate root, while `>= length` was correctly reported.
      // A joint naming ITSELF is included because `addNodeChild` throws on a self-child, out of a parser
      // documented never to throw.
      tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.joint-parent-out-of-range', '', {
        firstJoint: j,
        firstParent: parentIndex,
      });
    }
    const transform = document.nodes[jointNodeIndices[j]].transform;
    setVector3(transform.position, localPx, localPy, localPz);
    setQuaternion(transform.rotation, localQx, localQy, localQz, localQw);
  }

  // Nest by parent index so parent × child composition reconstructs each joint's absolute world transform
  // from the parent-relative locals set above; roots hang under the skeleton group.
  for (let j = 0; j < joints.length; j++) {
    const parentIndex = joints[j].parentIndex;
    // `isMd5JointCycle` covers what a self-check alone cannot: `addNodeChildAt` rejects a node parented to
    // itself but never walks the ancestor chain, so a two-joint cycle would be built into a detached
    // subgraph hanging off nothing, silently absent from the skeleton it belongs to.
    if (parentIndex >= 0 && parentIndex < joints.length && parentIndex !== j && !isMd5JointCycle(joints, j)) {
      document.nodes[jointNodeIndices[parentIndex]].children.push(jointNodeIndices[j]);
    } else {
      document.nodes[skeletonRootIndex].children.push(jointNodeIndices[j]);
    }
  }

  // Derive each joint's inverse-bind matrix from its ABSOLUTE (Y-up) bind world transform: inverseBind =
  // (compose(absPos, absQuat, 1))⁻¹. MD5 joints are already absolute, so no hierarchy walk is needed — this
  // is exactly what the live scene path produced by letting createSkeleton3D derive the palette from the
  // joint nodes' world transforms (which recompose to these absolutes).
  const inverseBind: Matrix4[] = [];
  const bindWorld = createMatrix4();
  for (let j = 0; j < joints.length; j++) {
    const pi = j * 3;
    const qi = j * 4;
    composeMatrix4(
      bindWorld,
      { x: jointPositions[pi], y: jointPositions[pi + 1], z: jointPositions[pi + 2] },
      {
        w: jointOrientations[qi + 3],
        x: jointOrientations[qi],
        y: jointOrientations[qi + 1],
        z: jointOrientations[qi + 2],
      },
      { x: 1, y: 1, z: 1 },
    );
    const inv = createMatrix4();
    inverseMatrix4(inv, bindWorld);
    inverseBind.push(inv);
  }

  return { inverseBind, joints: jointNodeIndices };
}

// The empty Scene3DDocument returned before assembly begins — every table present.
function emptyMd5Document(): Scene3DDocument {
  return {
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
}

// Parses the joints { ... } block. Returns the line index after the closing brace.
function parseJointsBlock(
  lines: readonly string[],
  startLine: number,
  joints: Md5Joint[],
  md5Drops: Map<string, Md5DropTally> | null,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const joint = parseJointLine(line, md5Drops, i - 1);
    if (joint !== null) joints.push(joint);
  }
  tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.joints-block-unclosed', '', {});
  return i;
}

// Parses a single joint line: "name" parentIndex ( px py pz ) ( qx qy qz )
function parseJointLine(line: string, md5Drops: Map<string, Md5DropTally> | null, lineIndex: number): Md5Joint | null {
  // Extract the quoted name.
  const nameStart = line.indexOf('"');
  const nameEnd = line.indexOf('"', nameStart + 1);
  if (nameStart < 0 || nameEnd < 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-joint', 'missing-name-quotes', {
      firstLine: lineIndex + 1,
      reason: 'missing-name-quotes',
    });
    return null;
  }
  const name = line.slice(nameStart + 1, nameEnd);

  // The remainder after the closing quote contains: parentIndex ( px py pz ) ( qx qy qz )
  const rest = line.slice(nameEnd + 1).trim();
  const tokens = rest
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length < 7) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-joint', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
    return null;
  }

  const parentIndex = parseInt(tokens[0], 10);
  const positionX = parseFloat(tokens[1]);
  const positionY = parseFloat(tokens[2]);
  const positionZ = parseFloat(tokens[3]);
  let orientationX = parseFloat(tokens[4]);
  let orientationY = parseFloat(tokens[5]);
  let orientationZ = parseFloat(tokens[6]);

  if (
    !Number.isFinite(parentIndex) ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    !Number.isFinite(positionZ) ||
    !Number.isFinite(orientationX) ||
    !Number.isFinite(orientationY) ||
    !Number.isFinite(orientationZ)
  ) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-joint', 'non-numeric', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }

  // Reconstruct quaternion W from XYZ: w = -sqrt(1 - x^2 - y^2 - z^2).
  //
  // A squared sum at or past 1 has two causes the arithmetic cannot tell apart — float noise in a valid
  // file, where the excess is ~1e-7, and corrupt components, where it is not. Zeroing w without
  // renormalizing xyz was right for the first and silently wrong for the second: an orientation of
  // (2,0,0) yields the quaternion (2,0,0,0), which has norm 2 and is not a rotation at all. Composed
  // into the bind pose it SCALES the joint by four and corrupts the inverse-bind matrix, and driven by an
  // animation it keeps scaling. Past a tolerance that float error cannot reach, renormalize and report.
  let sumSq = orientationX * orientationX + orientationY * orientationY + orientationZ * orientationZ;
  if (sumSq > 1 + QUATERNION_SUM_TOLERANCE) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.joint-orientation-not-unit', '', {
      firstLine: lineIndex + 1,
    });
    const scale = 1 / Math.sqrt(sumSq);
    orientationX *= scale;
    orientationY *= scale;
    orientationZ *= scale;
    sumSq = 1;
  }
  const orientationW = sumSq < 1 ? -Math.sqrt(1 - sumSq) : 0;

  return {
    name,
    orientationW,
    orientationX,
    orientationY,
    orientationZ,
    parentIndex,
    positionX,
    positionY,
    positionZ,
  };
}

// Parses a mesh { ... } block. Returns the parsed mesh and the line index after the closing brace.
function parseMeshBlock(
  lines: readonly string[],
  startLine: number,
  md5Drops: Map<string, Md5DropTally> | null,
): { nextLine: number; result: Md5Mesh } {
  let shader = '';
  const vertices: Md5Vertex[] = [];
  const weights: Md5Weight[] = [];
  const indices: number[] = [];
  // Triangles are collected as records so they can be placed by their declared ordinal like every other
  // record, then flattened into `indices` once the block closes.
  const triangles: (readonly [number, number, number])[] = [];
  let declaredVerts = -1;
  let declaredTris = -1;
  let declaredWeights = -1;

  let closed = false;
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') {
      closed = true;
      break;
    }
    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('shader')) {
      const nameStart = line.indexOf('"');
      const nameEnd = line.indexOf('"', nameStart + 1);
      if (nameStart >= 0 && nameEnd > nameStart) {
        shader = line.slice(nameStart + 1, nameEnd);
      } else {
        // A `shader` directive with no quoted name: the mesh is emitted WITHOUT a material (the shader path
        // is the mesh's only material/texture reference). Recover — geometry survives, the binding is lost.
        tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.shader-unquoted', '', { firstLine: i });
      }
      continue;
    }

    if (line.startsWith('numverts')) {
      declaredVerts = parseMd5DeclaredCount(line);
      continue;
    }
    if (line.startsWith('numtris')) {
      declaredTris = parseMd5DeclaredCount(line);
      continue;
    }
    if (line.startsWith('numweights')) {
      declaredWeights = parseMd5DeclaredCount(line);
      continue;
    }

    if (line.startsWith('vert ')) {
      const vert = parseVertLine(line, md5Drops, i - 1);
      if (vert !== null) {
        alignMd5Records(vertices, vert.index, md5Drops, 'vert', () => ({
          countWeights: 0,
          startWeight: 0,
          u: 0,
          v: 0,
        }));
        if (vert.index === vertices.length) vertices.push(vert.record);
      }
      continue;
    }

    if (line.startsWith('tri ')) {
      const tri = parseTriLine(line, md5Drops, i - 1);
      if (tri !== null) {
        alignMd5Records(triangles, tri.index, md5Drops, 'tri', () => [0, 0, 0] as const);
        if (tri.index === triangles.length) triangles.push(tri.record);
      }
      continue;
    }

    if (line.startsWith('weight ')) {
      const weight = parseWeightLine(line, md5Drops, i - 1);
      if (weight !== null) {
        alignMd5Records(weights, weight.index, md5Drops, 'weight', () => ({
          bias: 0,
          jointIndex: -1,
          positionX: 0,
          positionY: 0,
          positionZ: 0,
        }));
        if (weight.index === weights.length) weights.push(weight.record);
      }
      continue;
    }
  }

  // Both exits finish through here. Splitting the reconciliation across a closing-brace return and a
  // ran-out-of-lines return is how one of them ends up missing a check the other has.
  reportMd5CountDisagreement(md5Drops, 'vert', declaredVerts, vertices.length);
  reportMd5CountDisagreement(md5Drops, 'tri', declaredTris, triangles.length);
  reportMd5CountDisagreement(md5Drops, 'weight', declaredWeights, weights.length);
  for (const tri of triangles) indices.push(tri[0], tri[1], tri[2]);
  if (!closed) tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.mesh-block-unclosed', '', {});
  return { nextLine: i, result: { indices, shader, vertices, weights } };
}

// Parses: vert vertIndex ( u v ) startWeight countWeights
function parseVertLine(
  line: string,
  md5Drops: Map<string, Md5DropTally> | null,
  lineIndex: number,
): { index: number; record: Md5Vertex } | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // tokens: ["vert", vertIndex, u, v, startWeight, countWeights]
  if (tokens.length < 6) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-vert', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
    return null;
  }

  const u = parseFloat(tokens[2]);
  const v = parseFloat(tokens[3]);
  const startWeight = parseInt(tokens[4], 10);
  const countWeights = parseInt(tokens[5], 10);

  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(startWeight) || !Number.isFinite(countWeights)) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-vert', 'non-numeric', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }

  // The lower bound the downstream `weightIndex >= weights.length` check cannot see: a negative
  // startWeight passes it, indexes before the array, and dereferences undefined — a TypeError out of a
  // parser documented never to throw. A non-positive countWeights is separately meaningless: the vertex
  // would take no influence at all and silently collapse to the model origin.
  if (startWeight < 0 || countWeights <= 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-vert', 'weight-range', {
      firstLine: lineIndex + 1,
      reason: 'weight-range',
    });
    return null;
  }

  const index = parseMd5RecordOrdinal(tokens[1]);
  if (index < 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-vert', 'bad-index', {
      firstLine: lineIndex + 1,
      reason: 'bad-index',
    });
    return null;
  }
  return { index, record: { countWeights, startWeight, u, v } };
}

// Parses: tri triIndex v0 v1 v2
function parseTriLine(
  line: string,
  md5Drops: Map<string, Md5DropTally> | null,
  lineIndex: number,
): { index: number; record: readonly [number, number, number] } | null {
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  // tokens: ["tri", triIndex, v0, v1, v2]
  if (tokens.length < 5) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-tri', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
    return null;
  }

  const v0 = parseInt(tokens[2], 10);
  const v1 = parseInt(tokens[3], 10);
  const v2 = parseInt(tokens[4], 10);

  if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2)) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-tri', 'non-numeric', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }

  const index = parseMd5RecordOrdinal(tokens[1]);
  if (index < 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-tri', 'bad-index', {
      firstLine: lineIndex + 1,
      reason: 'bad-index',
    });
    return null;
  }
  return { index, record: [v0, v1, v2] as const };
}

// Parses: weight weightIndex jointIndex bias ( px py pz )
function parseWeightLine(
  line: string,
  md5Drops: Map<string, Md5DropTally> | null,
  lineIndex: number,
): { index: number; record: Md5Weight } | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // tokens: ["weight", weightIndex, jointIndex, bias, px, py, pz]
  if (tokens.length < 7) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-weight', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
    return null;
  }

  const jointIndex = parseInt(tokens[2], 10);
  const bias = parseFloat(tokens[3]);
  const positionX = parseFloat(tokens[4]);
  const positionY = parseFloat(tokens[5]);
  const positionZ = parseFloat(tokens[6]);

  if (
    !Number.isFinite(jointIndex) ||
    !Number.isFinite(bias) ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    !Number.isFinite(positionZ)
  ) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-weight', 'non-numeric', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric',
    });
    return null;
  }

  const index = parseMd5RecordOrdinal(tokens[1]);
  if (index < 0) {
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5mesh.malformed-weight', 'bad-index', {
      firstLine: lineIndex + 1,
      reason: 'bad-index',
    });
    return null;
  }
  return { index, record: { bias, jointIndex, positionX, positionY, positionZ } };
}

// Rotates a vector (vx, vy, vz) by quaternion (qx, qy, qz, qw) and returns the X component.
// Formula: t = 2 * cross(q.xyz, v); result = v + qw * t + cross(q.xyz, t)
function quatRotateVec3X(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vx + qw * tx + (qy * tz - qz * ty);
}

// Returns the Y component of quaternion-rotated vector.
function quatRotateVec3Y(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vy + qw * ty + (qz * tx - qx * tz);
}

// Returns the Z component of quaternion-rotated vector.
function quatRotateVec3Z(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vz + qw * tz + (qx * ty - qy * tx);
}

// One accumulated MD5-mesh drop: a total occurrence `count` plus the first offender's `detail`, keyed by
// kind + discriminator. No origin is stored — the tallies are flushed (physically reported) by parseMd5Mesh,
// so it is every aggregated crumb's origin per the collector's emitting-function contract; `kind` carries
// the drop-site granularity.
interface Md5DropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-line/per-index `reportImportDiagnostic`. No-op (never allocates) when no collector is engaged.
// `firstDetail` is kept from the FIRST offender; later ones only bump the count.
function tallyMd5Drop(
  tallies: Map<string, Md5DropTally> | null,
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

// The count a `numverts` / `numtris` / `numweights` line declares, or -1 when it is absent or unreadable.
function parseMd5DeclaredCount(line: string): number {
  const value = parseInt(line.split(/\s+/)[1], 10);
  return Number.isFinite(value) && value >= 0 ? value : -1;
}

// Brings `records` up to the position `index` claims, so the record about to be appended lands where the
// file says it belongs.
//
// MD5 records declare their own ordinal — `vert 0`, `weight 3`, `tri 5` — and every cross-reference in
// the format addresses them by ARRAY POSITION: a vert names a weight range, a tri names verts. Appending
// in encounter order silently redefines every one of those references the moment one malformed line is
// dropped, and nothing downstream can notice, because the shifted indices are all still in range and all
// still resolve. The declared ordinal is a per-record checksum on exactly the position everything else
// depends on, so a gap is filled with an explicit placeholder rather than closed by a shift.
//
// A placeholder is deliberately built to fail the checks it will meet later — a weight with joint -1, a
// vertex with no influences — so it is reported where it is used rather than passing as real data.
function alignMd5Records<T>(
  records: T[],
  index: number,
  md5Drops: Map<string, Md5DropTally> | null,
  record: string,
  placeholder: () => T,
): void {
  if (index === records.length) return;
  if (index < records.length) {
    // A repeated or out-of-order ordinal. Keeping the first is the only choice that preserves the
    // positions already referenced by other records.
    tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, `md5mesh.${record}-index-repeated`, record, {
      firstExpected: records.length,
      firstIndex: index,
    });
    return;
  }
  tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, `md5mesh.${record}-index-gap`, record, {
    firstExpected: records.length,
    firstIndex: index,
  });
  while (records.length < index) records.push(placeholder());
}

// Reports a declared count that disagrees with the records actually read. The two are independent
// statements of one quantity, so the disagreement is the signal — and it is the cheapest detector there
// is for a record having been dropped, since it catches the loss even when no ordinal was available.
function reportMd5CountDisagreement(
  md5Drops: Map<string, Md5DropTally> | null,
  record: string,
  declared: number,
  actual: number,
): void {
  if (declared < 0 || declared === actual) return;
  tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, `md5mesh.${record}-count-mismatch`, record, {
    firstActual: actual,
    firstExpected: declared,
  });
}

// A record's declared ordinal, or -1 when the token is not a whole non-negative number. `parseInt` is
// lenient — it reads `1e3` as 1 and `3.9` as 3 — so the round-trip comparison is what makes a truncated
// or scientific-notation ordinal a fault rather than a different, in-range position.
function parseMd5RecordOrdinal(token: string): number {
  const value = parseInt(token, 10);
  if (!Number.isFinite(value) || value < 0) return -1;
  return String(value) === token ? value : -1;
}

// Whether joint `start`'s parent chain loops back to it rather than reaching a root.
//
// A cycle is not merely wrong data: composing parent-relative transforms around one has no fixed point,
// and the hierarchy builder only rejects a node parented directly to itself, so a two-joint loop would be
// assembled into a subgraph detached from the skeleton and silently missing from the model. Bounded by
// the joint count, so a cycle terminates the walk rather than the walk terminating the import.
function isMd5JointCycle(joints: readonly Md5Joint[], start: number): boolean {
  let cursor = joints[start].parentIndex;
  for (let steps = 0; steps < joints.length; steps++) {
    if (cursor < 0 || cursor >= joints.length) return false;
    if (cursor === start) return true;
    cursor = joints[cursor].parentIndex;
  }
  return true;
}

// How far past 1 a reconstructed quaternion's squared vector part may drift before it is treated as
// corrupt rather than as float error. A valid file's round-trip error is around 1e-7; anything at this
// scale is a different kind of wrong.
const QUATERNION_SUM_TOLERANCE = 1e-4;
