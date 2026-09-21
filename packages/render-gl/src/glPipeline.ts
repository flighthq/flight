import { createKeyedTable } from '@flighthq/registry/contract';
import type { GlRenderRegistries } from '@flighthq/types/contract';

export function allocateEmptyGlRenderRegistries(): GlRenderRegistries {
  const out = {} as GlRenderRegistries;
  initializeEmptyGlRenderRegistries(out);
  return out;
}

export function initializeEmptyGlRenderRegistries(out: GlRenderRegistries): void {
  // Written as null rather than omitted: the field's presence is what keeps every registries object
  // one hidden class, so the per-shape reads on the draw path stay monomorphic. The opt-in registrar
  // fills the slot; a pipeline nobody opts in on allocates no table.
  out.compressedTextureDecoder = null;
  out.compressedTextureUpload = null;
  out.shapeRasterizer = null;
  out.strokeTessellator = null;

  out.blendRealizations = createKeyedTable('GlBlendRealization', 'Normal');
  out.customEffectShaders = createKeyedTable('GlCustomEffectShader', 'Unregistered');
  out.customMaterialShaders = createKeyedTable('GlCustomMaterialShader', 'Unregistered');
  out.materialRenderers = createKeyedTable('GlQuadMaterialRenderer', 'StandardMaterial');
  out.meshMaterialRenderers = createKeyedTable('GlMeshMaterialRenderer', 'StandardMaterial');
  out.modifierSnippets = createKeyedTable('GlModifierSnippet', 'Unregistered');
  out.modifierSnippetRevision = 0;
  out.pbrExtensions = createKeyedTable('GlPbrExtension', 'Unregistered');
  out.pbrExtensionRevision = 0;
  out.effects = createKeyedTable('GlEffect', 'Unregistered');
  out.nodeRenderers = createKeyedTable('NodeRenderer', 'Unregistered');
  out.textureResolvers = createKeyedTable('GlTextureResolver', 'Unregistered');
  out.velocityWriters = createKeyedTable('GlVelocityWriter', 'Unregistered');
}
