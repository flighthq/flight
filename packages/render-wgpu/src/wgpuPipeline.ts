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

  out.customMaterialShaders = new Map();
  out.materialRenderers = new Map();
  out.modifierSnippets = new Map();
  out.modifierSnippetRevision = 0;
  out.effects = new Map();
  out.nodeRenderers = new Map();
  out.passes = null;
  out.textureResolvers = new Map();
  out.velocityWriters = new Map();
}
