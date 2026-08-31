import { createEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { WgpuPipeline, WgpuRenderRegistries } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createEmptyWgpuRegistries(): WgpuRenderRegistries {
  return {
    compressedTextureDecoder: createSlotTable('WgpuCompressedTextureDecoder', 'Unregistered'),
    compressedTextureUpload: createSlotTable('WgpuCompressedTextureUpload', 'Unregistered'),
    customMaterialShaders: createKeyedTable('WgpuCustomMaterialShader', 'Unregistered'),
    materialRenderers: createKeyedTable('WgpuMaterialRenderer', 'StandardMaterial'),
    meshMaterialRenderers: createKeyedTable('WgpuMeshMaterialRenderer', 'StandardMaterial'),
    modifierSnippets: createKeyedTable('WgpuModifierSnippet', 'Unregistered'),
    modifierSnippetRevision: 0,
    renderEffects: createKeyedTable('WgpuRenderEffect', 'Unregistered'),
    renderers: createKeyedTable('NodeRenderer', 'Unregistered'),
    shapeRasterizer: createSlotTable('WgpuShapeRasterizer', 'Unregistered'),
    strokeTessellator: createSlotTable('StrokeTessellator', 'Rasterize'),
    textureResolvers: createKeyedTable('WgpuTextureResolver', 'Unregistered'),
    velocityWriters: createKeyedTable('WgpuVelocityWriter', 'Unregistered'),
  };
}

export function createWgpuPipeline(registries: Readonly<WgpuRenderRegistries>): WgpuPipeline {
  const pipeline = createEntity({ registries }) as WgpuPipeline;
  pipeline[EntityRuntimeKey] = { binding: null, uid: null };
  return pipeline;
}

export function getWgpuPipelineRegistries(pipeline: Readonly<WgpuPipeline>): Readonly<WgpuRenderRegistries> {
  return pipeline.registries;
}
