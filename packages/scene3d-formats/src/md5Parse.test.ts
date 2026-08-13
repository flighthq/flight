import { getMatrix4Position } from '@flighthq/geometry/contract';
import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  createMeshGeometry,
  getMeshGeometryIndexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexTangent,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh/contract';
import { getNodeChildren, getNodeLocalMatrix4 } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  ImportDiagnostic,
  Mesh,
  Scene3DAnimationTarget,
  Node3D,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { parseMd5Anim } from './md5AnimParse';
import { canonicalizeMd5TangentHandedness, createScene3DFromMd5Mesh, importMd5Mesh, parseMd5Mesh } from './md5Parse';
import { getTestTextureResource } from './scene3DFormatsTestHelper';
import { findScene3DSkeletonJoints } from './sceneSkeleton';

function findDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

function reconstructBitangent(
  vertices: Readonly<Float32Array>,
  floatsPerVertex: number,
  vertex: number,
): [number, number, number] {
  const base = vertex * floatsPerVertex;
  const nx = vertices[base + 3];
  const ny = vertices[base + 4];
  const nz = vertices[base + 5];
  const tx = vertices[base + 6];
  const ty = vertices[base + 7];
  const tz = vertices[base + 8];
  const sign = vertices[base + 9];
  return [sign * (ny * tz - nz * ty), sign * (nz * tx - nx * tz), sign * (nx * ty - ny * tx)];
}

// A one-joint .md5anim matching SINGLE_TRIANGLE's single "root" joint, translating it per frame.
const SINGLE_JOINT_ANIM = [
  'MD5Version 10',
  'commandline ""',
  'numFrames 1',
  'numJoints 1',
  'frameRate 24',
  'numAnimatedComponents 0',
  'hierarchy {',
  '  "root" -1 0 0',
  '}',
  'bounds {',
  '  ( -1 -1 -1 ) ( 1 1 1 )',
  '}',
  'baseframe {',
  '  ( 5 10 15 ) ( 0 0 0 )',
  '}',
  'frame 0 {',
  '}',
].join('\n');

// Minimal valid MD5 mesh with a single joint at the origin (identity orientation) and a single
// triangle whose three vertices each reference one weight with bias 1.0 at known positions.
const SINGLE_TRIANGLE = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 1',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/default"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 3',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '}',
].join('\n');

// A triangle whose three vertices share one UV coordinate, so its texture polarity is exactly zero
// and there is no orientation to read a handedness from.
const DEGENERATE_UV_TRIANGLE = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 1',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/default"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.25 0.25 ) 0 1',
  '  vert 1 ( 0.25 0.25 ) 1 1',
  '  vert 2 ( 0.25 0.25 ) 2 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 3',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '}',
].join('\n');

// Two triangles sharing an edge with opposite UV determinants. The imported skinned geometry must
// duplicate both shared records so each triangle owns one coherent tangent handedness.
const MIRRORED_UV_TRIANGLES = [
  'MD5Version 10',
  'commandline ""',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/mirrored"',
  '  numverts 4',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  vert 3 ( 1.0 0.0 ) 3 1',
  '  numtris 2',
  '  tri 0 0 1 2',
  '  tri 1 0 2 3',
  '  numweights 4',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 1 0 )',
  '  weight 3 0 1.0 ( -1 0 0 )',
  '}',
].join('\n');

// Two separately indexed charts meet at an exact duplicate position. Their face tangent directions
// differ, and the second chart mirrors u, so only grouped, handedness-aware accumulation reconstructs
// one continuous bitangent at vertices 0/3. Triangles are authored in MD5's clockwise convention.
const DIVERGENT_MIRRORED_UV_SEAM = [
  'MD5Version 10',
  'commandline ""',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/mirrored-seam"',
  '  numverts 6',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  vert 3 ( 0.0 0.0 ) 3 1',
  '  vert 4 ( 0.0 1.0 ) 4 1',
  '  vert 5 ( 1.0 0.0 ) 5 1',
  '  numtris 2',
  '  tri 0 0 2 1',
  '  tri 1 3 5 4',
  '  numweights 6',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 1 0 0 )',
  '  weight 2 0 1.0 ( 0 0 1 )',
  '  weight 3 0 1.0 ( 0 0 0 )',
  '  weight 4 0 1.0 ( -1 0 0 )',
  '  weight 5 0 1.0 ( 0 0 -1 )',
  '}',
].join('\n');

// Two perpendicular triangles whose shared edge is duplicated because each side carries distinct
// UVs. Their unequal areas make the expected shared normal distinguish area-weighted accumulation
// from averaging already-normalized face normals.
const UV_SEAM_FOLD = [
  'MD5Version 10',
  'commandline ""',
  'numJoints 1',
  'numMeshes 1',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '}',
  'mesh {',
  '  shader "textures/seam-fold"',
  '  numverts 6',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.0 1.0 ) 2 1',
  '  vert 3 ( 0.25 0.25 ) 3 1',
  '  vert 4 ( 0.25 0.75 ) 4 1',
  '  vert 5 ( 0.75 0.25 ) 5 1',
  '  numtris 2',
  '  tri 0 0 1 2',
  '  tri 1 3 4 5',
  '  numweights 6',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 0 1.0 ( 2 0 0 )',
  '  weight 2 0 1.0 ( 0 2 0 )',
  '  weight 3 0 1.0 ( 0 0 0 )',
  '  weight 4 0 1.0 ( 2 0 0 )',
  '  weight 5 0 1.0 ( 0 0 1 )',
  '}',
].join('\n');

// MD5 mesh with two joints forming a parent-child hierarchy.
const MULTI_JOINT_HIERARCHY = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 3',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '  "child_a" 0 ( 1 0 0 ) ( 0 0 0 )',
  '  "child_b" 0 ( 0 1 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/body"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 1',
  '  vert 1 ( 1.0 0.0 ) 1 1',
  '  vert 2 ( 0.5 0.5 ) 2 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 3',
  '  weight 0 0 1.0 ( 0 0 0 )',
  '  weight 1 1 1.0 ( 0 0 0 )',
  '  weight 2 2 1.0 ( 0 0 0 )',
  '}',
].join('\n');

// MD5 mesh where a vertex is influenced by two joints with different weights.
const WEIGHTED_VERTICES = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 2',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '  "arm" 0 ( 10 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/arm"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 2',
  '  vert 1 ( 1.0 0.0 ) 2 1',
  '  vert 2 ( 0.5 1.0 ) 3 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 4',
  '  weight 0 0 0.5 ( 0 0 0 )',
  '  weight 1 1 0.5 ( 0 0 0 )',
  '  weight 2 0 1.0 ( 1 0 0 )',
  '  weight 3 1 1.0 ( 0 1 0 )',
  '}',
].join('\n');

