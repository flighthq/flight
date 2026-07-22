import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { BlinnPhongMaterial, ExternalImageResourceReference, Mesh, SceneNode } from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { parseObjMaterialLibrary } from './mtlParse';
import { createSceneFromObj, parseObj } from './objParse';

describe('createSceneFromObj', () => {
  it('parses a single triangle with positions only', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as SceneNode)).toBe(true);

    const geometry = (children[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 1);
    expect([p.x, p.y, p.z]).toEqual([1, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('parses multiple faces sharing vertices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3', 'f 1 3 4'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 4 unique vertices, 6 indices (2 triangles).
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates a quad face', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // A quad becomes 2 triangles = 6 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates an N-gon face (pentagon)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1.5 0.5 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4 5'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // A pentagon becomes 3 triangles = 9 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(9);
  });

  it('handles independent position/uv/normal indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'f 1/1/1 2/2/1 3/3/1'].join(
      '\n',
    );

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, 1]);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0, 1]);
    getMeshGeometryVertexUv0(uv, geometry, 1);
    expect([uv.x, uv.y]).toEqual([1, 1]);
  });

  it('handles v//vn syntax (position and normal, no uv)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 -1', 'f 1//1 2//1 3//1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, -1]);
  });

  it('handles v/vt syntax (position and uv, no normal)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0.5 0.5', 'f 1/1 2/1 3/1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0.5, 0.5]);
  });

  it('resolves negative (relative) vertex indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f -3 -2 -1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('emits each single-material group as a bare named Mesh', () => {
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'g GroupA',
      'f 1 2 3',
      'g GroupB',
      'f 4 5 6',
    ].join('\n');

    const scene = createSceneFromObj(obj);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(2);

    // Each single-material group becomes one bare Mesh carrying the group name —
    // getNodeChildren(scene.root) returns Mesh nodes, not transform-only wrappers.
    const groupA = roots[0] as SceneNode;
    expect(isMesh(groupA)).toBe(true);
    expect(groupA.name).toBe('GroupA');

    const groupB = roots[1] as SceneNode;
    expect(isMesh(groupB)).toBe(true);
    expect(groupB.name).toBe('GroupB');
  });

  it('emits a single-object group as a bare Mesh carrying the object name', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'o Cube', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as SceneNode)).toBe(true);
    expect((roots[0] as SceneNode).name).toBe('Cube');
  });

  it('emits a multi-material group as one Mesh with a subset per material', () => {
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'g Body',
      'usemtl Red',
      'f 1 2 3',
      'usemtl Blue',
      'f 4 5 6',
    ].join('\n');

    const scene = createSceneFromObj(obj);
    // The group "Body" is one bare Mesh, not a wrapper over per-material child meshes.
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    const mesh = roots[0] as Mesh;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.name).toBe('Body');

    // One MeshSubset per material, each addressing that material's contiguous index range, plus a
    // positional materials slot per subset (null here — no library supplied).
    const subsets = mesh.geometry.subsets;
    expect(subsets).toHaveLength(2);
    expect(subsets[0]).toEqual({ indexCount: 3, indexOffset: 0 });
    expect(subsets[1]).toEqual({ indexCount: 3, indexOffset: 3 });
    expect(mesh.materials).toEqual([null, null]);
    expect(getMeshGeometryIndexCount(mesh.geometry)).toBe(6);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFromObj('');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createSceneFromObj('# just a comment\n');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('warns on faces with fewer than 3 vertices', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nf 1 2\n';
    const warnings: string[] = [];
    createSceneFromObj(obj, undefined, warnings);
    expect(warnings.some((w) => w.includes('fewer than 3'))).toBe(true);
  });

  it('warns on out-of-range vertex indices', () => {
    const obj = 'v 0 0 0\nf 1 2 3\n';
    const warnings: string[] = [];
    createSceneFromObj(obj, undefined, warnings);
    expect(warnings.some((w) => w.includes('out of range'))).toBe(true);
  });

  it('warns on non-numeric position components', () => {
    const obj = 'v abc def ghi\n';
    const warnings: string[] = [];
    createSceneFromObj(obj, undefined, warnings);
    expect(warnings.some((w) => w.includes('non-numeric'))).toBe(true);
  });

  it('deduplicates vertices sharing the same position/uv/normal tuple', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3', 'f 3 2 1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // Same 3 unique vertex combos used by both faces.
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('creates distinct vertices when the same position has different normals', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vn 0 0 -1', 'f 1//1 2//1 3//1', 'f 1//2 2//2 3//2'].join(
      '\n',
    );

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 3 pos * 2 normals = 6 unique vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
  });

  it('attaches a BlinnPhongMaterial resolved from the MTL library by usemtl name', () => {
    const mtl = 'newmtl RedMat\nKd 1 0 0\n';
    const lib = parseObjMaterialLibrary(mtl);

    const obj = ['mtllib materials.mtl', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl RedMat', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj, lib);
    const mesh = getNodeChildren(scene.root)[0] as Mesh;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xff0000ff); // Kd 1 0 0, opaque (d defaults to 1)
    expect(material.name).toBe('RedMat'); // MTL newmtl name preserved as the authored identity
  });

  it("maps MTL's own Kd/Ks/Ns/d/maps onto BlinnPhong fields, referencing map filenames unresolved", () => {
    const mtl = [
      'newmtl Shiny',
      'Kd 0.8 0.4 0.2',
      'Ks 1 1 1',
      'Ns 64',
      'd 0.5',
      'map_Kd wood.png',
      'map_Ks spec.png',
      'bump normal.png',
    ].join('\n');
    const lib = parseObjMaterialLibrary(mtl);
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl Shiny', 'f 1 2 3'].join('\n');

    const material = (getNodeChildren(createSceneFromObj(obj, lib).root)[0] as Mesh).materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xcc6633_80 >>> 0); // Kd 0.8,0.4,0.2 with d=0.5 alpha
    expect(material.specular).toBe(0xffffffff); // Ks 1,1,1 opaque
    expect(material.shininess).toBe(64); // Ns
    expect(material.alphaMode).toBe('blend'); // d < 1
    // Texture maps are referenced by filename, not decoded.
    expect((material.diffuseMap!.resource as ExternalImageResourceReference).uri).toBe('wood.png');
    expect((material.specularMap!.resource as ExternalImageResourceReference).uri).toBe('spec.png');
    expect((material.normalMap!.resource as ExternalImageResourceReference).uri).toBe('normal.png');
    expect(material.diffuseMap!.image).toBeNull();
  });

  it('leaves a subset slot null when usemtl names a material absent from the library', () => {
    const lib = parseObjMaterialLibrary('newmtl Known\nKd 1 1 1\n');
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl Missing', 'f 1 2 3'].join('\n');

    const mesh = getNodeChildren(createSceneFromObj(obj, lib).root)[0] as Mesh;
    // One subset, one positional slot — null (resolves to DefaultMaterialKind at draw time).
    expect(mesh.materials).toEqual([null]);
  });

  it('persists the active material across a group boundary (g/o does not reset usemtl)', () => {
    const lib = parseObjMaterialLibrary('newmtl RedMat\nKd 1 0 0\n');
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'usemtl RedMat',
      'g A',
      'f 1 2 3',
      'g B',
      'f 4 5 6',
    ].join('\n');

    const roots = getNodeChildren(createSceneFromObj(obj, lib).root);
    expect(roots).toHaveLength(2);
    // Group B declares no usemtl of its own; per the OBJ spec it inherits RedMat set before group A.
    const groupB = roots[1] as Mesh;
    const material = groupB.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xff0000ff);
  });

  it('handles faces before any group or object (top-level geometry)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    // Mesh should be a direct child of scene (no wrapper group).
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as SceneNode)).toBe(true);
  });
});

