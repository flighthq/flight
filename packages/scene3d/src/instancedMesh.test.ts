import { appendTranslationMatrix4, createMatrix4 } from '@flighthq/geometry/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { describe, expect, it } from 'vitest';

import {
  InstancedMeshKind,
  createInstancedMesh,
  getInstancedMeshInstanceColor,
  getInstancedMeshInstanceMatrix,
  invalidateInstancedMesh,
  isInstancedMesh,
  setInstancedMeshInstanceColor,
  setInstancedMeshInstanceCount,
  setInstancedMeshInstanceMatrix,
} from './instancedMesh';

describe('createInstancedMesh', () => {
  it('creates with zero instance count and the given geometry', () => {
    const geometry = createBoxMeshGeometry();
    const mesh = createInstancedMesh(geometry, [null]);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.instanceCount).toBe(0);
    expect(mesh.kind).toBe(InstancedMeshKind);
  });

  it('preallocates the requested capacity', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null], 32);
    expect(mesh.instanceMatrices.length).toBe(32);
  });
});

describe('getInstancedMeshInstanceColor', () => {
  it('returns white when no colors have been set', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 2);
    expect(getInstancedMeshInstanceColor(mesh, 0)).toBe(0xffffffff);
  });

  it('returns the set color after assignment', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 2);
    setInstancedMeshInstanceColor(mesh, 0, 0xff0000ff);
    expect(getInstancedMeshInstanceColor(mesh, 0)).toBe(0xff0000ff);
  });
});

describe('getInstancedMeshInstanceMatrix', () => {
  it('copies the instance matrix into the output', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 1);
    const m = createMatrix4();
    appendTranslationMatrix4(m, m, 10, 20, 30);
    setInstancedMeshInstanceMatrix(mesh, 0, m);

    const out = createMatrix4();
    getInstancedMeshInstanceMatrix(out, mesh, 0);
    expect(out.m[12]).toBe(10);
    expect(out.m[13]).toBe(20);
    expect(out.m[14]).toBe(30);
  });
});

describe('InstancedMeshKind', () => {
  it('is the string InstancedMesh', () => {
    expect(InstancedMeshKind).toBe('InstancedMesh');
  });
});

describe('invalidateInstancedMesh', () => {
  it('bumps the version', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    const v = mesh.version;
    invalidateInstancedMesh(mesh);
    expect(mesh.version).toBe(v + 1);
  });
});

describe('isInstancedMesh', () => {
  it('returns true for an InstancedMesh entity', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    expect(isInstancedMesh(mesh)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isInstancedMesh(null)).toBe(false);
  });
});

describe('setInstancedMeshInstanceColor', () => {
  it('initializes the color array on first use', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 2);
    expect(mesh.instanceColors).toBeNull();
    setInstancedMeshInstanceColor(mesh, 0, 0x00ff00ff);
    expect(mesh.instanceColors).not.toBeNull();
    expect(mesh.instanceColors![0]).toBe(0x00ff00ff);
    expect(mesh.instanceColors![1]).toBe(0xffffffff);
  });
});

describe('setInstancedMeshInstanceCount', () => {
  it('sets the instance count and bumps version', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    const v = mesh.version;
    setInstancedMeshInstanceCount(mesh, 5);
    expect(mesh.instanceCount).toBe(5);
    expect(mesh.version).toBe(v + 1);
  });

  it('grows capacity when count exceeds current', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null], 4);
    setInstancedMeshInstanceCount(mesh, 10);
    expect(mesh.instanceMatrices.length).toBeGreaterThanOrEqual(10);
  });
});

describe('setInstancedMeshInstanceMatrix', () => {
  it('copies the matrix and bumps version', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 1);
    const v = mesh.version;
    const m = createMatrix4();
    appendTranslationMatrix4(m, m, 5, 6, 7);
    setInstancedMeshInstanceMatrix(mesh, 0, m);
    expect(mesh.version).toBe(v + 1);
    expect(mesh.instanceMatrices[0].m[12]).toBe(5);
  });

  it('is a no-op when the index is out of range', () => {
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [null]);
    setInstancedMeshInstanceCount(mesh, 1);
    const v = mesh.version;
    setInstancedMeshInstanceMatrix(mesh, 5, createMatrix4());
    expect(mesh.version).toBe(v);
  });
});