// MD5 mesh whose vertex 0 is influenced by five joints — one more than linear-blend skinning's four
// slots. The five biases (0.4/0.3/0.2/0.1/0.05) select the first four; the fifth, at a far-away joint,
// is dropped. The kept four already sum to 1.0, so their bind position bakes to a clean (3,4,4) Z-up
// while a naive all-influence bake would be dragged toward the far joint (x≈53).
const OVER_INFLUENCED_VERTEX = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 5',
  'numMeshes 1',
  '',
  'joints {',
  '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
  '  "j1" 0 ( 10 0 0 ) ( 0 0 0 )',
  '  "j2" 0 ( 0 20 0 ) ( 0 0 0 )',
  '  "j3" 0 ( 0 0 40 ) ( 0 0 0 )',
  '  "far" 0 ( 1000 0 0 ) ( 0 0 0 )',
  '}',
  '',
  'mesh {',
  '  shader "textures/over"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 5',
  '  vert 1 ( 1.0 0.0 ) 5 1',
  '  vert 2 ( 0.0 1.0 ) 6 1',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 7',
  '  weight 0 0 0.4 ( 0 0 0 )',
  '  weight 1 1 0.3 ( 0 0 0 )',
  '  weight 2 2 0.2 ( 0 0 0 )',
  '  weight 3 3 0.1 ( 0 0 0 )',
  '  weight 4 4 0.05 ( 0 0 0 )',
  '  weight 5 0 1.0 ( 5 0 0 )',
  '  weight 6 0 1.0 ( 0 5 0 )',
  '}',
].join('\n');

describe('canonicalizeMd5TangentHandedness', () => {
  // The contradiction branch is unreachable through a normal MD5 import: the mirrored-UV split runs
  // first and separates any vertex whose triangles disagree, so every fixture that goes through
  // createScene3DFromMd5Mesh arrives here already consistent. This builds the geometry directly,
  // bypassing that split, which is the only way to exercise the branch.
  //
  // ★ IT ALSO PINS THE TWO-PASS STRUCTURE, which is the reason it is worth having. Census-then-apply
  // keeps the FIRST sign seen and reports the disagreement; collapsing the two loops into one makes
  // the last triangle win silently. Those two behaviours differ only when a vertex is reached by
  // triangles of differing sign — exactly this case — so this test is what stops the structure being
  // quietly optimised away.
  function buildConflictingGeometry() {
    const floatsPerVertex = CANONICAL_MESH_GEOMETRY_LAYOUT.stride / 4;
    const vertices = new Float32Array(4 * floatsPerVertex);
    const setVertex = (vertex: number, x: number, y: number, u: number, v: number) => {
      const base = vertex * floatsPerVertex;
      vertices[base] = x;
      vertices[base + 1] = y;
      vertices[base + 5] = 1; // normal +z
      vertices[base + 9] = 1; // generated handedness, to be resolved
      vertices[base + 10] = u;
      vertices[base + 11] = v;
    };
    // Vertices 1 and 2 are shared. The second triangle's U runs the other way, so the two triangles
    // have opposite UV determinants and the shared pair receives both signs.
    setVertex(0, 0, 0, 0, 0);
    setVertex(1, 1, 0, 1, 0);
    setVertex(2, 0, 1, 0, 1);
    setVertex(3, 1, 1, -1, 1);
    return createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 3, 2, 1]),
      layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
      vertices,
    });
  }

  it('reports a vertex whose triangles disagree rather than letting the last one win', () => {
    const geometry = buildConflictingGeometry();
    const drops = new Map<string, { count: number }>();
    canonicalizeMd5TangentHandedness(geometry, drops as never);
    expect([...drops.keys()].some((key) => key.includes('tangent-handedness-contradiction'))).toBe(true);
  });

  it('keeps the first resolved sign for a contradicting vertex, not the last', () => {
    // The census runs to completion before anything is written, so a contradicting vertex keeps the
    // sign of the first triangle that claimed it. Applying during the census instead would leave the
    // last triangle's sign, which is the silent wrong answer this structure exists to refuse.
    const geometry = buildConflictingGeometry();
    canonicalizeMd5TangentHandedness(geometry, null);
    const floatsPerVertex = CANONICAL_MESH_GEOMETRY_LAYOUT.stride / 4;
    // Triangle 0 (positive determinant) is visited first and claims vertices 1 and 2.
    expect(geometry.vertices[1 * floatsPerVertex + 9]).toBe(1);
    expect(geometry.vertices[2 * floatsPerVertex + 9]).toBe(1);
  });
});

