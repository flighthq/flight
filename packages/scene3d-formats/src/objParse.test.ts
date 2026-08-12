import { getPbrRoughnessFromPhongShininess } from '@flighthq/materials/contract';
import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexNormal,
  getMeshGeometryVertexPosition,
  getMeshGeometryVertexUv0,
} from '@flighthq/mesh/contract';
import { getNodeChildren } from '@flighthq/node/contract';
import { isMesh } from '@flighthq/scene3d/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  BlinnPhongMaterial,
  ExternalImageResourceReference,
  ImportDiagnostic,
  MaterialLike,
  Mesh,
  Node3D,
  StandardPbrMaterial,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, ImportDiagnosticSeverity, StandardPbrMaterialKind } from '@flighthq/types/contract';

import { parseObjMaterialLibrary } from './mtlParse';
import { createScene3DFromObj, parseObj } from './objParse';
import { getTestTextureResource } from './scene3DFormatsTestHelper';

// Asserts EXACTLY ONE crumb of `kind` was recorded (guards the count) and returns it so a test can lock
// the full contract — severity, true origin, and detail — for that emitted diagnostic.
function expectOneCrumb(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic {
  const matches = diagnostics.filter((d) => d.kind === kind);
  expect(matches).toHaveLength(1);
  return matches[0];
}

describe('createScene3DFromObj', () => {
  it('parses a single triangle with positions only', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createScene3DFromObj(obj);
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as Node3D)).toBe(true);

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

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 4 unique vertices, 6 indices (2 triangles).
    expect(getMeshGeometryVertexCount(geometry)).toBe(4);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates a quad face', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4'].join('\n');

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // A quad becomes 2 triangles = 6 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('fan-triangulates an N-gon face (pentagon)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 1.5 0.5 0', 'v 1 1 0', 'v 0 1 0', 'f 1 2 3 4 5'].join('\n');

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // A pentagon becomes 3 triangles = 9 indices.
    expect(getMeshGeometryIndexCount(geometry)).toBe(9);
  });

  it('handles independent position/uv/normal indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vt 0 0', 'vt 1 0', 'vt 0 1', 'f 1/1/1 2/2/1 3/3/1'].join(
      '\n',
    );

    const scene = createScene3DFromObj(obj);
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

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const n = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(n, geometry, 0);
    expect([n.x, n.y, n.z]).toEqual([0, 0, -1]);
  });

  it('handles v/vt syntax (position and uv, no normal)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0.5 0.5', 'f 1/1 2/1 3/1'].join('\n');

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);

    const uv = { x: 0, y: 0 };
    getMeshGeometryVertexUv0(uv, geometry, 0);
    expect([uv.x, uv.y]).toEqual([0.5, 0.5]);
  });

  it('resolves negative (relative) vertex indices', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f -3 -2 -1'].join('\n');

    const scene = createScene3DFromObj(obj);
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

    const scene = createScene3DFromObj(obj);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(2);

    // Each single-material group becomes one bare Mesh carrying the group name —
    // getNodeChildren(scene.root) returns Mesh nodes, not transform-only wrappers.
    const groupA = roots[0] as Node3D;
    expect(isMesh(groupA)).toBe(true);
    expect(groupA.name).toBe('GroupA');

    const groupB = roots[1] as Node3D;
    expect(isMesh(groupB)).toBe(true);
    expect(groupB.name).toBe('GroupB');
  });

  it('emits a single-object group as a bare Mesh carrying the object name', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'o Cube', 'f 1 2 3'].join('\n');

    const scene = createScene3DFromObj(obj);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(1);
    expect(isMesh(roots[0] as Node3D)).toBe(true);
    expect((roots[0] as Node3D).name).toBe('Cube');
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

    const scene = createScene3DFromObj(obj);
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
    const scene = createScene3DFromObj(obj, undefined, diagnostics);
    const roots = getNodeChildren(scene.root);
    expect(roots).toHaveLength(2);
    expect((roots[0] as Node3D).name).toBe('A');
    expect((roots[1] as Node3D).name).toBeNull(); // the default (unnamed) group after the bare g
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
    const roots = getNodeChildren(createScene3DFromObj(obj, undefined, diagnostics).root);
    // Exact output: the recovery still happens — two nodes, the named Cube then the unnamed boundary.
    expect(roots).toHaveLength(2);
    expect((roots[0] as Node3D).name).toBe('Cube');
    expect((roots[1] as Node3D).name).toBeNull();
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
    const mesh = getNodeChildren(createScene3DFromObj(obj, library, diagnostics).root)[0] as Mesh;
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
    const scene = createScene3DFromObj('');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('returns an empty scene for comment-only input', () => {
    const scene = createScene3DFromObj('# just a comment\n');
    expect(getNodeChildren(scene.root)).toHaveLength(0);
  });

  it('records a diagnostic on faces with fewer than 3 vertices', () => {
    const obj = 'v 0 0 0\nv 1 0 0\nf 1 2\n';
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj(obj, undefined, diagnostics);
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
    createScene3DFromObj(obj, undefined, diagnostics);
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
    createScene3DFromObj(obj, undefined, diagnostics);
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

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // Same 3 unique vertex combos used by both faces.
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    expect(getMeshGeometryIndexCount(geometry)).toBe(6);
  });

  it('creates distinct vertices when the same position has different normals', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vn 0 0 1', 'vn 0 0 -1', 'f 1//1 2//1 3//1', 'f 1//2 2//2 3//2'].join(
      '\n',
    );

    const scene = createScene3DFromObj(obj);
    const geometry = (getNodeChildren(scene.root)[0] as Mesh).geometry;
    // 3 pos * 2 normals = 6 unique vertices.
    expect(getMeshGeometryVertexCount(geometry)).toBe(6);
  });

  it('attaches a BlinnPhongMaterial resolved from the MTL library by usemtl name', () => {
    const mtl = 'newmtl RedMat\nKd 1 0 0\n';
    const lib = parseObjMaterialLibrary(mtl);

    const obj = ['mtllib materials.mtl', 'v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl RedMat', 'f 1 2 3'].join('\n');

    const scene = createScene3DFromObj(obj, lib);
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
      'norm normal.png',
    ].join('\n');
    const lib = parseObjMaterialLibrary(mtl);
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl Shiny', 'f 1 2 3'].join('\n');

    const scene = createScene3DFromObj(obj, lib);
    const material = (getNodeChildren(scene.root)[0] as Mesh).materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xcc6633_80 >>> 0); // Kd 0.8,0.4,0.2 with d=0.5 alpha
    expect(material.specular).toBe(0xffffffff); // Ks 1,1,1 opaque
    expect(material.shininess).toBe(64); // Ns
    expect(material.alphaMode).toBe('blend'); // d < 1
    // Texture maps are referenced by filename, not decoded.
    expect((getTestTextureResource(scene.resources, material.diffuseMap!) as ExternalImageResourceReference).uri).toBe(
      'wood.png',
    );
    expect((getTestTextureResource(scene.resources, material.specularMap!) as ExternalImageResourceReference).uri).toBe(
      'spec.png',
    );
    expect((getTestTextureResource(scene.resources, material.normalMap!) as ExternalImageResourceReference).uri).toBe(
      'normal.png',
    );
    expect(material.diffuseMap!.colorSpace).toBe('srgb');
    expect(material.specularMap!.colorSpace).toBe('srgb');
    expect(material.normalMap!.colorSpace).toBe('linear');
    expect(getTextureSource(material.diffuseMap!)).toBeNull();
  });

  it('leaves a subset slot null when usemtl names a material absent from the library', () => {
    const lib = parseObjMaterialLibrary('newmtl Known\nKd 1 1 1\n');
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'usemtl Missing', 'f 1 2 3'].join('\n');

    const mesh = getNodeChildren(createScene3DFromObj(obj, lib).root)[0] as Mesh;
    // One subset, one positional slot — null (resolves to StandardMaterialKind at draw time).
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

    const roots = getNodeChildren(createScene3DFromObj(obj, lib).root);
    expect(roots).toHaveLength(2);
    // Group B declares no usemtl of its own; per the OBJ spec it inherits RedMat set before group A.
    const groupB = roots[1] as Mesh;
    const material = groupB.materials[0] as BlinnPhongMaterial;
    expect(material.kind).toBe(BlinnPhongMaterialKind);
    expect(material.diffuse).toBe(0xff0000ff);
  });

  it('handles faces before any group or object (top-level geometry)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');

    const scene = createScene3DFromObj(obj);
    // Mesh should be a direct child of scene (no wrapper group).
    const children = getNodeChildren(scene.root);
    expect(children).toHaveLength(1);
    expect(isMesh(children[0] as Node3D)).toBe(true);
  });
});

