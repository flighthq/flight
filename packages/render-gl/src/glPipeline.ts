import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createKeyedTable, createSlotTable } from '@flighthq/registry/contract';
import type { GlPipeline, GlRenderRegistries, EntityConstruction } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

export function createEmptyGlRegistries(): GlRenderRegistries {
  const out = allocateEntity<GlRenderRegistries>();
  initializeEmptyGlRegistries(out);
  return finishEntity(out);
}

export function createGlPipeline(registries: Readonly<GlRenderRegistries>): GlPipeline {
  const pipeline = allocateEntity<GlPipeline>();
  pipeline.registries = registries;
  pipeline[EntityRuntimeKey] = { binding: null };
  return pipeline;
}

export function getGlPipelineRegistries(pipeline: Readonly<GlPipeline>): Readonly<GlRenderRegistries> {
  return pipeline.registries;
}

export function initializeEmptyGlRegistries(out: EntityConstruction<GlRenderRegistries>): void {
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