describe('createScene3DFromMd5Mesh', () => {
  it('parses a single triangle with one joint', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const children = getNodeChildren(scene.root);
    // Skeleton group + one mesh.
    expect(children).toHaveLength(2);

    // The skeleton is the first child.
    const skeleton = children[0] as Node3D;
    expect(isMesh(skeleton)).toBe(false);

    // The mesh is the second child.
    const meshNode = children[1] as Node3D;
    expect(isMesh(meshNode)).toBe(true);

    const geometry = (meshNode as unknown as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    getMeshGeometryVertexPosition(p, geometry, 1);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    getMeshGeometryVertexPosition(p, geometry, 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it('emits a skin binding the mesh to a skeleton over the parsed joints', () => {
    const scene = createScene3DFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;

    expect(meshNode.skin).toBeTruthy();
    // The skin's skeleton exposes the joint nodes parseMd5Anim needs, one per parsed joint.
    expect(meshNode.skin?.skeleton.joints).toHaveLength(3);
    expect(meshNode.skin?.skeleton.names).toEqual(['root', 'child_a', 'child_b']);
    // The document assembler does not rethread the skeleton group as the skin's skeletonRoot (it stays
    // null, matching every importer that routes through createScene3DFromDocument); the "skeleton" group is
    // still a scene-root child (children[0]).
    expect(meshNode.skin?.skeletonRoot).toBeNull();
    expect(getNodeChildren(scene.root)[0].name).toBe('skeleton');
  });

  it('emits joints0/weights0 into an 80-byte skinned layout with weights renormalized to 1', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;

    expect(geometry.layout.stride).toBe(80);
    const floatsPerVertex = geometry.layout.stride / 4;
    // weights0 is the last float32x4 in the record; vertex 0's first weight is the full influence.
    expect(geometry.vertices[16]).toBeCloseTo(1);
    // Every vertex's four weights sum to 1 (renormalized), and joint index 0 is referenced.
    for (let v = 0; v < 3; v++) {
      const base = v * floatsPerVertex;
      const weightSum =
        geometry.vertices[base + 16] +
        geometry.vertices[base + 17] +
        geometry.vertices[base + 18] +
        geometry.vertices[base + 19];
      expect(weightSum).toBeCloseTo(1);
    }
  });

  it('regenerates vertex normals the MD5 mesh does not carry', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;
    // Normal is at float offset 3; a flat triangle yields a unit face normal, not the zero-fill.
    const nx = geometry.vertices[3];
    const ny = geometry.vertices[4];
    const nz = geometry.vertices[5];
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
    // With triangle winding reversed to Flight's CCW-front convention, the derived normal points
    // −Y for this triangle (v0=(0,0,0), v1=(1,0,0), v2=(0,0,−1) in Y-up): (v2−v0)×(v1−v0) = (0,−1,0).
    // Without the reversal it would point +Y (inward for a real model — the winding bug).
    expect(nx).toBeCloseTo(0);
    expect(ny).toBeCloseTo(-1);
    expect(nz).toBeCloseTo(0);
  });

  it('shares area-weighted normals across exact-position UV seam duplicates', () => {
    const scene = createScene3DFromMd5Mesh(UV_SEAM_FOLD);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);

    const expectedY = -2 / Math.sqrt(5);
    const expectedZ = -1 / Math.sqrt(5);
    for (const [first, duplicate] of [
      [0, 3],
      [1, 4],
    ]) {
      const firstNormal = { x: 0, y: 0, z: 0 };
      const duplicateNormal = { x: 0, y: 0, z: 0 };
      getMeshGeometryVertexNormal(firstNormal, geometry, first);
      getMeshGeometryVertexNormal(duplicateNormal, geometry, duplicate);
      expect(firstNormal.x).toBeCloseTo(0);
      expect(firstNormal.y).toBeCloseTo(expectedY);
      expect(firstNormal.z).toBeCloseTo(expectedZ);
      expect(duplicateNormal).toEqual(firstNormal);
    }

    // Grouping neither welds the seam records nor forces folded per-normal tangent vectors equal.
    const firstUv = { x: 0, y: 0 };
    const duplicateUv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(firstUv, geometry, 0);
    getMeshGeometryVertexUv0(duplicateUv, geometry, 3);
    expect(duplicateUv).not.toEqual(firstUv);
    const firstTangent = { w: 0, x: 0, y: 0, z: 0 };
    const duplicateTangent = { w: 0, x: 0, y: 0, z: 0 };
    getMeshGeometryVertexTangent(firstTangent, geometry, 0);
    getMeshGeometryVertexTangent(duplicateTangent, geometry, 3);
    expect(duplicateTangent).not.toEqual(firstTangent);
  });

  it('generates unit tangents and handedness for the tangent-less MD5 mesh', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;

    for (let vertex = 0; vertex < 3; vertex++) {
      const base = vertex * floatsPerVertex;
      const tx = geometry.vertices[base + 6];
      const ty = geometry.vertices[base + 7];
      const tz = geometry.vertices[base + 8];
      expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1);
      expect(Math.abs(geometry.vertices[base + 9])).toBe(1);
    }
    // One triangle must use one coherent tangent orientation. A zero or mixed W makes its tangent
    // space undefined and is the importer defect that normalScale previously hid downstream.
    const indices = geometry.indices!;
    const sign = geometry.vertices[indices[0] * floatsPerVertex + 9];
    expect(geometry.vertices[indices[1] * floatsPerVertex + 9]).toBe(sign);
    expect(geometry.vertices[indices[2] * floatsPerVertex + 9]).toBe(sign);
  });

  it('resolves handedness from each triangle authored UV polarity, in final emitted order', () => {
    // MD5 derives its tangent frames from texture polarity, and the source-winding reversal this
    // importer already performs produces the equivalent handedness — so the sign is read per triangle
    // from the UVs as emitted, not applied as one flip across the whole format. This triangle's
    // imported UV determinant is negative, so all three of its corners resolve to -1.
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;
    const indices = geometry.indices!;

    const uvOffset = 10;
    const corner = (n: number) => indices[n] * floatsPerVertex;
    const determinant =
      (geometry.vertices[corner(1) + uvOffset] - geometry.vertices[corner(0) + uvOffset]) *
        (geometry.vertices[corner(2) + uvOffset + 1] - geometry.vertices[corner(0) + uvOffset + 1]) -
      (geometry.vertices[corner(2) + uvOffset] - geometry.vertices[corner(0) + uvOffset]) *
        (geometry.vertices[corner(1) + uvOffset + 1] - geometry.vertices[corner(0) + uvOffset + 1]);
    // Read the polarity from the emitted UVs rather than asserting a literal, so the test states the
    // RULE. A test that hardcoded +1 or -1 would pin whichever answer the importer happened to give.
    const expected = determinant < 0 ? -1 : 1;
    for (const index of indices) expect(geometry.vertices[index * floatsPerVertex + 9]).toBe(expected);
  });

  it('leaves the generated handedness alone where UV polarity is zero', () => {
    // With no texture orientation there is nothing to resolve, so the census must not write a sign —
    // it must leave whatever the tangent generator produced. Writing an unresolved 0 into tangent.w
    // would collapse the bitangent (B = w * cross(N, T)) rather than merely pick the wrong side.
    const scene = createScene3DFromMd5Mesh(DEGENERATE_UV_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;
    for (const index of geometry.indices!) {
      expect(Math.abs(geometry.vertices[index * floatsPerVertex + 9])).toBe(1);
    }
  });

  it('splits complete skinned records across a mirrored MD5 UV boundary', () => {
    const scene = createScene3DFromMd5Mesh(MIRRORED_UV_TRIANGLES);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;
    const indices = geometry.indices!;

    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
    const firstSign = geometry.vertices[indices[0] * floatsPerVertex + 9];
    const secondSign = geometry.vertices[indices[3] * floatsPerVertex + 9];
    expect(firstSign).toBe(-secondSign);
    for (let corner = 0; corner < 3; corner++) {
      expect(geometry.vertices[indices[corner] * floatsPerVertex + 9]).toBe(firstSign);
      expect(geometry.vertices[indices[corner + 3] * floatsPerVertex + 9]).toBe(secondSign);
    }
    // Every original and split vertex remains fully influenced by root; topology repair must not
    // detach the mirrored side from skeletal animation.
    for (let vertex = 0; vertex < 6; vertex++) {
      expect(geometry.vertices[vertex * floatsPerVertex + 16]).toBe(1);
    }
  });

  it('keeps reconstructed bitangents continuous across a duplicated mirrored MD5 UV seam', () => {
    const scene = createScene3DFromMd5Mesh(DIVERGENT_MIRRORED_UV_SEAM);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;

    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
    expect(geometry.vertices[9]).toBe(-geometry.vertices[3 * floatsPerVertex + 9]);
    const firstBitangent = reconstructBitangent(geometry.vertices, floatsPerVertex, 0);
    const mirroredBitangent = reconstructBitangent(geometry.vertices, floatsPerVertex, 3);
    expect(Math.hypot(...firstBitangent)).toBeCloseTo(1);
    expect(Math.hypot(...mirroredBitangent)).toBeCloseTo(1);
    for (let component = 0; component < 3; component++) {
      expect(mirroredBitangent[component]).toBeCloseTo(firstBitangent[component]);
    }
  });

  it('reverses MD5 triangle winding to Flight CCW-front (front faces stay front under culling)', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    // MD5 declares "tri 0 0 1 2"; id Tech 4 winds clockwise, and the Z-up→Y-up conversion is a
    // determinant-+1 rotation that preserves winding, so the parser reverses each triangle (swaps
    // v1/v2) to land CCW-front. The index buffer therefore reads 0, 2, 1 rather than 0, 1, 2.
    expect(Array.from(geometry.indices!)).toEqual([0, 2, 1]);
  });

  it('preserves UV coordinates', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const children = getNodeChildren(scene.root);
    const meshNode = children[1] as unknown as Mesh;
    const geometry = meshNode.geometry;

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect(uv.x).toBeCloseTo(0);
    expect(uv.y).toBeCloseTo(0);

    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect(uv.x).toBeCloseTo(1);
    expect(uv.y).toBeCloseTo(0);

    getMeshGeometryVertexUv0(uv, geometry, 2);
    expect(uv.x).toBeCloseTo(0);
    expect(uv.y).toBeCloseTo(1);
  });

  it('converts an absolute .md5mesh joint to a parent-relative local transform', () => {
    // Two joints where the child's PARENT sits away from the origin. .md5mesh joints are ABSOLUTE, but
    // a nested joint's LOCAL transform must be parent-relative so parent × child rebuilds the absolute.
    // Absolute child (10,5,0) → Y-up (10,0,-5); parent (10,0,0) → Y-up (10,0,0); so the child's local
    // position is the difference (0,0,-5). The bug this guards against set the absolute (10,0,-5)
    // directly as the local, which double-accumulates through the parent and explodes under animation.
    const chain = [
      'MD5Version 10',
      'numJoints 2',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 10 0 0 ) ( 0 0 0 )',
      '  "child" 0 ( 10 5 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "t"',
      '  numverts 1',
      '  vert 0 ( 0 0 ) 0 1',
      '  numtris 0',
      '  numweights 1',
      '  weight 0 1 1.0 ( 0 0 0 )',
      '}',
    ].join('\n');

    const scene = createScene3DFromMd5Mesh(chain);
    // Nested: skeleton → root → child.
    const root = getNodeChildren(getNodeChildren(scene.root)[0] as Node3D)[0] as Node3D;
    const child = getNodeChildren(root)[0] as Node3D;

    const rootLocal = { x: 0, y: 0, z: 0 };
    const childLocal = { x: 0, y: 0, z: 0 };
    getMatrix4Position(rootLocal, getNodeLocalMatrix4(root));
    getMatrix4Position(childLocal, getNodeLocalMatrix4(child));
    // Root keeps its absolute transform; child is parent-relative.
    expect([rootLocal.x, rootLocal.y, rootLocal.z]).toEqual([10, 0, 0]);
    expect(childLocal.x).toBeCloseTo(0);
    expect(childLocal.y).toBeCloseTo(0);
    expect(childLocal.z).toBeCloseTo(-5);
  });

  it('nests joints by parent index — child joints under their parent', () => {
    // The skeleton is a real nested hierarchy: parent × child composition rebuilds each joint's
    // absolute world transform from the parent-relative locals the bind conversion produced. The
    // .md5anim frames (parent-relative) then drive these same nested joints. MULTI_JOINT_HIERARCHY has
    // root (parent -1) with child_a and child_b both parented to root.
    const scene = createScene3DFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    const skeleton = getNodeChildren(scene.root)[0] as Node3D;

    const rootJoints = getNodeChildren(skeleton);
    expect(rootJoints).toHaveLength(1);
    expect(getNodeChildren(rootJoints[0] as Node3D)).toHaveLength(2);
  });

  it('computes vertex positions from weights referencing different joints', () => {
    const scene = createScene3DFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    // Find the mesh node (second child after skeleton).
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;
    const geometry = meshNode.geometry;

    const p = { x: 0, y: 0, z: 0 };

    // Vert 0: weight 0 references joint 0 (root at origin), bias=1, offset (0,0,0) => (0,0,0)
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Vert 1: weight 1 references joint 1 (child_a at (1,0,0)), bias=1, offset (0,0,0) => (1,0,0)
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Vert 2: weight 2 references joint 2 (child_b at (0,1,0) in MD5), bias=1, offset (0,0,0)
    // MD5 result (0,1,0) → Flight (0,0,-1)
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it('blends vertex positions from multiple weighted joints', () => {
    const scene = createScene3DFromMd5Mesh(WEIGHTED_VERTICES);
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;
    const geometry = meshNode.geometry;

    const p = { x: 0, y: 0, z: 0 };

    // Vert 0: weight 0 (joint 0 at origin, bias 0.5, offset (0,0,0)) = 0.5*(0,0,0)
    //       + weight 1 (joint 1 at (10,0,0), bias 0.5, offset (0,0,0)) = 0.5*(10,0,0)
    //       = (5, 0, 0)
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Vert 1: weight 2 (joint 0 at origin, bias 1, offset (1,0,0)) = 1*(0+1, 0, 0) = (1, 0, 0)
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Vert 2: weight 3 (joint 1 at (10,0,0), bias 1, offset (0,1,0)) MD5 result (10,1,0) → Flight (10,0,-1)
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it('reduces a >4-influence vertex to its 4 highest-weight influences and reports md5mesh.vertex-over-influenced', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd5Mesh(OVER_INFLUENCED_VERTEX, diagnostics);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;

    // joints0/weights0 keep the four highest-bias joints (0,1,2,3), renormalized (they already sum to 1);
    // the fifth (joint 4, bias 0.05) is dropped.
    expect(Array.from(geometry.vertices.slice(12, 16))).toEqual([0, 1, 2, 3]);
    expect(geometry.vertices[16]).toBeCloseTo(0.4);
    expect(geometry.vertices[17]).toBeCloseTo(0.3);
    expect(geometry.vertices[18]).toBeCloseTo(0.2);
    expect(geometry.vertices[19]).toBeCloseTo(0.1);
    const weightSum = geometry.vertices[16] + geometry.vertices[17] + geometry.vertices[18] + geometry.vertices[19];
    expect(weightSum).toBeCloseTo(1);

    // The bind position is baked from that SAME reduced top-4 set: Z-up (3,4,4) → Flight Y-up (3,4,-4).
    // A naive all-influence bake would drag x toward the far joint (≈53), so this pins the fix.
    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(3);
    expect(p.y).toBeCloseTo(4);
    expect(p.z).toBeCloseTo(-4);
    expect(p.x).toBeLessThan(10); // far joint (x=1000) was truly dropped, not blended in

    const crumb = findDiagnostic(diagnostics, 'md5mesh.vertex-over-influenced');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.maxInfluences).toBe(5);
    // Vertices 1 and 2 have a single influence — the layout stays 80-byte skinned regardless.
    expect(floatsPerVertex).toBe(20);
  });

  it('handles multiple mesh sections', () => {
    const source = [
      'MD5Version 10',
      'commandline ""',
      'numJoints 1',
      'numMeshes 2',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "body"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 1',
      '  vert 1 ( 1 0 ) 1 1',
      '  vert 2 ( 0 1 ) 2 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 3',
      '  weight 0 0 1.0 ( 0 0 0 )',
      '  weight 1 0 1.0 ( 1 0 0 )',
      '  weight 2 0 1.0 ( 0 1 0 )',
      '}',
      'mesh {',
      '  shader "head"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 1',
      '  vert 1 ( 1 0 ) 1 1',
      '  vert 2 ( 0 1 ) 2 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 3',
      '  weight 0 0 1.0 ( 2 0 0 )',
      '  weight 1 0 1.0 ( 3 0 0 )',
      '  weight 2 0 1.0 ( 2 1 0 )',
      '}',
    ].join('\n');

    const scene = createScene3DFromMd5Mesh(source);
    const children = getNodeChildren(scene.root);
    // Skeleton + 2 meshes.
    expect(children).toHaveLength(3);
    expect(isMesh(children[1] as Node3D)).toBe(true);
    expect(isMesh(children[2] as Node3D)).toBe(true);
  });

  it("decodes each section's shader to a BlinnPhongMaterial referencing the shader path as a diffuseMap", () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const mesh = getNodeChildren(scene.root)[1] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.name).toBe('textures/default'); // MD5 shader path preserved as the authored identity
    // The shader path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((getTestTextureResource(scene.resources, material.diffuseMap!) as ExternalImageResourceReference).uri).toBe(
      'textures/default',
    );
    expect(getTextureSource(material.diffuseMap!)).toBeNull();
  });

  it('returns an empty scene for empty input', () => {
    const scene = createScene3DFromMd5Mesh('');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createScene3DFromMd5Mesh('// just a comment\n');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('drops and reports md5mesh.malformed-joint for a bad joint line', () => {
    const source = ['MD5Version 10', 'numJoints 1', 'numMeshes 0', 'joints {', '  bad joint line', '}'].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.malformed-joint');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('missing-name-quotes');
    expect(crumb!.detail?.firstLine).toBe(5);
  });

  it('drops and reports md5mesh.malformed-vert for a bad vert line', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 1',
      '  vert 0 ( abc def ) 0 1',
      '  numtris 0',
      '  numweights 0',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.malformed-vert');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('non-numeric');
  });

  it('drops and reports md5mesh.malformed-tri for a bad tri line', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 0',
      '  numtris 1',
      '  tri 0 abc',
      '  numweights 0',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.malformed-tri');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('not-enough-components');
  });

  it('drops and reports md5mesh.malformed-weight for a bad weight line', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 0',
      '  numtris 0',
      '  numweights 1',
      '  weight 0',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.malformed-weight');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.reason).toBe('not-enough-components');
  });

  it('recovers and reports md5mesh.unsupported-version', () => {
    const source = ['MD5Version 11', 'numJoints 0', 'numMeshes 0'].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.unsupported-version');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail).toEqual({ count: 1, version: 11 });
  });

  it('handles empty joints and mesh sections gracefully', () => {
    const source = [
      'MD5Version 10',
      'numJoints 0',
      'numMeshes 1',
      'joints {',
      '}',
      'mesh {',
      '  shader "empty"',
      '  numverts 0',
      '  numtris 0',
      '  numweights 0',
      '}',
    ].join('\n');

    const scene = createScene3DFromMd5Mesh(source);
    // No skeleton node (no joints), no mesh node (no indices).
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('skips comment lines inside blocks', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  // This is a comment inside joints',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  // This is a comment inside mesh',
      '  shader "default"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 1',
      '  vert 1 ( 1 0 ) 1 1',
      '  vert 2 ( 0 1 ) 2 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 3',
      '  weight 0 0 1.0 ( 0 0 0 )',
      '  weight 1 0 1.0 ( 1 0 0 )',
      '  weight 2 0 1.0 ( 0 1 0 )',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd5Mesh(source, diagnostics);
    expect(diagnostics).toHaveLength(0);
    expect(getNodeChildren(scene.root)).toHaveLength(2);
  });

  it('computes quaternion W from XYZ with non-zero orientation', () => {
    // Joint with orientation (0.5, 0.5, 0.5) — w = -sqrt(1 - 0.75) = -0.5
    // Weight position (1, 0, 0) rotated by q(0.5, 0.5, 0.5, -0.5) should produce a rotated result.
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0.5 0.5 0.5 )',
      '}',
      'mesh {',
      '  shader "test"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 1',
      '  vert 1 ( 0 0 ) 1 1',
      '  vert 2 ( 0 0 ) 2 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 3',
      '  weight 0 0 1.0 ( 1 0 0 )',
      '  weight 1 0 1.0 ( 0 1 0 )',
      '  weight 2 0 1.0 ( 0 0 1 )',
      '}',
    ].join('\n');

    const scene = createScene3DFromMd5Mesh(source);
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;
    const geometry = meshNode.geometry;

    const p = { x: 0, y: 0, z: 0 };

    // With q = (0.5, 0.5, 0.5, -0.5), rotating (1,0,0) gives MD5 (0,0,1) → Flight (0,1,0).
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);

    // Rotating (0,1,0) gives MD5 (1,0,0) → Flight (1,0,0).
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Rotating (0,0,1) gives MD5 (0,1,0) → Flight (0,0,-1).
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });

  it('recovers and reports md5mesh.weight-joint-out-of-range for a bad weight joint index', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "test"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 1',
      '  vert 1 ( 0 0 ) 1 1',
      '  vert 2 ( 0 0 ) 2 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 3',
      '  weight 0 99 1.0 ( 0 0 0 )',
      '  weight 1 0 1.0 ( 1 0 0 )',
      '  weight 2 0 1.0 ( 0 1 0 )',
      '}',
    ].join('\n');

    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.weight-joint-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstIndex).toBe(99);
  });

  it('handles joint with no weights gracefully (zero-position vertex)', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 5 5 5 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "test"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 0 0',
      '  vert 1 ( 0 0 ) 0 1',
      '  vert 2 ( 0 0 ) 1 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 2',
      '  weight 0 0 1.0 ( 0 0 0 )',
      '  weight 1 0 1.0 ( 1 0 0 )',
      '}',
    ].join('\n');

    const scene = createScene3DFromMd5Mesh(source);
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;
    const geometry = meshNode.geometry;

    const p = { x: 0, y: 0, z: 0 };

    // Vert 0: countWeights=0, so position stays at (0,0,0).
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(0);

    // Vert 1: weight 0, joint at (5,5,5) in MD5, offset (0,0,0) → MD5 (5,5,5) → Flight (5,5,-5).
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(5);
    expect(p.z).toBeCloseTo(-5);
  });

  it('recovers and reports md5mesh.joints-block-unclosed', () => {
    const source = ['MD5Version 10', 'numJoints 1', 'numMeshes 0', 'joints {', '  "root" -1 ( 0 0 0 ) ( 0 0 0 )'].join(
      '\n',
    );
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.joints-block-unclosed');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
  });

  it('recovers and reports md5mesh.mesh-block-unclosed', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 0',
      '  numtris 0',
      '  numweights 0',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.mesh-block-unclosed');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
  });

  it('recovers and reports md5mesh.shader-unquoted for a shader directive with no quoted name', () => {
    // Real .md5mesh files sometimes write the shader path unquoted; the mesh is then emitted with no
    // material. The geometry survives, so this is a Recover.
    const source = SINGLE_TRIANGLE.replace('shader "textures/default"', 'shader textures/default');
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createScene3DFromMd5Mesh(source, diagnostics);
    const mesh = getNodeChildren(scene.root)[1] as unknown as Mesh;
    expect(mesh.materials).toHaveLength(0); // material binding was lost
    const crumb = findDiagnostic(diagnostics, 'md5mesh.shader-unquoted');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
  });

  it('drops and reports md5mesh.mesh-empty for a mesh that yields no triangles', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 1',
      '  vert 0 ( 0 0 ) 0 1',
      '  numtris 0',
      '  numweights 1',
      '  weight 0 0 1.0 ( 0 0 0 )',
      '}',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.mesh-empty');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
  });

  it('recovers and reports md5mesh.joint-parent-out-of-range', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 0',
      'joints {',
      '  "root" 9 ( 0 0 0 ) ( 0 0 0 )',
      '}',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.joint-parent-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstParent).toBe(9);
  });

  it('recovers and reports md5mesh.vertex-weight-out-of-range for an out-of-range weight index', () => {
    const source = [
      'MD5Version 10',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" -1 ( 0 0 0 ) ( 0 0 0 )',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 3',
      '  vert 0 ( 0 0 ) 50 1',
      '  vert 1 ( 0 0 ) 0 1',
      '  vert 2 ( 0 0 ) 0 1',
      '  numtris 1',
      '  tri 0 0 1 2',
      '  numweights 1',
      '  weight 0 0 1.0 ( 0 0 0 )',
      '}',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.vertex-weight-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Recover);
    expect(crumb!.origin).toBe('parseMd5Mesh');
    expect(crumb!.detail?.count).toBe(1);
    expect(crumb!.detail?.firstIndex).toBe(50);
  });

  it('aggregates repeated malformed-joint drops into one crumb with a count', () => {
    const source = [
      'MD5Version 10',
      'numJoints 3',
      'numMeshes 0',
      'joints {',
      '  bad one',
      '  bad two',
      '  bad three',
      '}',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromMd5Mesh(source, diagnostics);
    const matching = diagnostics.filter((d) => d.kind === 'md5mesh.malformed-joint');
    expect(matching).toHaveLength(1);
    expect(matching[0].detail?.count).toBe(3);
    expect(matching[0].detail?.firstLine).toBe(5);
  });

  it('emits no diagnostics when no collector array is supplied', () => {
    const source = [
      'MD5Version 11',
      'numJoints 1',
      'numMeshes 1',
      'joints {',
      '  "root" 9 ( 0 0 0 ) ( 0 0 0 )',
      '  bad line',
      '}',
      'mesh {',
      '  shader "default"',
      '  numverts 1',
      '  vert 0 ( 0 0 ) 50 1',
      '  numtris 0',
      '  numweights 0',
    ].join('\n');
    // Exercising every crumb path without a sink must not throw and must be side-effect-free.
    expect(() => createScene3DFromMd5Mesh(source)).not.toThrow();
  });
});

