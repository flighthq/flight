import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { GlRenderRegistry } from '@flighthq/types/contract';

export function createEmptyGlRenderRegistry(): GlRenderRegistry {
  const out = {} as GlRenderRegistry;
  initializeEmptyGlRenderRegistry(out);
  return out;
}

export function initializeEmptyGlRenderRegistry(out: GlRenderRegistry): void {
  out.blendRealizations = createKeyedTable('GlBlendRealization', 'Normal');
  out.compressedTextureDecoder = createSlotTable('GlCompressedTextureDecoder', 'Unregistered');
  out.compressedTextureUpload = createSlotTable('GlCompressedTextureUpload', 'Unregistered');
  out.customEffectShaders = createKeyedTable('GlCustomEffectShader', 'Unregistered');
  out.customMaterialShaders = createKeyedTable('GlCustomMaterialShader', 'Unregistered');
  out.materialRenderers = createKeyedTable('GlMaterialRenderer', 'StandardMaterial');
  out.meshMaterialRenderers = createKeyedTable('GlMeshMaterialRenderer', 'StandardMaterial');
  out.modifierSnippets = createKeyedTable('GlModifierSnippet', 'Unregistered');
  out.modifierSnippetRevision = 0;
  out.pbrExtensions = createKeyedTable('GlPbrExtension', 'Unregistered');
  out.pbrExtensionRevision = 0;
  out.renderEffects = createKeyedTable('GlRenderEffect', 'Unregistered');
  out.renderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.shapeRasterizer = createSlotTable('GlShapeRasterizer', 'Unregistered');
  out.strokeTessellator = createSlotTable('StrokeTessellator', 'Rasterize');
  out.textureResolvers = createKeyedTable('GlTextureResolver', 'Unregistered');
  out.velocityWriters = createKeyedTable('GlVelocityWriter', 'Unregistered');
}