describe('createScene3DFromObj animations', () => {
  it('carries no animations (OBJ has none)', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    expect(Object.keys(createScene3DFromObj(obj).animations)).toHaveLength(0);
  });
});

describe('obj diagnostic crumb coverage', () => {
  it.each(OBJ_MALFORMED_CASES)(
    'records $kind (reason $reason) as a Drop from parseObj',
    ({ obj, kind, line, reason }) => {
      const diagnostics: ImportDiagnostic[] = [];
      createScene3DFromObj(obj, undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nf 0 1 2\n', undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/9 3/1\n', undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/1 2/x 3/1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.uv-index-invalid');
    expect(crumb.severity).toBe('Recover');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstToken).toBe('x');
    expect(crumb.detail?.count).toBe(1);
  });

  it('records normal-index-invalid (Recover, parseObj) — the vertex still emits without that normal', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//9 3//1\n', undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//x 3//1\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.normal-index-invalid');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstToken).toBe('x');
    expect(crumb.detail?.count).toBe(1);
  });

  it('aggregates repeated malformed lines into ONE crumb with the total count and the first line', () => {
    // Three non-numeric `v` lines — the collector contract requires ONE aggregated crumb (count 3), not three.
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj('v a b c\nv 0 0 0\nv d e f\nv g h i\n', undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/9 2/8 3/7\n', undefined, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\nf 1 2 3\n', library, diagnostics);
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
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\ng A\nf 1 2 3\ng B\nf 1 2 3\n', library, deduped);
    expect(deduped.filter((d) => d.kind === 'obj.material-missing')).toHaveLength(1);

    // No library supplied is the documented intentional path — an unknown usemtl records nothing.
    const noLibrary: ImportDiagnostic[] = [];
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl Absent\nf 1 2 3\n', undefined, noLibrary);
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
    createScene3DFromObj(obj, undefined, diagnostics);
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
    createScene3DFromObj('f\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(1);
    const crumb = expectOneCrumb(diagnostics, 'obj.face-too-few-vertices');
    expect(crumb.severity).toBe('Drop');
    expect(crumb.origin).toBe('parseObj');
    expect(crumb.detail?.firstLine).toBe(1);
    expect(crumb.detail?.count).toBe(1);
  });

  it('no longer crumbs the directives it now models (s, l, p)', () => {
    // obj.directive-unsupported has no trigger left: every directive it named is read for real now.
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\ns 1\nf 1 2 3\nl 1 2\np 3\n', undefined, diagnostics);
    expect(diagnostics.filter((d) => d.kind === 'obj.directive-unsupported')).toHaveLength(0);
  });

  it('no longer crumbs `s` now that smoothing groups are honoured', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\ns 1\nf 1 2 3\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it('records no diagnostics for a well-formed OBJ even with a collector engaged', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene3DFromObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', undefined, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });
});

// (source, kind, severity, origin, detail) → every remaining OBJ diagnostic site, one row per emitting
// variant, complementing the three converted createScene3DFromObj cases above. Each locks the full crumb.
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
    expect(getTestTextureResource(document.resources, first.diffuseMap!)).toBe(document.resources[0]);
    expect(getTestTextureResource(document.resources, second.diffuseMap!)).toBe(document.resources[0]);
  });

  it('uses a -1 material index for an unmaterialed subset', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const document = parseObj(obj);
    expect(document.materials).toHaveLength(0);
    expect(document.meshes[0].materials).toEqual([-1]);
  });
});

