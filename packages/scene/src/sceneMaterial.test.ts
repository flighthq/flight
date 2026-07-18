import { createBlinnPhongMaterial, createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { describe, expect, it } from 'vitest';

import { createMesh } from './mesh';
import { createScene } from './scene';
import { findSceneMaterialByName } from './sceneMaterial';

describe('findSceneMaterialByName', () => {
  it('finds a named material on a descendant mesh', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));
    expect(findSceneMaterialByName(scene, 'canopy')).toBe(material);
  });

  it('returns null when no material carries the name', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));
    expect(findSceneMaterialByName(scene, 'fuselage')).toBeNull();
  });

  it('ignores anonymous materials (null name)', () => {
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createBlinnPhongMaterial()]));
    expect(findSceneMaterialByName(scene, 'canopy')).toBeNull();
  });

  it('searches nested descendants depth-first', () => {
    const material = createStandardPbrMaterial();
    material.name = 'deep';
    const scene = createScene();
    const group = createScene();
    addNodeChild(scene, group);
    addNodeChild(group, createMesh(createBoxMeshGeometry(), [material]));
    expect(findSceneMaterialByName(scene, 'deep')).toBe(material);
  });

  it('includes the root node itself', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'root-mat';
    const rootMesh = createMesh(createBoxMeshGeometry(), [material]);
    expect(findSceneMaterialByName(rootMesh, 'root-mat')).toBe(material);
  });

  it('returns the first match in pre-order across meshes', () => {
    const first = createBlinnPhongMaterial();
    first.name = 'shared';
    const second = createBlinnPhongMaterial();
    second.name = 'shared';
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [first]));
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [second]));
    expect(findSceneMaterialByName(scene, 'shared')).toBe(first);
  });

  it('skips null material slots without matching', () => {
    const material = createBlinnPhongMaterial();
    material.name = 'canopy';
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [null, material]));
    expect(findSceneMaterialByName(scene, 'canopy')).toBe(material);
  });
});
