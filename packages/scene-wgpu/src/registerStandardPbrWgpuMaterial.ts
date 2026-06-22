import type { WgpuRenderState } from '@flighthq/types';
import { StandardPbrMaterialKind } from '@flighthq/types';

import { standardPbrWgpuMeshMaterialRenderer } from './standardPbrWgpuMeshMaterialRenderer';
import { registerWgpuMeshMaterialRenderer } from './wgpuMeshMaterialRegistry';

// Registers the built-in StandardPbr forward-lit renderer for StandardPbrMaterialKind on this state.
// Convenience over registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, …); call it once
// per WgpuRenderState before drawScene so meshes carrying StandardPbrMaterials draw. Opt-in by design
// (no top-level side effect): the render path knows no built-in material until registered.
export function registerStandardPbrWgpuMaterial(state: WgpuRenderState): void {
  registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, standardPbrWgpuMeshMaterialRenderer);
}
