import { createBlinnPhongMaterial, createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Material } from '@flighthq/types';
import { Node3DKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { findScene3DMaterialByName, getScene3DMaterials } from './sceneMaterial';
import { createNode3D } from './sceneNode';

describe('findScene3DMaterialByName', () => {
  it('finds a named material on a descendant mesh', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));
    expect(findScene3DMaterialByName(scene, 'canopy')).toBe(material);
  });

  it('returns null when no material carries the name', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));
    expect(findScene3DMaterialByName(scene, 'fuselage')).toBeNull();
  });

  it('ignores anonymous materials (null name)', () => {
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial()]));
    expect(findScene3DMaterialByName(scene, 'canopy')).toBeNull();
  });

  it('searches nested descendants depth-first', () => {
    const material = createStandardPbrMaterial();
    material.name = 'deep';
    const scene = createNode3D(Node3DKind);
    const group = createNode3D(Node3DKind);
    addNodeChild(scene, group);
    addNodeChild(group, createMesh(createBoxMeshGeometry(), [material]));
    expect(findScene3DMaterialByName(scene, 'deep')).toBe(material);
  });

  it('includes the root node itself', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'root-mat';
    const rootMesh = createMesh(createBoxMeshGeometry(), [material]);
    expect(findScene3DMaterialByName(rootMesh, 'root-mat')).toBe(material);
  });

  it('returns the first match in pre-order across meshes', () => {
    const first = createBlinnPhongMaterial();
    first.name = 'shared';
    const second = createBlinnPhongMaterial();
    second.name = 'shared';
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [first]));
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [second]));
    expect(findScene3DMaterialByName(scene, 'shared')).toBe(first);
  });

  it('skips null material slots without matching', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [null, material]));
    expect(findScene3DMaterialByName(scene, 'canopy')).toBe(material);
  });
});

describe('getScene3DMaterials', () => {
  it('collects every distinct material across the scene, root included, deduped by reference', () => {
    const shared = createBlinnPhongMaterial();
    const other = createStandardPbrMaterial();
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [shared]));
    const group = createNode3D(Node3DKind);
    addNodeChild(group, createMesh(createBoxMeshGeometry(), [shared, other])); // shared reused
    addNodeChild(scene, group);
    const out: Material[] = [];
    getScene3DMaterials(scene, out);
    expect(out).toContain(shared);
    expect(out).toContain(other);
    expect(out).toHaveLength(2); // shared appears once
  });

  it('skips null material slots and collects nothing for a mesh-free scene', () => {
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [null]));
    const out: Material[] = [];
    getScene3DMaterials(scene, out);
    expect(out).toHaveLength(0);
  });
});
