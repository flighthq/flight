import { getMatrix4Position } from '@flighthq/geometry';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren, getNodeLocalMatrix4 } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  Mesh,
  SceneAnimationTarget,
  SceneNode,
} from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { parseMd5Anim } from './md5AnimParse';
import { createSceneFromMd5Mesh, parseMd5Mesh } from './md5Parse';
import { findSceneSkeletonJoints } from './shared';

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

describe('createSceneFromMd5Mesh', () => {
  it('parses a single triangle with one joint', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const children = getNodeChildren(scene.root);
    // Skeleton group + one mesh.
    expect(children).toHaveLength(2);

    // The skeleton is the first child.
    const skeleton = children[0] as SceneNode;
    expect(isMesh(skeleton)).toBe(false);

    // The mesh is the second child.
    const meshNode = children[1] as SceneNode;
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
    const scene = createSceneFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    const meshNode = getNodeChildren(scene.root)[1] as unknown as Mesh;

    expect(meshNode.skin).toBeTruthy();
    // The skin's skeleton exposes the joint nodes parseMd5Anim needs, one per parsed joint.
    expect(meshNode.skin?.skeleton.joints).toHaveLength(3);
    expect(meshNode.skin?.skeleton.names).toEqual(['root', 'child_a', 'child_b']);
    // The document assembler does not rethread the skeleton group as the skin's skeletonRoot (it stays
    // null, matching every importer that routes through createSceneFromDocument); the "skeleton" group is
    // still a scene-root child (children[0]).
    expect(meshNode.skin?.skeletonRoot).toBeNull();
    expect(getNodeChildren(scene.root)[0].name).toBe('skeleton');
  });

  it('emits joints0/weights0 into an 80-byte skinned layout with weights renormalized to 1', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
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
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
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

  it('reverses MD5 triangle winding to Flight CCW-front (front faces stay front under culling)', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene.root)[1] as unknown as Mesh).geometry;
    // MD5 declares "tri 0 0 1 2"; id Tech 4 winds clockwise, and the Z-up→Y-up conversion is a
    // determinant-+1 rotation that preserves winding, so the parser reverses each triangle (swaps
    // v1/v2) to land CCW-front. The index buffer therefore reads 0, 2, 1 rather than 0, 1, 2.
    expect(Array.from(geometry.indices!)).toEqual([0, 2, 1]);
  });

  it('preserves UV coordinates', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
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

    const scene = createSceneFromMd5Mesh(chain);
    // Nested: skeleton → root → child.
    const root = getNodeChildren(getNodeChildren(scene.root)[0] as SceneNode)[0] as SceneNode;
    const child = getNodeChildren(root)[0] as SceneNode;

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
    const scene = createSceneFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    const skeleton = getNodeChildren(scene.root)[0] as SceneNode;

    const rootJoints = getNodeChildren(skeleton);
    expect(rootJoints).toHaveLength(1);
    expect(getNodeChildren(rootJoints[0] as SceneNode)).toHaveLength(2);
  });

  it('computes vertex positions from weights referencing different joints', () => {
    const scene = createSceneFromMd5Mesh(MULTI_JOINT_HIERARCHY);
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
    const scene = createSceneFromMd5Mesh(WEIGHTED_VERTICES);
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

  it('reduces a >4-influence vertex to its 4 highest-weight influences and warns', () => {
    const warnings: string[] = [];
    const scene = createSceneFromMd5Mesh(OVER_INFLUENCED_VERTEX, warnings);
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

    expect(warnings.some((w) => w.includes('more than 4 joint influences'))).toBe(true);
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

    const scene = createSceneFromMd5Mesh(source);
    const children = getNodeChildren(scene.root);
    // Skeleton + 2 meshes.
    expect(children).toHaveLength(3);
    expect(isMesh(children[1] as SceneNode)).toBe(true);
    expect(isMesh(children[2] as SceneNode)).toBe(true);
  });

  it("decodes each section's shader to a BlinnPhongMaterial referencing the shader path as a diffuseMap", () => {
    const mesh = getNodeChildren(createSceneFromMd5Mesh(SINGLE_TRIANGLE).root)[1] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.name).toBe('textures/default'); // MD5 shader path preserved as the authored identity
    // The shader path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((material.diffuseMap!.resource as ExternalImageResourceReference).uri).toBe('textures/default');
    expect(material.diffuseMap!.image).toBeNull();
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFromMd5Mesh('');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createSceneFromMd5Mesh('// just a comment\n');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('warns on malformed joint lines', () => {
    const source = ['MD5Version 10', 'numJoints 1', 'numMeshes 0', 'joints {', '  bad joint line', '}'].join('\n');

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('malformed joint'))).toBe(true);
  });

  it('warns on malformed vert lines', () => {
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

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('malformed vert'))).toBe(true);
  });

  it('warns on malformed tri lines', () => {
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

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('malformed tri'))).toBe(true);
  });

  it('warns on malformed weight lines', () => {
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

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('malformed weight'))).toBe(true);
  });

  it('warns on unsupported MD5Version', () => {
    const source = ['MD5Version 11', 'numJoints 0', 'numMeshes 0'].join('\n');

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('unsupported MD5Version'))).toBe(true);
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

    const scene = createSceneFromMd5Mesh(source);
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

    const warnings: string[] = [];
    const scene = createSceneFromMd5Mesh(source, warnings);
    expect(warnings).toHaveLength(0);
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

    const scene = createSceneFromMd5Mesh(source);
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

  it('warns on out-of-range weight joint index', () => {
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

    const warnings: string[] = [];
    createSceneFromMd5Mesh(source, warnings);
    expect(warnings.some((w) => w.includes('joint index') && w.includes('out of range'))).toBe(true);
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

    const scene = createSceneFromMd5Mesh(source);
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
});

describe('createSceneFromMd5Mesh animations', () => {
  it('returns the mesh scene with an empty animations map (the .md5anim is a separate file)', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    expect(Object.keys(scene.animations)).toHaveLength(0);
  });

  it('composes a paired .md5anim into a named clip bound to the scene’s own skeleton joints', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const joints = findSceneSkeletonJoints(scene.root)!;
    scene.animations.walk = parseMd5Anim(SINGLE_JOINT_ANIM, joints)!;
    expect(Object.keys(scene.animations)).toEqual(['walk']);

    const mesh = getNodeChildren(scene.root).find((c) => isMesh(c as SceneNode)) as unknown as Mesh;
    const meshJoints = mesh.skin!.skeleton.joints;
    const channel = scene.animations.walk.channels[0];
    // The clip binds the SAME joint node the imported mesh skins from — no caller threading.
    expect((channel.targetRef as SceneAnimationTarget).node).toBe(meshJoints[0]);
  });
});

describe('parseMd5Mesh', () => {
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
    expect(doc.resources[0]).toBe((doc.materials[0] as unknown as BlinnPhongMaterial).diffuseMap!.resource);
  });

  it('leaves the animations table empty (the .md5anim is a separate file)', () => {
    const doc = parseMd5Mesh(SINGLE_TRIANGLE);
    expect(doc.animations).toHaveLength(0);
  });
});