describe('parseObj generated normals', () => {
  it('generates normals for an OBJ that declares no vn', () => {
    // The overwhelmingly common plain OBJ: positions and faces only. Left as-is every normal slot is
    // zero, and a zero normal shades black under any lit material — so this is a black-import guard,
    // not a nicety. The triangle lies in the XY plane wound counter-clockwise, so it faces +Z.
    const document = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');

    const normal = { x: 0, y: 0, z: 0 };
    for (let v = 0; v < getMeshGeometryVertexCount(document.meshes[0].geometry); v++) {
      expect(getMeshGeometryVertexNormal(normal, document.meshes[0].geometry, v)).toBe(true);
      expect(normal.x).toBeCloseTo(0, 5);
      expect(normal.y).toBeCloseTo(0, 5);
      expect(normal.z).toBeCloseTo(1, 5);
    }
  });

  it('keeps the file’s own normals when the OBJ declares vn', () => {
    // Generation must not overwrite authored normals — the file's -Z normals survive even though the
    // winding would have generated +Z ones.
    const document = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 -1\nf 1//1 2//1 3//1\n');

    const normal = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(normal, document.meshes[0].geometry, 0);
    expect(normal.z).toBeCloseTo(-1, 5);
  });

  it('generates normals per group when an OBJ with no vn declares several', () => {
    const document = parseObj('g a\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\ng b\nv 0 0 5\nv 1 0 5\nv 0 1 5\nf 4 5 6\n');

    expect(document.meshes).toHaveLength(2);
    const normal = { x: 0, y: 0, z: 0 };
    for (let m = 0; m < 2; m++) {
      getMeshGeometryVertexNormal(normal, document.meshes[m].geometry, 0);
      expect(normal.z).toBeCloseTo(1, 5);
    }
  });
});

