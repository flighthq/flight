import { getMatrix4Position } from '@flighthq/geometry';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren, getNodeWorldTransformMatrix4 } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type {
  BlinnPhongMaterial,
  ExternalSceneResourceRef,
  Mesh,
  SceneAnimationTarget,
  SceneNode,
} from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { createSceneFromMd5Mesh, importMd5Mesh } from './md5Parse';

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

describe('createSceneFromMd5Mesh', () => {
  it('parses a single triangle with one joint', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const children = getNodeChildren(scene);
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
    const meshNode = getNodeChildren(scene)[1] as unknown as Mesh;

    expect(meshNode.skin).toBeTruthy();
    // The skin's skeleton exposes the joint nodes parseMd5Anim needs, one per parsed joint.
    expect(meshNode.skin?.skeleton.joints).toHaveLength(3);
    expect(meshNode.skin?.skeleton.names).toEqual(['root', 'child_a', 'child_b']);
    // The skeleton root is the "skeleton" group added to the scene (children[0]).
    expect(meshNode.skin?.skeletonRoot).toBe(getNodeChildren(scene)[0]);
  });

  it('emits joints0/weights0 into an 80-byte skinned layout with weights renormalized to 1', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const geometry = (getNodeChildren(scene)[1] as unknown as Mesh).geometry;

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
    const geometry = (getNodeChildren(scene)[1] as unknown as Mesh).geometry;
    const floatsPerVertex = geometry.layout.stride / 4;
    // Normal is at float offset 3; a flat triangle yields a unit face normal, not the zero-fill.
    const nx = geometry.vertices[3];
    const ny = geometry.vertices[4];
    const nz = geometry.vertices[5];
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1);
  });

  it('preserves UV coordinates', () => {
    const scene = createSceneFromMd5Mesh(SINGLE_TRIANGLE);
    const children = getNodeChildren(scene);
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

  it('gives each joint a world transform equal to its own absolute MD5 transform, not accumulated', () => {
    // Two joints where the child's PARENT sits away from the origin, so nesting-vs-flat is observable.
    // MD5 joint transforms are absolute, so the child's world position must equal its own absolute
    // (Z-up→Y-up: (x,y,z)→(x,z,-y)) value — NOT parent∘child, which the old nested build produced and
    // which explodes the mesh under animation.
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
    const jointNodes = getNodeChildren(getNodeChildren(scene)[0] as SceneNode) as unknown as SceneNode[];
    const child = jointNodes[1];

    const world = { x: 0, y: 0, z: 0 };
    getMatrix4Position(world, getNodeWorldTransformMatrix4(child));
    // Absolute (10,5,0) → Y-up (10, 0, -5). Nested-under-a-(10,0,0)-parent would give (20,0,-5).
    expect(world.x).toBeCloseTo(10);
    expect(world.y).toBeCloseTo(0);
    expect(world.z).toBeCloseTo(-5);
  });

  it('builds a flat skeleton — every joint directly under the skeleton root', () => {
    // MD5 joint transforms are absolute (object-space), so the skeleton is flat: each joint's world
    // transform equals its own absolute transform. Nesting joints parent-under-parent would treat the
    // absolute transforms as parent-relative and explode the mesh under animation. So all three joints
    // (root + two children) hang directly off the skeleton group, none nested under another joint.
    const scene = createSceneFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    const skeleton = getNodeChildren(scene)[0] as SceneNode;

    const jointNodes = getNodeChildren(skeleton);
    expect(jointNodes).toHaveLength(3);
    // No joint nests another joint under it.
    for (const joint of jointNodes) expect(getNodeChildren(joint as SceneNode)).toHaveLength(0);
  });

  it('computes vertex positions from weights referencing different joints', () => {
    const scene = createSceneFromMd5Mesh(MULTI_JOINT_HIERARCHY);
    // Find the mesh node (second child after skeleton).
    const meshNode = getNodeChildren(scene)[1] as unknown as Mesh;
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
    const meshNode = getNodeChildren(scene)[1] as unknown as Mesh;
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
    const children = getNodeChildren(scene);
    // Skeleton + 2 meshes.
    expect(children).toHaveLength(3);
    expect(isMesh(children[1] as SceneNode)).toBe(true);
    expect(isMesh(children[2] as SceneNode)).toBe(true);
  });

  it("decodes each section's shader to a BlinnPhongMaterial referencing the shader path as a diffuseMap", () => {
    const mesh = getNodeChildren(createSceneFromMd5Mesh(SINGLE_TRIANGLE))[1] as Mesh;
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    // The shader path is referenced, not decoded: an Unresolved External ref, image left null.
    expect((material.diffuseMap!.resource as ExternalSceneResourceRef).uri).toBe('textures/default');
    expect(material.diffuseMap!.image).toBeNull();
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFromMd5Mesh('');
    expect(getNodeChildren(scene)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createSceneFromMd5Mesh('// just a comment\n');
    expect(getNodeChildren(scene)).toHaveLength(0);
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
    expect(getNodeChildren(scene)).toHaveLength(0);
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
    expect(getNodeChildren(scene)).toHaveLength(2);
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
    const meshNode = getNodeChildren(scene)[1] as unknown as Mesh;
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
    const meshNode = getNodeChildren(scene)[1] as unknown as Mesh;
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

describe('importMd5Mesh', () => {
  it('returns the scene with empty animations when no anim source is given', () => {
    const result = importMd5Mesh(SINGLE_TRIANGLE);
    expect(result.scenes).toHaveLength(1);
    expect(result.scene).toBe(result.scenes[0]);
    expect(result.animations).toHaveLength(0);
  });

  it('folds a paired .md5anim into a clip bound to the scene’s own skeleton joints', () => {
    const result = importMd5Mesh(SINGLE_TRIANGLE, SINGLE_JOINT_ANIM);
    expect(result.animations).toHaveLength(1);

    const mesh = getNodeChildren(result.scene).find((c) => isMesh(c as SceneNode)) as unknown as Mesh;
    const joints = mesh.skin!.skeleton.joints;
    const channel = result.animations[0].channels[0];
    // The clip binds the SAME joint node the imported mesh skins from — no caller threading.
    expect((channel.targetRef as SceneAnimationTarget).node).toBe(joints[0]);
  });
});
