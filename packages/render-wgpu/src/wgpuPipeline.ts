import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { WgpuRenderRegistry } from '@flighthq/types/contract';

export function createEmptyWgpuRenderRegistry(): WgpuRenderRegistry {
  const out = {} as WgpuRenderRegistry;
  initializeEmptyWgpuRenderRegistry(out);
  return out;
}

export function initializeEmptyWgpuRenderRegistry(out: WgpuRenderRegistry): void {
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