function findDiagnostic(diagnostics: readonly ImportDiagnostic[], kind: string): ImportDiagnostic | undefined {
  return diagnostics.find((diagnostic) => diagnostic.kind === kind);
}

describe('parseObj line and point primitives', () => {
  it('imports a polyline as a line-list mesh of connected segments', () => {
    // Three references describe TWO connected segments, not three independent ones.
    const document = parseObj('v 0 0 0\nv 1 0 0\nv 2 0 0\nl 1 2 3\n');

    expect(document.meshes).toHaveLength(1);
    expect(document.meshes[0].geometry.topology).toBe('line-list');
    expect(getMeshGeometryIndexCount(document.meshes[0].geometry)).toBe(4);
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(3);
  });

  it('imports points as a point-list mesh', () => {
    const document = parseObj('v 0 0 0\nv 1 0 0\np 1 2\n');

    expect(document.meshes[0].geometry.topology).toBe('point-list');
    expect(getMeshGeometryIndexCount(document.meshes[0].geometry)).toBe(2);
  });

  it('emits lines as a sibling mesh of the faces in the same group', () => {
    // Topology belongs to the whole geometry, so a group mixing faces and lines cannot be one mesh.
    const document = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\ng Mixed\nf 1 2 3\nl 1 2\n');

    expect(document.meshes).toHaveLength(2);
    const topologies = document.meshes.map((mesh) => mesh.geometry.topology);
    expect(topologies).toContain('triangle-list');
    expect(topologies).toContain('line-list');
    // Both nodes carry the group's authored name — the file really did put both under one group.
    expect(document.nodes.every((node) => node.name === 'Mixed')).toBe(true);
  });

  it('emits a group made only of lines, with no face mesh to hang them off', () => {
    const document = parseObj('v 0 0 0\nv 1 0 0\ng Wire\nl 1 2\n');

    expect(document.meshes).toHaveLength(1);
    expect(document.meshes[0].geometry.topology).toBe('line-list');
    expect(document.scenes[0].rootNodes).toHaveLength(1);
  });

  it('reads only the position component of a reference that carries a uv', () => {
    const document = parseObj('v 0 0 0\nv 1 0 0\nvt 0 0\nvt 1 0\nl 1/1 2/2\n');

    expect(document.meshes[0].geometry.topology).toBe('line-list');
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(2);
  });

  it('resolves negative (relative) references', () => {
    const document = parseObj('v 0 0 0\nv 1 0 0\nl -2 -1\n');

    const position = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(position, document.meshes[0].geometry, 0);
    expect(position.x).toBeCloseTo(0, 5);
  });

  it('drops an out-of-range reference and reports it', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseObj('v 0 0 0\nl 1 9\n', undefined, diagnostics);

    const crumb = findDiagnostic(diagnostics, 'obj.element-index-out-of-range');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
  });

  it('ignores a polyline left with fewer than two resolvable references', () => {
    const document = parseObj('v 0 0 0\nl 1\n');
    expect(document.meshes).toHaveLength(0);
  });
});