describe('createSceneFromObj animations', () => {
  it('carries no animations (OBJ has none)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    expect(Object.keys(createSceneFromObj(obj).animations)).toHaveLength(0);
  });
});

describe('parseObj', () => {
  it('decomposes each group into a document mesh node with inline geometry', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const document = parseObj(obj);
    expect(document.meshes).toHaveLength(1);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
    expect(document.nodes[0].mesh).toBe(0);
    expect(document.scenes[0].rootNodes).toEqual([0]);
  });

  it('registers a usemtl material into the document materials table by index', () => {
    const mtl = ['newmtl red', 'Kd 1 0 0'].join('\n');
    const library = parseObjMaterialLibrary(mtl);
    const obj = ['usemtl red', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const document = parseObj(obj, library);
    expect(document.materials).toHaveLength(1);
    expect((document.materials[0] as BlinnPhongMaterial).name).toBe('red');
    expect(document.meshes[0].materials).toEqual([0]);
  });

  it('records each shared MTL image identity once while retaining separate Texture entities', () => {
    const library = parseObjMaterialLibrary(
      ['newmtl first', 'map_Kd shared.png', 'newmtl second', 'map_Kd shared.png'].join('\n'),
    );
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'usemtl first',
      'g first',
      'f 1 2 3',
      'usemtl second',
      'g second',
      'f 1 2 3',
    ].join('\n');
    const document = parseObj(obj, library);
    const first = document.materials[0] as BlinnPhongMaterial;
    const second = document.materials[1] as BlinnPhongMaterial;

    expect(document.resources).toHaveLength(1);
    expect((document.resources[0] as ExternalImageResourceReference).uri).toBe('shared.png');
    expect(first.diffuseMap).not.toBe(second.diffuseMap);
    expect(first.diffuseMap!.resource).toBe(document.resources[0]);
    expect(second.diffuseMap!.resource).toBe(document.resources[0]);
  });

  it('uses a -1 material index for an unmaterialed subset', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const document = parseObj(obj);
    expect(document.materials).toHaveLength(0);
    expect(document.meshes[0].materials).toEqual([-1]);
  });
});
