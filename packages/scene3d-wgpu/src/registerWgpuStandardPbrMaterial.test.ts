import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { registerWgpuStandardPbrMaterial } from './registerWgpuStandardPbrMaterial';
import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

describe('registerWgpuStandardPbrMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerWgpuStandardPbrMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(standardPbrWgpuMeshMaterialRenderer);
  });
});