describe('parseObj material model selection', () => {
  const OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl M\nf 1 2 3\n';

  function materialFor(mtl: string, diagnostics?: ImportDiagnostic[]): MaterialLike {
    const document = parseObj(OBJ, parseObjMaterialLibrary(mtl), diagnostics);
    expect(document.materials).toHaveLength(1);
    return document.materials[0];
  }

  it('reads a classic MTL as Blinn-Phong, which is the model those directives ARE', () => {
    const material = materialFor('newmtl M\nKd 0.8 0.2 0.1\nKs 1 1 1\nNs 60\n');

    expect(material.kind).toBe(BlinnPhongMaterialKind);
    // The specular exponent transfers as itself — it is NOT converted into a roughness.
    expect((material as BlinnPhongMaterial).shininess).toBe(60);
  });

  it('reads an MTL stating Pr/Pm as metallic-roughness PBR, taking the file’s own values', () => {
    const material = materialFor('newmtl M\nKd 0.8 0.2 0.1\nNs 60\nPr 0.35\nPm 0.9\n');

    expect(material.kind).toBe(StandardPbrMaterialKind);
    const pbr = material as StandardPbrMaterial;
    expect(pbr.roughness).toBeCloseTo(0.35, 6);
    expect(pbr.metallic).toBeCloseTo(0.9, 6);
    // Ns is present but must not have been mapped into roughness — the file stated one directly.
    expect(pbr.roughness).not.toBeCloseTo(getPbrRoughnessFromPhongShininess(60), 3);
  });

  it('does not flip a classic material to PBR just because it states an emissive', () => {
    // Ke names a channel both models could carry, not a shading model. Flipping on it would trade a
    // stated Ns for a guessed roughness, so the material stays Blinn-Phong and the emissive is crumbed.
    const diagnostics: ImportDiagnostic[] = [];
    const material = materialFor('newmtl M\nKd 1 1 1\nNs 32\nKe 1 0.5 0\n', diagnostics);

    expect(material.kind).toBe(BlinnPhongMaterialKind);
    const crumb = findDiagnostic(diagnostics, 'mtl.emissive-dropped');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
    expect(crumb!.detail?.name).toBe('M');
  });

  it('honors the emissive once the file also states a PBR value', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const material = materialFor('newmtl M\nKd 1 1 1\nKe 1 0 0\nPr 0.5\n', diagnostics);

    expect(material.kind).toBe(StandardPbrMaterialKind);
    // Ke 1 0 0 packs to opaque red.
    expect((material as StandardPbrMaterial).emissive).toBe(0xff0000ff);
    expect(findDiagnostic(diagnostics, 'mtl.emissive-dropped')).toBeUndefined();
  });

  it('leaves separate roughness and metallic maps unbound and reports why', () => {
    // MTL states them as two grayscale images; StandardPbrMaterial carries ONE packed texture sampling
    // roughness from G and metallic from B, so binding either alone would drive both terms.
    const diagnostics: ImportDiagnostic[] = [];
    const material = materialFor('newmtl M\nPr 0.5\nmap_Pr rough.png\nmap_Pm metal.png\n', diagnostics);

    expect((material as StandardPbrMaterial).metallicRoughnessMap).toBeNull();
    const crumb = findDiagnostic(diagnostics, 'mtl.metallic-roughness-map-unpacked');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Skip);
  });

  it('flips the model on extension directives without crumbing our own unwired path', () => {
    // The extension directives are themselves PBR evidence, so the model still flips. But sheen and
    // clearcoat going unbound is a gap in THIS PARSER, not in the caller's file, so it is recorded in
    // agents/scene3d-format-coverage.md rather than emitted per import.
    const diagnostics: ImportDiagnostic[] = [];
    const material = materialFor('newmtl M\nPs 0.4\nPc 0.2\nPcr 0.1\naniso 0.3\n', diagnostics);

    expect(material.kind).toBe(StandardPbrMaterialKind);
    expect(findDiagnostic(diagnostics, 'mtl.pbr-extension-unbound')).toBeUndefined();
  });

  it('generates a usable tangent frame when the file has UVs', () => {
    // OBJ has no tangent directive, so every tangent slot arrives zeroed — and a zero tangent
    // collapses the basis a normal-mapped material rebuilds as B = w * cross(N, T). Since `norm`
    // binds a tangent-space normal map, emitting no tangent makes that map unusable. AWD and MD5
    // already derive one when their own files omit the stream; this asserts OBJ does too.
    // The quad is deliberately NOT axis-aligned in UV space — a tangent that came out (0,0,0,0)
    // and one that came out correct would both look "fine" against a trivially aligned fixture.
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'vt 0 0', 'vt 0.9 0.2', 'vt 0.2 0.9', 'f 1/1 2/2 3/3'].join('\n');
    const document = parseObj(obj);
    const geometry = document.meshes[0].geometry;
    const stride = geometry.layout.stride / 4;
    const vertexCount = geometry.vertices.length / stride;
    expect(vertexCount).toBeGreaterThan(0);
    for (let v = 0; v < vertexCount; v++) {
      const base = v * stride + 6;
      const length = Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2]);
      expect(length).toBeCloseTo(1, 4);
      expect(Math.abs(geometry.vertices[base + 3])).toBe(1); // handedness is a sign, never 0
    }
  });

  it('leaves tangents alone for a file with no UVs, having nothing to derive them from', () => {
    const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3'].join('\n');
    const document = parseObj(obj);
    const geometry = document.meshes[0].geometry;
    const stride = geometry.layout.stride / 4;
    const vertexCount = geometry.vertices.length / stride;
    // The WHOLE tangent record, not just x: the degenerate-UV fallback writes a unit perpendicular,
    // and a fallback pointing along y or z would slip past a test that only looked at x.
    for (let v = 0; v < vertexCount; v++) {
      const base = v * stride + 6;
      expect(Math.hypot(geometry.vertices[base], geometry.vertices[base + 1], geometry.vertices[base + 2])).toBe(0);
      expect(geometry.vertices[base + 3]).toBe(0);
    }
  });

  it('does not bind the legacy bump (height) map to normalMap', () => {
    // map_Bump/bump is a grayscale HEIGHT field, not a tangent-space normal map: a shader decoding
    // its RGB as 2*c-1 vectors reads elevation as orientation. It stays unbound until a height-map
    // feature exists to consume it — the same call threeDsParse already makes for MAT_BUMPMAP. The
    // filename is deliberately misleading here, because a file called normal.png declared via `bump`
    // is exactly how this went unnoticed: the directive decides, not the name.
    const diagnostics: ImportDiagnostic[] = [];
    const material = materialFor('newmtl M\nbump normal.png\n', diagnostics) as BlinnPhongMaterial;
    expect(material.normalMap).toBeNull();
    expect(findDiagnostic(diagnostics, 'mtl.bump-height-map-unbound')).toBeDefined();
  });

  it('prefers the dedicated norm map over map_Bump for the normal map', () => {
    // map_Bump is a grayscale HEIGHT field; norm is a real tangent-space normal map. A file with both
    // meant the dedicated one, and sampling a height field as RGB*2-1 vectors renders bogus normals.
    const document = parseObj(OBJ, parseObjMaterialLibrary('newmtl M\nbump height.png\nnorm normal.png\n'));
    const material = document.materials[0] as BlinnPhongMaterial;

    const resource = getTestTextureResource(document.resources, material.normalMap!);
    expect((resource as ExternalImageResourceReference).uri).toBe('normal.png');
  });
});

