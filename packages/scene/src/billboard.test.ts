import { createStandardPbrMaterial } from '@flighthq/materials';
import { createPlaneMeshGeometry } from '@flighthq/mesh';
import { describe, expect, it } from 'vitest';

import {
  BillboardKind,
  createBillboard,
  enableBillboardSignals,
  getBillboardRuntime,
  getBillboardSignals,
  isBillboard,
} from './billboard';
import { createMesh } from './mesh';
import { createSceneNode } from './sceneNode';

describe('createBillboard', () => {
  it('uses BillboardKind and full facing by default', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [createStandardPbrMaterial()]);
    expect(billboard.kind).toBe(BillboardKind);
    expect(billboard.mode).toBe('full');
  });

  it('stores geometry and materials by reference', () => {
    const geometry = createPlaneMeshGeometry();
    const material = createStandardPbrMaterial();
    const billboard = createBillboard(geometry, [material]);
    expect(billboard.geometry).toBe(geometry);
    expect(billboard.materials[0]).toBe(material);
  });

  it('accepts an explicit facing mode', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'axisY');
    expect(billboard.mode).toBe('axisY');
  });

  it('accepts a custom kind', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null], 'screenAligned', 'acme.Billboard');
    expect(billboard.kind).toBe('acme.Billboard');
    expect(isBillboard(billboard)).toBe(true);
  });
});

describe('enableBillboardSignals', () => {
  it('returns the node signal group', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null]);
    expect(enableBillboardSignals(billboard)).not.toBeNull();
    expect(getBillboardSignals(billboard)).not.toBeNull();
  });
});

describe('getBillboardRuntime', () => {
  it('returns the scene-node runtime with a world-matrix slot', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null]);
    const runtime = getBillboardRuntime(billboard);
    expect(runtime).toBe(getBillboardRuntime(billboard));
    expect(runtime.worldMatrix).toBeNull();
  });
});

describe('getBillboardSignals', () => {
  it('returns null before signals are enabled', () => {
    const billboard = createBillboard(createPlaneMeshGeometry(), [null]);
    expect(getBillboardSignals(billboard)).toBeNull();
  });
});

describe('isBillboard', () => {
  it('is true for a billboard', () => {
    expect(isBillboard(createBillboard(createPlaneMeshGeometry(), [null]))).toBe(true);
  });

  it('is false for a plain mesh (geometry but no mode)', () => {
    expect(isBillboard(createMesh(createPlaneMeshGeometry(), [null]))).toBe(false);
  });

  it('is false for a transform-only scene node', () => {
    expect(isBillboard(createSceneNode())).toBe(false);
  });
});