// A degenerate MD5 mesh with no skeleton (numJoints 0, weightless verts): importMd5Mesh has no joints to
// bind an animation to.
const JOINTLESS_MESH = [
  'MD5Version 10',
  'commandline ""',
  '',
  'numJoints 0',
  'numMeshes 1',
  '',
  'joints {',
  '}',
  '',
  'mesh {',
  '  shader "textures/none"',
  '',
  '  numverts 3',
  '  vert 0 ( 0.0 0.0 ) 0 0',
  '  vert 1 ( 1.0 0.0 ) 0 0',
  '  vert 2 ( 0.0 1.0 ) 0 0',
  '',
  '  numtris 1',
  '  tri 0 0 1 2',
  '',
  '  numweights 0',
  '}',
].join('\n');

describe('createScene3DFromMd5Mesh animations', () => {
  it('returns the mesh scene with an empty animations map (the .md5anim is a separate file)', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('composes a paired .md5anim into a named clip bound to the scene’s own skeleton joints', () => {
    const scene = createScene3DFromMd5Mesh(SINGLE_TRIANGLE);
    const joints = findScene3DSkeletonJoints(scene.root)!;
    scene.animations.walk = parseMd5Anim(SINGLE_JOINT_ANIM, joints)!;
    expect(Object.keys(scene.animations)).toEqual(['walk']);

    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
    const meshJoints = mesh.skin!.skeleton.joints;
    const channel = scene.animations.walk.channels[0];
    // The clip binds the SAME joint node the imported mesh skins from — no caller threading.
    expect((channel.targetRef as Scene3DAnimationTarget).node).toBe(meshJoints[0]);
  });
});

describe('importMd5Mesh', () => {
  it('imports the mesh only when no animation source is given', () => {
    const scene = importMd5Mesh(SINGLE_TRIANGLE);
    // Skeleton group + mesh, and no animation.
    expect(getNodeChildren(scene.root)).toHaveLength(2);
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('composes the .md5mesh and .md5anim into one scene with the clip bound to the mesh skeleton', () => {
    const scene = importMd5Mesh(SINGLE_TRIANGLE, SINGLE_JOINT_ANIM);
    expect(Object.keys(scene.animations)).toEqual(['default']);

    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as Node3D)) as unknown as Mesh;
    const channel = scene.animations.default.channels[0];
    // The composer bound the clip to the SAME joint node the mesh skins from — no caller threading.
    expect((channel.targetRef as Scene3DAnimationTarget).node).toBe(mesh.skin!.skeleton.joints[0]);
  });

  it('treats a null animation source the same as omitting it', () => {
    const scene = importMd5Mesh(SINGLE_TRIANGLE, null);
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('skips the animation and reports md5mesh.animation-no-skeleton when the mesh has no skeleton', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const scene = importMd5Mesh(JOINTLESS_MESH, SINGLE_JOINT_ANIM, diagnostics);
    expect(Object.keys(scene.animations)).toHaveLength(0);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.animation-no-skeleton');
    expect(crumb).toBeDefined();
    // Drop, not Skip: skeletal animation is implemented, so what failed is the caller's data pairing, and
    // the animation is lost. Pinned because a Skip here would exempt itself from every severity check.
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(crumb!.origin).toBe('importMd5Mesh');
  });
});

describe('parseMd5Mesh', () => {
  // A clean parse is two claims: the values are right AND THE PARSER IS NOT COMPLAINING. Every other test
  // here checks the first. This checks the second — the one that catches a walk that desynchronised and
  // still left the asserted fields looking plausible.
  //
  // It asserts the diagnostic list is EMPTY rather than filtering for truncation-shaped kind names. The
  // filter was the first version and it was wrong: `awd2.block-length-past-end` is a parse failure whose
  // name contains none of the words you would think to grep for, so a pattern built from expected
  // vocabulary silently exempted it. A good file should produce no crumbs at all, which needs no
  // vocabulary to state and cannot be defeated by a kind name nobody anticipated.
  it('raises no diagnostic at all for a well-formed file', () => {
    const diagnostics: ImportDiagnostic[] = [];

    parseMd5Mesh(SINGLE_TRIANGLE, diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good md5 file made the parser complain: ${complaints.join(', ')}`).toEqual([]);
  });

  it('returns a format-neutral document: a skeleton group + joint nodes, a skinned mesh node, scene roots', () => {
    const doc = parseMd5Mesh(SINGLE_TRIANGLE);

    // The skeleton group and each joint are document nodes; the mesh is one more.
    const skeletonIndex = doc.nodes.findIndex((n) => n.name === 'skeleton');
    expect(skeletonIndex).toBeGreaterThanOrEqual(0);
    expect(doc.meshes).toHaveLength(1);
    const meshNodeIndex = doc.nodes.findIndex((n) => n.mesh !== undefined);
    expect(meshNodeIndex).toBeGreaterThanOrEqual(0);
    expect(doc.nodes[meshNodeIndex].mesh).toBe(0); // index into meshes
    expect(getMeshGeometryVertexCount(doc.meshes[0].geometry)).toBe(3);

    // Both the skeleton group and the mesh node are scene roots; the joint hangs under the group.
    expect(doc.scenes[0].rootNodes).toContain(skeletonIndex);
    expect(doc.scenes[0].rootNodes).toContain(meshNodeIndex);
    expect(doc.nodes[skeletonIndex].children).toHaveLength(1);
  });

  it('decomposes the skeleton into a skin: joints by node index + one inverse-bind per joint', () => {
    const doc = parseMd5Mesh(MULTI_JOINT_HIERARCHY);

    expect(doc.skins).toHaveLength(1);
    expect(doc.skins[0].joints).toHaveLength(3);
    expect(doc.skins[0].inverseBind).toHaveLength(3);
    // Each joint is a valid node index, and each is named.
    for (const jointNodeIndex of doc.skins[0].joints) {
      expect(jointNodeIndex).toBeGreaterThanOrEqual(0);
      expect(jointNodeIndex).toBeLessThan(doc.nodes.length);
    }
    expect(doc.skins[0].joints.map((j) => doc.nodes[j].name)).toEqual(['root', 'child_a', 'child_b']);

    // The mesh names the skin by index.
    expect(doc.meshes[0].skin).toBe(0);

    // The child joints are parented under their parent joint (parent-relative local transforms).
    const rootJointIndex = doc.skins[0].joints[0];
    expect(doc.nodes[rootJointIndex].children).toContain(doc.skins[0].joints[1]);
    expect(doc.nodes[rootJointIndex].children).toContain(doc.skins[0].joints[2]);
  });

  it('appends the section shader material to the document materials table by index', () => {
    const doc = parseMd5Mesh(SINGLE_TRIANGLE);
    expect(doc.materials).toHaveLength(1);
    // The mesh's subset references the material by its document index.
    expect(doc.meshes[0].materials).toEqual([0]);
    expect((doc.materials[0] as unknown as BlinnPhongMaterial).kind).toBe(BlinnPhongMaterialKind);
    expect(doc.resources).toHaveLength(1);
    expect(getTestTextureResource(doc.resources, (doc.materials[0] as unknown as BlinnPhongMaterial).diffuseMap!)).toBe(
      doc.resources[0],
    );
  });

  it('leaves the animations table empty (the .md5anim is a separate file)', () => {
    const doc = parseMd5Mesh(SINGLE_TRIANGLE);
    expect(doc.animations).toHaveLength(0);
  });
});

describe('parseMd5Mesh no-data', () => {
  it('rejects a file with nothing recognisable rather than returning a silent empty document', () => {
    // Without this the parser returns a structurally valid, completely empty document and an EMPTY
    // diagnostics array, so an .obj, an .md5anim, or an HTML error page is indistinguishable from a
    // successful import of a file that happens to contain no geometry.
    for (const source of ['v 0 0 0\nf 1 1 1', '<html><body>404</body></html>', 'MD5Version 10\nnumFrames 1']) {
      const diagnostics: ImportDiagnostic[] = [];
      const document = parseMd5Mesh(source, diagnostics);
      const crumb = findDiagnostic(diagnostics, 'md5mesh.no-data');
      expect(crumb).toBeDefined();
      expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Reject);
      expect(document.meshes).toHaveLength(0);
    }
  });

  it('stays quiet for a file that does parse', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Mesh(SINGLE_TRIANGLE, diagnostics);
    expect(findDiagnostic(diagnostics, 'md5mesh.no-data')).toBeUndefined();
  });
});

describe('parseMd5Mesh read integrity', () => {
  // Every probe here is verified to fail against the pre-fix parser; several of those failures are
  // SILENT — a fully-formed, renderable mesh with no diagnostic at all — which is the class that makes
  // them worth pinning.
  function withLine(replace: string, replacement: string): string {
    return SINGLE_TRIANGLE.replace(replace, replacement);
  }

  it('keeps later records at their declared positions when one line is dropped', () => {
    // THE HEADLINE. Records are addressed by array POSITION — a vert names a weight range, a tri names
    // verts — and the file declares each record's own ordinal. Dropping a malformed line and closing the
    // gap by shifting silently redefines every reference to every later record, and no bounds check
    // downstream can notice because the shifted indices are all still in range. Weight 1 is corrupted
    // here; vertex 1 must still bind to weight 1, not to what used to be weight 2.
    const source = withLine('  weight 1 0 1.0 ( 1 0 0 )', '  weight 1 0 1.0 ( 1 0 )');
    const diagnostics: ImportDiagnostic[] = [];
    const document = parseMd5Mesh(source, diagnostics);
    expect(findDiagnostic(diagnostics, 'md5mesh.malformed-weight')).toBeDefined();
    // The gap is filled rather than closed, so weight 2 is still at index 2.
    expect(findDiagnostic(diagnostics, 'md5mesh.weight-index-gap')).toBeDefined();

    // Vertex 2 keeps the position its own weight authored, which a one-record shift would have moved.
    const point = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(point, document.meshes[0].geometry, 2);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(point.x).toBeCloseTo(0);
  });

  it('reports a declared count that disagrees with the records actually present', () => {
    // The cheapest detector for a lost record: two independent statements of one quantity.
    const source = withLine('  numweights 3', '  numweights 4');
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Mesh(source, diagnostics);
    const crumb = findDiagnostic(diagnostics, 'md5mesh.weight-count-mismatch');
    expect(crumb).toBeDefined();
    expect(crumb!.detail?.firstExpected).toBe(4);
    expect(crumb!.detail?.firstActual).toBe(3);
  });

  it('drops a triangle whose vertex index is out of range instead of handing it to the GPU', () => {
    // A too-large index poisons the normals of the two GOOD vertices it shares a triangle with; a
    // NEGATIVE one wraps through Uint32Array.from to roughly 4.29 billion and reaches the index buffer.
    for (const bad of ['  tri 0 0 1 7', '  tri 0 0 1 -1']) {
      const diagnostics: ImportDiagnostic[] = [];
      const document = parseMd5Mesh(withLine('  tri 0 0 1 2', bad), diagnostics);
      expect(findDiagnostic(diagnostics, 'md5mesh.triangle-vertex-out-of-range')).toBeDefined();
      for (const mesh of document.meshes) {
        expect(getMeshGeometryIndexCount(mesh.geometry)).toBe(0);
      }
    }
  });

  it('drops a vertex whose weight range starts before the weight array rather than throwing', () => {
    // A negative startWeight passes the `>= weights.length` guard, indexes before the array, and
    // dereferences undefined — a TypeError out of a parser documented never to throw.
    const diagnostics: ImportDiagnostic[] = [];
    expect(() =>
      parseMd5Mesh(withLine('  vert 0 ( 0.0 0.0 ) 0 1', '  vert 0 ( 0.0 0.0 ) -3 2'), diagnostics),
    ).not.toThrow();
    expect(findDiagnostic(diagnostics, 'md5mesh.malformed-vert')).toBeDefined();
  });

  it('reports a parent index below the root sentinel, not only one past the joint count', () => {
    // -1 means root. Anything below it matched NO branch and was silently indistinguishable from a root,
    // while the too-large half was correctly reported — the asymmetry.
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Mesh(withLine('  "root" -1 ( 0 0 0 ) ( 0 0 0 )', '  "root" -7 ( 0 0 0 ) ( 0 0 0 )'), diagnostics);
    expect(findDiagnostic(diagnostics, 'md5mesh.joint-parent-out-of-range')).toBeDefined();
  });

  it('does not throw on a joint that names itself as its own parent', () => {
    const diagnostics: ImportDiagnostic[] = [];
    expect(() =>
      parseMd5Mesh(withLine('  "root" -1 ( 0 0 0 ) ( 0 0 0 )', '  "root" 0 ( 0 0 0 ) ( 0 0 0 )'), diagnostics),
    ).not.toThrow();
    expect(findDiagnostic(diagnostics, 'md5mesh.joint-parent-out-of-range')).toBeDefined();
  });

  it('renormalizes a corrupt orientation instead of accepting a non-unit quaternion', () => {
    // (2,0,0) reconstructs to the quaternion (2,0,0,0) — norm 2, not a rotation. Composed into the bind
    // pose it SCALES the joint by four and corrupts the inverse-bind matrix.
    const diagnostics: ImportDiagnostic[] = [];
    parseMd5Mesh(withLine('  "root" -1 ( 0 0 0 ) ( 0 0 0 )', '  "root" -1 ( 0 0 0 ) ( 2 0 0 )'), diagnostics);
    expect(findDiagnostic(diagnostics, 'md5mesh.joint-orientation-not-unit')).toBeDefined();
  });
});
