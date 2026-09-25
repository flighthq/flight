import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { registerWgpuStandardPbrMaterial } from './registerWgpuStandardPbrMaterial.ts';
import { getWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry.ts';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper.ts';
import { wgpuStandardPbrMeshMaterialRenderer } from './wgpuStandardPbrMeshMaterialRenderer.ts';

describe('registerWgpuStandardPbrMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeWgpuScene3DState();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerWgpuStandardPbrMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(wgpuStandardPbrMeshMaterialRenderer);
  });
});
