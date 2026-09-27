import { createTransform3D } from '@flighthq/geometry/contract';
import type { Scene3DDocument, Scene3DDocumentNode } from '@flighthq/types/contract';
import { Node3DKind } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';
import { describe, expect, it } from 'vitest';

import {
  applyColladaBindMaterial,
  applyColladaMaterialOverrides,
  buildColladaNodeWorldMatrices,
  parseColladaBindMaterial,
  resolveColladaPrimitiveSymbols,
} from './colladaSceneShared.ts';

// ★ WHY THESE FIVE ARE SHARED RATHER THAN OWNED BY A FEATURE. Material binding is read by the node walk AND by the
// controller build step, which rewrites the mesh a skinned node points at; world matrices are read by both the
// camera and the light build steps. Each one has two owners, which is the test for a shared primitive — everything
// with ONE owner moved into that owner's module.
describe('applyColladaBindMaterial', () => {
  it('reads the instance bindings and applies them in one step', () => {
    // An UNASSIGNED mesh, so this measures the read-and-apply composition rather than the clone path below. My
    // first fixture put the symbol name in `materials`, which is an index list — it cloned, and the assertion
    // caught the fixture rather than the code.
    const document = documentWithMesh([]);
    const instance = element(
      '<instance_geometry url="#g"><bind_material><technique_common>' +
        '<instance_material symbol="red" target="#m0"/></technique_common></bind_material></instance_geometry>',
    );
    expect(applyColladaBindMaterial(document, 0, instance, ['red'], new Map([['m0', 7]]))).toBe(0);
    expect(document.meshes[0].materials).toEqual([7]);
  });
});

describe('applyColladaMaterialOverrides', () => {
  it('fills an unassigned mesh in place', () => {
    const document = documentWithMesh([]);
    expect(applyColladaMaterialOverrides(document, 0, ['red'], new Map([['red', 3]]))).toBe(0);
    expect(document.meshes[0].materials).toEqual([3]);
    expect(document.meshes).toHaveLength(1);
  });

  it('reuses the mesh when the override matches what it already carries', () => {
    const document = documentWithMesh([3]);
    expect(applyColladaMaterialOverrides(document, 0, ['red'], new Map([['red', 3]]))).toBe(0);
    expect(document.meshes).toHaveLength(1);
  });

  // ★ THE CLONE IS THE WHOLE POINT. Two nodes may instantiate one geometry with DIFFERENT materials, so a second
  // binding cannot overwrite the first — it gets its own mesh entry, and the caller is handed that index.
  it('clones the mesh when a second binding disagrees with the first', () => {
    const document = documentWithMesh([3]);
    const cloneIndex = applyColladaMaterialOverrides(document, 0, ['red'], new Map([['red', 9]]));
    expect(cloneIndex).toBe(1);
    expect(document.meshes).toHaveLength(2);
    expect(document.meshes[0].materials).toEqual([3]);
    expect(document.meshes[1].materials).toEqual([9]);
    expect(document.meshes[1].geometry).toBe(document.meshes[0].geometry);
  });

  it('leaves the mesh alone when nothing resolves', () => {
    const document = documentWithMesh([3]);
    expect(applyColladaMaterialOverrides(document, 0, ['blue'], new Map([['red', 9]]))).toBe(0);
    expect(document.meshes).toHaveLength(1);
  });
});

describe('buildColladaNodeWorldMatrices', () => {
  // A child's world matrix is its parent's composed with its own, which is why a camera or light seated on a
  // nested node lands in the right place. Indexed BY NODE INDEX, with holes for nodes outside the scene.
  it('composes a child transform through its parent and leaves unreached nodes undefined', () => {
    const parent = node({ x: 10, y: 0, z: 0 }, [1]);
    const childNode = node({ x: 0, y: 5, z: 0 }, []);
    const orphan = node({ x: 0, y: 0, z: 0 }, []);
    const matrices = buildColladaNodeWorldMatrices([parent, childNode, orphan], [0]);
    expect(matrices[0]!.m[12]).toBe(10);
    expect(matrices[1]!.m[12]).toBe(10);
    expect(matrices[1]!.m[13]).toBe(5);
    expect(matrices[2]).toBeUndefined();
  });
});

describe('parseColladaBindMaterial', () => {
  it('maps each bound symbol to the material index its target names', () => {
    const instance = element(
      '<instance_geometry><bind_material><technique_common>' +
        '<instance_material symbol="red" target="#m0"/><instance_material symbol="blue" target="#m1"/>' +
        '</technique_common></bind_material></instance_geometry>',
    );
    expect([
      ...parseColladaBindMaterial(
        instance,
        new Map([
          ['m0', 0],
          ['m1', 4],
        ]),
      ),
    ]).toEqual([
      ['red', 0],
      ['blue', 4],
    ]);
  });

  it('answers an empty map with no bind_material, no technique, or an unknown target', () => {
    expect(parseColladaBindMaterial(element('<instance_geometry/>'), new Map()).size).toBe(0);
    expect(
      parseColladaBindMaterial(element('<instance_geometry><bind_material/></instance_geometry>'), new Map()).size,
    ).toBe(0);
    const unknown = element(
      '<instance_geometry><bind_material><technique_common>' +
        '<instance_material symbol="red" target="#nope"/></technique_common></bind_material></instance_geometry>',
    );
    expect(parseColladaBindMaterial(unknown, new Map([['m0', 0]])).size).toBe(0);
  });
});

describe('resolveColladaPrimitiveSymbols', () => {
  it('maps primitive symbols to indices in primitive order, dropping unbound ones', () => {
    expect(
      resolveColladaPrimitiveSymbols(
        ['a', 'x', 'b'],
        new Map([
          ['a', 1],
          ['b', 2],
        ]),
      ),
    ).toEqual([1, 2]);
  });

  it('answers nothing when the mesh names no symbols or nothing is bound', () => {
    expect(resolveColladaPrimitiveSymbols(undefined, new Map([['a', 1]]))).toEqual([]);
    expect(resolveColladaPrimitiveSymbols(['a'], new Map())).toEqual([]);
  });
});

function documentWithMesh(materials: number[]): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [{ geometry: {} as never, materials, name: undefined, skin: undefined }],
    metadata: { copyright: null, generator: null, version: null },
    nodes: [],
    resources: [],
    scenes: [],
    skeletons: [],
  } as unknown as Scene3DDocument;
}

function element(xml: string) {
  return parseXmlDocument(xml)!;
}

function node(position: { x: number; y: number; z: number }, children: number[]): Scene3DDocumentNode {
  const transform = createTransform3D();
  transform.position.x = position.x;
  transform.position.y = position.y;
  transform.position.z = position.z;
  return { children, kind: Node3DKind, name: undefined, transform } as unknown as Scene3DDocumentNode;
}
