import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { WgpuPipeline, WgpuRenderRegistries, EntityConstruction } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createEmptyWgpuRegistries(): WgpuRenderRegistries {
  const out = allocateEntity<WgpuRenderRegistries>();
  initializeEmptyWgpuRegistries(out);
  return finishEntity(out);
}

export function createWgpuPipeline(registries: Readonly<WgpuRenderRegistries>): WgpuPipeline {
  const pipeline = allocateEntity<WgpuPipeline>();
  pipeline.registries = registries;
  pipeline[EntityRuntimeKey] = { binding: null };
  return pipeline;
}

export function getWgpuPipelineRegistries(pipeline: Readonly<WgpuPipeline>): Readonly<WgpuRenderRegistries> {
  return pipeline.registries;
}

export function initializeEmptyWgpuRegistries(out: EntityConstruction<WgpuRenderRegistries>): void {
  out.compressedTextureDecoder = createSlotTable('WgpuCompressedTextureDecoder', 'Unregistered');
  out.compressedTextureUpload = createSlotTable('WgpuCompressedTextureUpload', 'Unregistered');
  out.customMaterialShaders = createKeyedTable('WgpuCustomMaterialShader', 'Unregistered');
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
