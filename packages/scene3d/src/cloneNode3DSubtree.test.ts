import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild, getNodeChildCount, getNodeChildren } from '@flighthq/node/contract';
import type { Material } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { cloneNode3DSubtree } from './cloneNode3DSubtree';
import { createMesh, isMesh } from './mesh';
import { createNode3D } from './sceneNode';

describe('cloneNode3DSubtree', () => {
  it('clones a plain Node3D', () => {
    const source = createNode3D(undefined, { name: 'root' });
    const clone = cloneNode3DSubtree(source);
    expect(clone).not.toBe(source);
    expect(clone.name).toBe('root');
  });

  it('clones a Mesh leaf', () => {
    const geometry = createBoxMeshGeometry();
    const material = createStandardPbrMaterial();
    const source = createMesh(geometry, [material]);
    source.name = 'box';
    const clone = cloneNode3DSubtree(source);
    expect(isMesh(clone)).toBe(true);
    expect(clone.name).toBe('box');
    if (isMesh(clone)) {
      expect(clone.geometry).toBe(geometry);
    }
  });

  it('clones children recursively', () => {
    const root = createNode3D(undefined, { name: 'root' });
    const childA = createNode3D(undefined, { name: 'a' });
    const childB = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    childB.name = 'b';
    addNodeChild(root, childA);
    addNodeChild(root, childB);
    addNodeChild(childA, createNode3D(undefined, { name: 'grandchild' }));

    const clone = cloneNode3DSubtree(root);
    expect(clone).not.toBe(root);
    expect(getNodeChildCount(clone)).toBe(2);
    const clonedChildren = getNodeChildren(clone);
    expect(clonedChildren[0]?.name).toBe('a');
    expect(clonedChildren[1]?.name).toBe('b');
    expect(isMesh(clonedChildren[1]!)).toBe(true);
    expect(getNodeChildCount(clonedChildren[0]!)).toBe(1);
    expect(getNodeChildren(clonedChildren[0]!)[0]?.name).toBe('grandchild');
  });

  it('applies materialOverride to Mesh nodes', () => {
    const original = createStandardPbrMaterial();
    const replacement = createStandardPbrMaterial({ baseColor: 0xff0000ff });
    const source = createMesh(createBoxMeshGeometry(), [original]);
    const clone = cloneNode3DSubtree(source, () => replacement);
    if (isMesh(clone)) {
      expect(clone.materials[0]).toBe(replacement);
    }
  });

  it('passes each source material to the override callback', () => {
    const matA = createStandardPbrMaterial({ baseColor: 0xaaaaaa00 });
    const matB = createStandardPbrMaterial({ baseColor: 0xbbbbbb00 });
    const seen: (Material | null)[] = [];
    const source = createMesh(createBoxMeshGeometry(), [matA, matB]);
    cloneNode3DSubtree(source, (m) => {
      seen.push(m);
      return m;
    });
    expect(seen).toEqual([matA, matB]);
  });

  it('copies transform from source', () => {
    const source = createNode3D(undefined, { name: 'moved' });
    source.position.x = 5;
    source.position.y = 10;
    source.position.z = 15;
    const clone = cloneNode3DSubtree(source);
    expect(clone.position.x).toBe(5);
    expect(clone.position.y).toBe(10);
    expect(clone.position.z).toBe(15);
  });

  it('preserves alpha and visibility', () => {
    const source = createNode3D(undefined, { alpha: 0.5, visible: false });
    const clone = cloneNode3DSubtree(source);
    expect(clone.alpha).toBe(0.5);
    expect(clone.visible).toBe(false);
  });
});
