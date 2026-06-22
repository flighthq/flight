import type { GlRenderState } from '@flighthq/types';
import { StandardPbrMaterialKind } from '@flighthq/types';

import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { standardPbrGlMeshMaterialRenderer } from './standardPbrGlMeshMaterialRenderer';

// Registers the built-in StandardPbr forward-lit renderer for StandardPbrMaterialKind on this
// state. Convenience over registerGlMeshMaterialRenderer(state, StandardPbrMaterialKind, …); call
// it once per GlRenderState before drawScene so meshes carrying StandardPbrMaterials draw. Opt-in
// by design (no top-level side effect): the render path knows no built-in material until registered.
export function registerStandardPbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, StandardPbrMaterialKind, standardPbrGlMeshMaterialRenderer);
}
