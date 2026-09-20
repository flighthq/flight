import { createKeyedTable } from '@flighthq/registry/contract';
import type { WgpuRenderRegistries } from '@flighthq/types/contract';

export function allocateEmptyWgpuRenderRegistries(): WgpuRenderRegistries {
  const out = {} as WgpuRenderRegistries;
  initializeEmptyWgpuRenderRegistries(out);
  return out;
}

export function initializeEmptyWgpuRenderRegistries(out: WgpuRenderRegistries): void {
  // Written as null rather than omitted: the field's presence is what keeps every registries object
  // one hidden class, so the per-shape reads on the draw path stay monomorphic. The opt-in registrar
  // fills the slot; a pipeline nobody opts in on allocates no table.
  out.compressedTextureDecoder = null;
  out.compressedTextureUpload = null;
  out.gpuSkinning = null;
  out.shapeRasterizer = null;
  out.strokeTessellator = null;

  out.customMaterialShaders = createKeyedTable('WgpuCustomMaterialShader', 'Unregistered');
  out.materialRenderers = createKeyedTable('WgpuMaterialRenderer', 'StandardMaterial');
  out.meshMaterialRenderers = createKeyedTable('WgpuMeshMaterialRenderer', 'StandardMaterial');
  out.modifierSnippets = createKeyedTable('WgpuModifierSnippet', 'Unregistered');
  out.modifierSnippetRevision = 0;
  out.renderEffects = createKeyedTable('WgpuEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.textureResolvers = createKeyedTable('WgpuTextureResolver', 'Unregistered');
  out.velocityWriters = createKeyedTable('WgpuVelocityWriter', 'Unregistered');
}