describe('parseObj opacity map', () => {
  const OBJ = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl M\nf 1 2 3\n';

  it('binds map_d as the alpha map and makes it actually blend', () => {
    // `d` is absent, so the material is nominally opaque — the map alone has to flip the mode, or the
    // authored coverage image lands in a slot the renderer never reads.
    const document = parseObj(OBJ, parseObjMaterialLibrary('newmtl M\nKd 1 1 1\nmap_d mask.png\n'));
    const material = document.materials[0] as BlinnPhongMaterial;

    expect(material.alphaMap).not.toBeNull();
    expect(material.alphaMode).toBe('blend');
    const resource = getTestTextureResource(document.resources, material.alphaMap!);
    expect((resource as ExternalImageResourceReference).uri).toBe('mask.png');
  });

  it('binds map_d on the PBR branch too', () => {
    const document = parseObj(OBJ, parseObjMaterialLibrary('newmtl M\nPr 0.4\nmap_d mask.png\n'));
    const material = document.materials[0] as StandardPbrMaterial;

    expect(material.kind).toBe(StandardPbrMaterialKind);
    expect(material.alphaMap).not.toBeNull();
    expect(material.alphaMode).toBe('blend');
  });

  it('keeps the scalar dissolve alongside the map', () => {
    const document = parseObj(OBJ, parseObjMaterialLibrary('newmtl M\nKd 1 1 1\nd 0.5\nmap_d mask.png\n'));
    const material = document.materials[0] as BlinnPhongMaterial;

    expect(material.alphaMap).not.toBeNull();
    expect(material.diffuse & 0xff).toBe(Math.round(0.5 * 255));
  });
});

