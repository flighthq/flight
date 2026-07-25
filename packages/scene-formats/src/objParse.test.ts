import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh';
import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  ImportDiagnostic,
  Mesh,
  SceneNode,
} from '@flighthq/types';
import { BlinnPhongMaterialKind } from '@flighthq/types';

import { parseObjMaterialLibrary } from './mtlParse';
import { createSceneFromObj, parseObj } from './objParse';

// Asserts EXACTLY ONE crumb of `kind` was recorded (guards the count) and returns it so a test can lock
// the full contract — severity, true origin, and detail — for that emitted diagnostic.
function expectOneCrumb(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic {
  const matches = diagnostics.filter((d) => d.kind === kind);
  expect(matches).toHaveLength(1);
  return matches[0];
}

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

  it('treats a bare g as the default (unnamed) group, closing the prior named group', () => {
    // Wavefront spec: a group with no name is the default group. A bare `g` must close group A and enter it,
    // not leave the following face in A. This is a defined state, not a drop — no diagnostic.
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'g A',
      'f 1 2 3',
      'g',
      'f 4 5 6',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    const scene = createSceneFromObj(obj, undefined, diagnostics);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(2);
    expect((roots[0] as SceneNode).name).toBe('A');
    expect((roots[1] as SceneNode).name).toBeNull(); // the default (unnamed) group after the bare g
    expect(diagnostics).toHaveLength(0);
  });

  it('recovers a bare o as an unnamed boundary AND records object-name-missing (Recover, parseObj)', () => {
    // `o` always takes a name in the spec, so a bare `o` is undefined input: the importer recovers by closing
    // the prior object and starting an unnamed one — and because that is substitute-and-continue, the collector
    // contract requires it be recorded as a Recover crumb (unlike the spec-defined, silent bare g/usemtl).
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'o Cube',
      'f 1 2 3',
      'o',
      'f 4 5 6',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    const roots = getNodeChildren(createSceneFromObj(obj, undefined, diagnostics).root);
    // Exact output: the recovery still happens — two nodes, the named Cube then the unnamed boundary.
    expect(roots).toHaveLength(2);
    expect((roots[0] as SceneNode).name).toBe('Cube');
    expect((roots[1] as SceneNode).name).toBeNull();
    // Exact crumb: one Recover for the missing object name, emitted from parseObj.
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.object-name-missing');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(9); // the bare `o` line
    expect(crumb.detail?.count).toBe(1);
  });

  it('treats a bare usemtl as the default material, clearing the previously active one', () => {
    // Wavefront spec: `usemtl` with no name is the default (white / no) material. A bare `usemtl` must clear
    // the active material so the following faces are NOT bound to the stale one. A defined state, not a drop.
    const library = parseObjMaterialLibrary('newmtl Red\nKd 1 0 0\n');
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 2 0 0',
      'v 2 1 0',
      'v 3 0 0',
      'usemtl Red',
      'f 1 2 3',
      'usemtl',
      'f 4 5 6',
    ].join('\n');
    const diagnostics: ImportDiagnostic[] = [];
    const mesh = getNodeChildren(createSceneFromObj(obj, library, diagnostics).root)[0] as Mesh;
    // One group, two subsets: the Red material then the default (no material) after the bare usemtl — the
    // second slot must be null, NOT a stale Red.
    expect(mesh.geometry.subsets).toHaveLength(2);
    expect(mesh.materials).toHaveLength(2);
    expect(mesh.materials[0]).not.toBeNull();
    expect((mesh.materials[0] as BlinnPhongMaterial).kind).toBe(BlinnPhongMaterialKind);
    expect(mesh.materials[1]).toBeNull();
    expect(diagnostics).toHaveLength(0);
  });

  it('returns an empty scene for empty input', () => {
    const scene = createSceneFromObj('');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createSceneFromObj('# just a comment\n');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('records a diagnostic on faces with fewer than 3 vertices', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nf 1 2\n';
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj(obj, undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.face-too-few-vertices');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(3);
    expect(crumb.detail?.count).toBe(1);
  });

  it('records a diagnostic on out-of-range position indices', () => {
    const obj = 'v 0 0 0\nf 1 2 3\n';
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj(obj, undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.position-index-out-of-range');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(2);
    expect(crumb.detail?.firstIndex).toBe(2);
    expect(crumb.detail?.count).toBe(1);
  });

  it('records a diagnostic on non-numeric position components', () => {
    const obj = 'v abc def ghi\n';
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj(obj, undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.vertex-malformed');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.reason).toBe('non-numeric');
    expect(crumb.detail?.count).toBe(1);
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

describe('obj diagnostic crumb coverage', () => {
  it.each(OBJ_MALFORMED_CASES)(
    'records $kind (reason $reason) as a Drop from parseObj',
    ({ obj, kind, line, reason }) => {
      const diagnostics: ImportDiagnostic[] = [];
      createSceneFromObj(obj, undefined, diagnostics);
      expect(diagnostics).toHaveLength(1);
      const crumb = expectOneCrumb(diagnostics, kind);
      expect(crumb.severity).toBe('Drop');
      expect(crumb.origin).toBe('parseObj');
      expect(crumb.detail?.firstLine).toBe(line);
      expect(crumb.detail?.reason).toBe(reason);
      expect(crumb.detail?.count).toBe(1);
    },
  );

  it('records face-vertex-invalid (Drop, parseObj) for a zero/non-numeric face index token', () => {
    // Index 0 is invalid in OBJ (1-based); the token is dropped and the face vertex loop breaks.
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nf 0 1 2\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.face-vertex-invalid');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(2);
    expect(crumb.detail?.firstToken).toBe('0');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records uv-index-invalid (Recover, parseObj) — the vertex still emits without that uv', () => {
    // One vt (index 1); the face references uv index 9. The vertex is kept (uv falls back), so Recover.
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/9 3/1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.uv-index-invalid');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(5);
    expect(crumb.detail?.firstToken).toBe('9');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records uv-index-invalid (Recover, parseObj) for a NON-NUMERIC uv token — previously a silent drop', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/x 3/1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.uv-index-invalid');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstToken).toBe('x');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records normal-index-invalid (Recover, parseObj) — the vertex still emits without that normal', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//9 3//1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.normal-index-invalid');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(5);
    expect(crumb.detail?.firstToken).toBe('9');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records normal-index-invalid (Recover, parseObj) for a NON-NUMERIC normal token — previously a silent drop', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//x 3//1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.normal-index-invalid');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstToken).toBe('x');
    expect(crumb.detail?.count).toBe(1);
  });

  it('aggregates repeated malformed lines into ONE crumb with the total count and the first line', () => {
    // Three non-numeric `v` lines — the collector contract requires ONE aggregated crumb (count 3), not three.
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v a b c\nv 0 0 0\nv d e f\nv g h i\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.vertex-malformed');
    expect(crumb.detail?.reason).toBe('non-numeric');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.count).toBe(3);
  });

  it('aggregates a multi-invalid N-gon face into ONE uv-index crumb, not one per token', () => {
    // The regression review flagged: f 1/9 2/8 3/7 has three out-of-range uv refs; a per-token report would
    // emit three crumbs. It must aggregate to ONE with count 3 and the first offending index.
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/9 2/8 3/7\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.uv-index-invalid');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(5);
    expect(crumb.detail?.firstToken).toBe('9');
    expect(crumb.detail?.count).toBe(3);
  });

  it('records material-missing (Drop, resolveObjMaterial) when a usemtl name is absent from a supplied library', () => {
    const library = parseObjMaterialLibrary('newmtl Present\nKd 1 0 0\n');
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\nf 1 2 3\n', library, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.material-missing');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('resolveObjMaterial');
    expect(crumb.detail?.name).toBe('Absent');
  });

  it('reports material-missing once per distinct name (cache-deduped) and stays quiet with no library', () => {
    // Two groups both referencing the same absent name → ONE crumb: the name cache dedupes the drop.
    const library = parseObjMaterialLibrary('newmtl Present\n');
    const deduped: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\ng A\nf 1 2 3\ng B\nf 1 2 3\n', library, deduped);
    expect(deduped.filter((d) => d.kind === 'obj.material-missing')).toHaveLength(1);

    // No library supplied is the documented intentional path — an unknown usemtl records nothing.
    const noLibrary: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\nf 1 2 3\n', undefined, noLibrary);
    expect(noLibrary).toHaveLength(0);
  });

  // A BARE recognized geometry directive (no arguments at all) is an implicit malformed no-op the old code
  // skipped silently. Probe each: the announced vertex/normal/uv/face still records a drop.
  it.each([
    { kind: 'obj.vertex-malformed', obj: 'v\n', reason: 'too-few-components' },
    { kind: 'obj.normal-malformed', obj: 'vn\n', reason: 'too-few-components' },
    { kind: 'obj.uv-malformed', obj: 'vt\n', reason: 'too-few-components' },
  ])('records $kind (Drop, parseObj) for a bare $kind directive', ({ kind, obj, reason }) => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj(obj, undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, kind);
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.reason).toBe(reason);
    expect(crumb.detail?.count).toBe(1);
  });

  it('records face-too-few-vertices (Drop, parseObj) for a bare f directive', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('f\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.face-too-few-vertices');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.count).toBe(1);
  });

  it('records obj.directive-unsupported (Skip, parseObj) for a recognized-but-unmodeled directive (s)', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('s 1\n', undefined, diagnostics);
    const crumb = expectOneCrumb(diagnostics, 'obj.directive-unsupported');
    expect(crumb.severity).toBe('Skip');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.directive).toBe('s');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records no diagnostics for a well-formed OBJ even with a collector engaged', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createSceneFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });
});

// (source, kind, severity, origin, detail) → every remaining OBJ diagnostic site, one row per emitting
// variant, complementing the three converted createSceneFromObj cases above. Each locks the full crumb.
const OBJ_MALFORMED_CASES: Array<{ obj: string; kind: string; line: number; reason: string }> = [
  { obj: 'v 0 0\n', kind: 'obj.vertex-malformed', line: 1, reason: 'too-few-components' },
  { obj: 'vn 0 0\n', kind: 'obj.normal-malformed', line: 1, reason: 'too-few-components' },
  { obj: 'vn a b c\n', kind: 'obj.normal-malformed', line: 1, reason: 'non-numeric' },
  { obj: 'vt 0\n', kind: 'obj.uv-malformed', line: 1, reason: 'too-few-components' },
  { obj: 'vt a b\n', kind: 'obj.uv-malformed', line: 1, reason: 'non-numeric' },
];

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
