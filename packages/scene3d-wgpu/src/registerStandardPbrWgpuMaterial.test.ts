import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { registerStandardPbrWgpuMaterial } from './registerStandardPbrWgpuMaterial';
import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('registerStandardPbrWgpuMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerStandardPbrWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(standardPbrWgpuMeshMaterialRenderer);
  });
});
