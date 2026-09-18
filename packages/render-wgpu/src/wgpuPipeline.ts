import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { WgpuRenderRegistries } from '@flighthq/types/contract';

export function createEmptyWgpuRenderRegistries(): WgpuRenderRegistries {
  const out = {} as WgpuRenderRegistries;
  initializeEmptyWgpuRenderRegistries(out);
  return out;
}

export function initializeEmptyWgpuRenderRegistries(out: WgpuRenderRegistries): void {
  out.compressedTextureDecoder = createSlotTable('WgpuCompressedTextureDecoder', 'Unregistered');
  out.compressedTextureUpload = createSlotTable('WgpuCompressedTextureUpload', 'Unregistered');
  out.customMaterialShaders = createKeyedTable('WgpuCustomMaterialShader', 'Unregistered');
  out.gpuSkinning = createSlotTable('WgpuGpuSkinning', 'Unregistered');
  out.materialRenderers = createKeyedTable('WgpuMaterialRenderer', 'StandardMaterial');
  out.meshMaterialRenderers = createKeyedTable('WgpuMeshMaterialRenderer', 'StandardMaterial');
  out.modifierSnippets = createKeyedTable('WgpuModifierSnippet', 'Unregistered');
  out.modifierSnippetRevision = 0;
  out.renderEffects = createKeyedTable('WgpuRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.shapeRasterizer = createSlotTable('WgpuShapeRasterizer', 'Unregistered');
  out.strokeTessellator = createSlotTable('StrokeTessellator', 'Rasterize');
  out.textureResolvers = createKeyedTable('WgpuTextureResolver', 'Unregistered');
  out.velocityWriters = createKeyedTable('WgpuVelocityWriter', 'Unregistered');
}