describe('parseObj smoothing groups', () => {
  // Two triangles meeting along the shared edge (1,0,0)-(0,1,0) but folded apart, so the two faces have
  // genuinely different normals. Whether the shared vertices merge is exactly what smoothing decides.
  const FOLD = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 1\n';

  function normalAt(source: string, vertex: number): { x: number; y: number; z: number } {
    const document = parseObj(source);
    const normal = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexNormal(normal, document.meshes[0].geometry, vertex);
    return normal;
  }

  it('splits vertices at a smoothing-group boundary so the generated normals stay hard', () => {
    // Different groups → the shared edge's vertices cannot merge → each face keeps its own normal.
    const document = parseObj(`${FOLD}s 1\nf 1 2 3\ns 2\nf 2 4 3\n`);

    // Six corners, no sharing across the boundary, rather than the four a merged pair would give.
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(6);
  });

  it('merges vertices inside one smoothing group so the generated normals average', () => {
    const document = parseObj(`${FOLD}s 1\nf 1 2 3\nf 2 4 3\n`);

    // The two faces share the edge's two vertices: 4 unique corners, not 6.
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(4);
  });

  it('treats `s off` as every face shading flat', () => {
    const document = parseObj(`${FOLD}s off\nf 1 2 3\nf 2 4 3\n`);

    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(6);
  });

  it('treats `s 0` the same as `s off`', () => {
    const document = parseObj(`${FOLD}s 0\nf 1 2 3\nf 2 4 3\n`);

    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(6);
  });

  it('keeps a file that never mentions smoothing merged, as it was before groups were read', () => {
    // The spec's default is off, but reading "unstated" as off would silently turn every existing plain
    // OBJ flat. A file that never says `s` has not opted into the smoothing model at all.
    const document = parseObj(`${FOLD}f 1 2 3\nf 2 4 3\n`);

    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(4);
  });

  it('produces genuinely different normals across a boundary than within a group', () => {
    // The counts above prove the split; this proves the split CHANGES the shading, which is the point.
    const hard = normalAt(`${FOLD}s 1\nf 1 2 3\ns 2\nf 2 4 3\n`, 1);
    const smooth = normalAt(`${FOLD}s 1\nf 1 2 3\nf 2 4 3\n`, 1);

    const differs =
      Math.abs(hard.x - smooth.x) > 1e-4 || Math.abs(hard.y - smooth.y) > 1e-4 || Math.abs(hard.z - smooth.z) > 1e-4;
    expect(differs).toBe(true);
  });

  it('leaves authored normals untouched by smoothing groups', () => {
    // A corner that carries its own `vn` is authoritative; keying it by group would split vertices that
    // should have stayed merged, for no shading benefit.
    const document = parseObj(
      'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 1\nvn 0 0 1\ns 1\nf 1//1 2//1 3//1\ns 2\nf 2//1 4//1 3//1\n',
    );

    // Both faces reference the same authored normal, so all shared corners still merge: 4, not 6.
    expect(getMeshGeometryVertexCount(document.meshes[0].geometry)).toBe(4);
  });
});
