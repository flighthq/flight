import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import {
  addNodeChild,
  getNodeChildCount,
  getNodeLocalMatrix4,
  getNodeWorldMatrix4,
  invalidateNodeLocalTransform,
} from '@flighthq/node';
import type { MeshMorph, Skin } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  cloneMesh,
  createMesh,
  enableMeshSignals,
  getMeshDeformer,
  getMeshRuntime,
  getMeshSignals,
  isMesh,
  MeshKind,
} from './mesh';
import { createSceneNode } from './sceneNode';

describe('cloneMesh', () => {
  it('shares the geometry by reference', () => {
    const geometry = createBoxMeshGeometry();
    const source = createMesh(geometry, [createStandardPbrMaterial()]);
    expect(cloneMesh(source).geometry).toBe(geometry);
  });

  it('copies the materials array but shares its entries', () => {
    const material = createStandardPbrMaterial();
    const source = createMesh(createBoxMeshGeometry(), [material]);
    const clone = cloneMesh(source);
    expect(clone.materials).not.toBe(source.materials);
    expect(clone.materials[0]).toBe(material);
  });

  it('copies the transform into a distinct matrix', () => {
    const source = createMesh(createBoxMeshGeometry(), []);
    source.translation.x = 5;
    source.translation.y = -2;
    const clone = cloneMesh(source);
    expect(clone.translation).not.toBe(source.translation);
    expect(getNodeLocalMatrix4(clone).m[12]).toBe(5);
    expect(getNodeLocalMatrix4(clone).m[13]).toBe(-2);
  });

  it('copies alpha, enabled, name, and kind', () => {
    const source = createMesh(createBoxMeshGeometry(), [], 'Custom', { enabled: false, name: 'hero' });
    source.alpha = 0.25;
    const clone = cloneMesh(source);
    expect(clone.alpha).toBe(0.25);
    expect(clone.enabled).toBe(false);
    expect(clone.name).toBe('hero');
    expect(clone.kind).toBe('Custom');
  });

  it('shares the skin by reference when present', () => {
    const skin = {} as Skin;
    const source = createMesh(createBoxMeshGeometry(), []);
    source.skin = skin;
    expect(cloneMesh(source).skin).toBe(skin);
  });

  it('shares the morph by reference when present', () => {
    const morph: MeshMorph = { targets: [], weights: new Float32Array(0) };
    const source = createMesh(createBoxMeshGeometry(), []);
    source.morph = morph;
    expect(cloneMesh(source).morph).toBe(morph);
  });

  it('does not copy children', () => {
    const source = createMesh(createBoxMeshGeometry(), []);
    addNodeChild(source, createMesh(createBoxMeshGeometry(), []));
    expect(getNodeChildCount(cloneMesh(source))).toBe(0);
  });
});

describe('createMesh', () => {
  it('uses MeshKind by default', () => {
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    expect(mesh.kind).toBe(MeshKind);
  });

  it('accepts a custom kind', () => {
    const MyKind = 'MyKind';
    const mesh = createMesh(createBoxMeshGeometry(), [], MyKind);
    expect(mesh.kind).toBe(MyKind);
  });

  it('stores the geometry by reference', () => {
    const geometry = createBoxMeshGeometry();
    const mesh = createMesh(geometry, [createStandardPbrMaterial()]);
    expect(mesh.geometry).toBe(geometry);
  });

  it('stores the materials array by reference', () => {
    const materials = [createStandardPbrMaterial()];
    const mesh = createMesh(createBoxMeshGeometry(), materials);
    expect(mesh.materials).toBe(materials);
  });

  it('accepts a null material slot', () => {
    const mesh = createMesh(createBoxMeshGeometry(), [null]);
    expect(mesh.materials[0]).toBeNull();
  });

  it('defaults enabled to true and name to null', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    expect(mesh.enabled).toBe(true);
    expect(mesh.name).toBe(null);
  });

  it('accepts partial initial values', () => {
    const mesh = createMesh(createBoxMeshGeometry(), [], MeshKind, { enabled: false, name: 'crate' });
    expect(mesh.enabled).toBe(false);
    expect(mesh.name).toBe('crate');
  });

  it('starts with an identity localMatrix', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    expect(getNodeLocalMatrix4(mesh).m[0]).toBe(1);
    expect(getNodeLocalMatrix4(mesh).m[5]).toBe(1);
    expect(getNodeLocalMatrix4(mesh).m[10]).toBe(1);
    expect(getNodeLocalMatrix4(mesh).m[15]).toBe(1);
  });

  it('participates in the SceneNode hierarchy and world transform', () => {
    const parent = createMesh(createBoxMeshGeometry(), []);
    const child = createMesh(createBoxMeshGeometry(), []);
    addNodeChild(parent, child);
    parent.translation.x = 4;
    invalidateNodeLocalTransform(parent);
    child.translation.x = 3;
    invalidateNodeLocalTransform(child);
    expect(getNodeChildCount(parent)).toBe(1);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(7);
  });
});

describe('enableMeshSignals', () => {
  it('creates and returns the signal bag on first call', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const signals = enableMeshSignals(mesh);
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    expect(enableMeshSignals(mesh)).toBe(enableMeshSignals(mesh));
  });
});

describe('getMeshDeformer', () => {
  it('reports none for a rigid mesh', () => {
    expect(getMeshDeformer(createMesh(createBoxMeshGeometry(), []))).toBe('none');
  });

  it('reports skeletal when the mesh carries a skin', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    mesh.skin = {} as Skin;
    expect(getMeshDeformer(mesh)).toBe('skeletal');
  });

  it('reports morph when the mesh carries a morph set', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    mesh.morph = { targets: [], weights: new Float32Array(0) };
    expect(getMeshDeformer(mesh)).toBe('morph');
  });

  it('reports skeletal for the composed skin+morph case (skin is the outer deform)', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    mesh.skin = {} as Skin;
    mesh.morph = { targets: [], weights: new Float32Array(0) };
    expect(getMeshDeformer(mesh)).toBe('skeletal');
  });
});

describe('getMeshRuntime', () => {
  it('returns a runtime with the expected initial state', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const runtime = getMeshRuntime(mesh);
    expect(runtime.children).toBeNull();
    expect(runtime.parent).toBeNull();
    expect(runtime.worldMatrix4).toBeNull();
  });
});

describe('getMeshSignals', () => {
  it('returns null before signals are enabled', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    expect(getMeshSignals(mesh)).toBeNull();
  });

  it('returns the runtime nodeSignals after enableMeshSignals', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    const signals = enableMeshSignals(mesh);
    expect(getMeshSignals(mesh)).toBe(signals);
    expect(getMeshSignals(mesh)).toBe(getMeshRuntime(mesh).nodeSignals);
  });
});

describe('isMesh', () => {
  it('is true for a node created by createMesh', () => {
    const mesh = createMesh(createBoxMeshGeometry(), []);
    expect(isMesh(mesh)).toBe(true);
  });

  it('is false for a bare SceneNode group', () => {
    expect(isMesh(createSceneNode())).toBe(false);
  });
});
