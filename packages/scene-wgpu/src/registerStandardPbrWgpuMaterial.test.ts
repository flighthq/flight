import { StandardPbrMaterialKind } from '@flighthq/types';

import { registerStandardPbrWgpuMaterial } from './registerStandardPbrWgpuMaterial';
import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuMeshMaterialRenderer } from './webgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './webgpuSceneTestHelper';

describe('registerStandardPbrWgpuMaterial', () => {
  it('registers the StandardPbr renderer for StandardPbrMaterialKind', () => {
    const { state } = makeWgpuSceneState();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerStandardPbrWgpuMaterial(state);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(standardPbrWgpuMeshMaterialRenderer);
  });
});
