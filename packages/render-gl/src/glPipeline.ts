import { createEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { GlPipeline, GlRenderRegistries } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createEmptyGlRegistries(): GlRenderRegistries {
  return {
    blendRealizations: createKeyedTable('GlBlendRealization', 'Normal'),
    compressedTextureDecoder: createSlotTable('GlCompressedTextureDecoder', 'Unregistered'),
    compressedTextureUpload: createSlotTable('GlCompressedTextureUpload', 'Unregistered'),
    customEffectShaders: createKeyedTable('GlCustomEffectShader', 'Unregistered'),
    customMaterialShaders: createKeyedTable('GlCustomMaterialShader', 'Unregistered'),
    materialRenderers: createKeyedTable('GlMaterialRenderer', 'StandardMaterial'),
    meshMaterialRenderers: createKeyedTable('GlMeshMaterialRenderer', 'StandardMaterial'),
    modifierSnippets: createKeyedTable('GlModifierSnippet', 'Unregistered'),
    modifierSnippetRevision: 0,
    pbrExtensions: createKeyedTable('GlPbrExtension', 'Unregistered'),
    pbrExtensionRevision: 0,
    renderEffects: createKeyedTable('GlRenderEffect', 'Unregistered'),
    renderers: createKeyedTable('NodeRenderer', 'Unregistered'),
    shapeRasterizer: createSlotTable('GlShapeRasterizer', 'Unregistered'),
    strokeTessellator: createSlotTable('StrokeTessellator', 'Rasterize'),
    textureResolvers: createKeyedTable('GlTextureResolver', 'Unregistered'),
    velocityWriters: createKeyedTable('GlVelocityWriter', 'Unregistered'),
  };
}

export function createGlPipeline(registries: Readonly<GlRenderRegistries>): GlPipeline {
  const pipeline = createEntity({ registries }) as GlPipeline;
  pipeline[EntityRuntimeKey] = { binding: null };
  return pipeline;
}

export function getGlPipelineRegistries(pipeline: Readonly<GlPipeline>): Readonly<GlRenderRegistries> {
  return pipeline.registries;
}
