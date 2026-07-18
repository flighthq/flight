import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { BlinnPhongMaterial, ExternalSceneResourceRef, Mesh, SceneNode } from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { parseObjMaterialLibrary } from './mtlParse';
import { createSceneFromObj } from './objParse';

describe('createSceneFromObj', () => {
  it('parses a single triangle with positions only', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    const children = getNodeChildren(scene);
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
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // 4 unique vertices, 6 indices (2 triangles).
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates a quad face', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // A quad becomes 2 triangles = 6 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates an N-gon face (pentagon)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1.5 0.5 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4 5'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // A pentagon becomes 3 triangles = 9 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(9);
  });

  it('handles independent position/uv/normal indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'f 1/1/1 2/2/1 3/3/1'].join(
      '\n',
    );

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
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
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, -1]);
  });

  it('handles v/vt syntax (position and uv, no normal)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0.5 0.5', 'f 1/1 2/1 3/1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0.5, 0.5]);
  });

  it('resolves negative (relative) vertex indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f -3 -2 -1'].join('\n');

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const p = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(p, geometry, 0);
    expect([p.x, p.y, p.z]).toEqual([0, 0, 0]);
    getMeshGeometryVertexPosition(p, geometry, 2);
    expect([p.x, p.y, p.z]).toEqual([0, 1, 0]);
  });

  it('collapses each single-mesh group to a bare named Mesh', () => {
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
    const roots = getNodeChildren(scene);
    expect(roots).toHaveLength(2);

    // Each group holds a single mesh, so it collapses to the bare Mesh with the group name migrated
    // onto it — getNodeChildren(scene) returns Mesh nodes, not transform-only wrappers.
    const groupA = roots[0] as SceneNode;
    expect(isMesh(groupA)).toBe(true);
    expect(groupA.name).toBe('GroupA');

    const groupB = roots[1] as SceneNode;
    expect(isMesh(groupB)).toBe(true);
    expect(groupB.name).toBe('GroupB');
  });

  it('collapses a single-object group to a bare Mesh carrying the object name', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'o Cube', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    const roots = getNodeChildren(scene);
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as SceneNode)).toBe(true);
    expect((roots[0] as SceneNode).name).toBe('Cube');
  });

  it('splits faces by material into separate meshes', () => {
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
    // One group node "Body" with two mesh children (one per material).
    const group = getNodeChildren(scene)[0] as SceneNode;
    expect(isMesh(group)).toBe(false);
    const meshes = getNodeChildren(group);
    expect(meshes).toHaveLength(2);
    expect(isMesh(meshes[0] as SceneNode)).toBe(true);
    expect(isMesh(meshes[1] as SceneNode)).toBe(true);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFromObj('');
    expect(getNodeChildren(scene)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createSceneFromObj('# just a comment\n');
    expect(getNodeChildren(scene)).toHaveLength(0);
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
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // Same 3 unique vertex combos used by both faces.
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('creates distinct vertices when the same position has different normals', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vn 0 0 -1', 'f 1//1 2//1 3//1', 'f 1//2 2//2 3//2'].join(
      '\n',
    );

    const scene = createSceneFromObj(obj);
    const geometry = (getNodeChildren(scene)[0] as Mesh).geometry;
    // 3 pos * 2 normals = 6 unique vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
  });

  it('attaches a BlinnPhongMaterial resolved from the MTL library by usemtl name', () => {
    const mtl = 'newmtl RedMat\nKd 1 0 0\n';
    const lib = parseObjMaterialLibrary(mtl);

    const obj = ['mtllib materials.mtl', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl RedMat', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj, lib);
    const mesh = getNodeChildren(scene)[0] as Mesh;
    expect(isMesh(mesh)).toBe(true);
    expect(mesh.materials).toHaveLength(1);
    const material = mesh.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xff0000ff); // Kd 1 0 0, opaque (d defaults to 1)
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

    const material = (getNodeChildren(createSceneFromObj(obj, lib))[0] as Mesh).materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xcc6633_80 >>> 0); // Kd 0.8,0.4,0.2 with d=0.5 alpha
    expect(material.specular).toBe(0xffffffff); // Ks 1,1,1 opaque
    expect(material.shininess).toBe(64); // Ns
    expect(material.alphaMode).toBe('blend'); // d < 1
    // Texture maps are referenced by filename, not decoded.
    expect((material.diffuseMap!.resource as ExternalSceneResourceRef).uri).toBe('wood.png');
    expect((material.specularMap!.resource as ExternalSceneResourceRef).uri).toBe('spec.png');
    expect((material.normalMap!.resource as ExternalSceneResourceRef).uri).toBe('normal.png');
    expect(material.diffuseMap!.image).toBeNull();
  });

  it('leaves a mesh unmaterialed when usemtl names a material absent from the library', () => {
    const lib = parseObjMaterialLibrary('newmtl Known\nKd 1 1 1\n');
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl Missing', 'f 1 2 3'].join('\n');

    const mesh = getNodeChildren(createSceneFromObj(obj, lib))[0] as Mesh;
    expect(mesh.materials).toHaveLength(0);
  });

  it('handles faces before any group or object (top-level geometry)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createSceneFromObj(obj);
    // Mesh should be a direct child of scene (no wrapper group).
    const children = getNodeChildren(scene);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as SceneNode)).toBe(true);
  });
});
