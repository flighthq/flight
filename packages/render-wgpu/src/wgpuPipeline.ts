import { createKeyedTable } from '@flighthq/registry/contract';
import type { WgpuRenderRegistries } from '@flighthq/types/contract';

export function allocateEmptyWgpuRenderRegistries(): WgpuRenderRegistries {
  const out = {} as WgpuRenderRegistries;
  initializeEmptyWgpuRenderRegistries(out);
  return out;
}

export function initializeEmptyWgpuRenderRegistries(out: WgpuRenderRegistries): void {
  out.customMaterialShaders = createKeyedTable('WgpuCustomMaterialShader', 'Unregistered');
  out.materialRenderers = createKeyedTable('WgpuMaterialRenderer', 'StandardMaterial');
  out.meshMaterialRenderers = createKeyedTable('WgpuMeshMaterialRenderer', 'StandardMaterial');
  out.modifierSnippets = createKeyedTable('WgpuModifierSnippet', 'Unregistered');
  out.modifierSnippetRevision = 0;
  out.renderEffects = createKeyedTable('WgpuRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.textureResolvers = createKeyedTable('WgpuTextureResolver', 'Unregistered');
  out.velocityWriters = createKeyedTable('WgpuVelocityWriter', 'Unregistered');
}
