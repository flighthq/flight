import { registerWgpuImageTextureResolver } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState } from '@flighthq/types/contract';
import { StandardPbrMaterialKind } from '@flighthq/types/contract';

import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';

// Registers the built-in StandardPbr forward-lit renderer for StandardPbrMaterialKind on this state.
// Convenience over registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, …); call it once
// per WgpuRenderState before drawScene3D so meshes carrying StandardPbrMaterials draw. Opt-in by design
// (no top-level side effect): the render path knows no built-in material until registered.
export function registerStandardPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuImageTextureResolver(state);
  registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, standardPbrWgpuMeshMaterialRenderer);
}
