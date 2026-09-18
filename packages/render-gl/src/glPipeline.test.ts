import { withRegistryTableEntry } from '@flighthq/registry/contract';
import type { Renderer } from '@flighthq/types/contract';

import {
  createEmptyGlRegistries,
  createGlPipeline,
  getGlPipelineRegistries,
  initializeEmptyGlRegistries,
} from './glPipeline';

describe('createEmptyGlRegistries', () => {
  it('creates a complete GlRenderRegistries with all required tables', () => {
    const registries = createEmptyGlRegistries();
    expect(registries.renderers.shape).toBe('keyed');
    expect(registries.blendRealizations.shape).toBe('keyed');
    expect(registries.compressedTextureDecoder.shape).toBe('slot');
    expect(registries.compressedTextureUpload.shape).toBe('slot');
    expect(registries.customEffectShaders.shape).toBe('keyed');
    expect(registries.customMaterialShaders.shape).toBe('keyed');
    expect(registries.materialRenderers.shape).toBe('keyed');
    expect(registries.meshMaterialRenderers.shape).toBe('keyed');
    expect(registries.modifierSnippets.shape).toBe('keyed');
    expect(registries.pbrExtensions.shape).toBe('keyed');
    expect(registries.renderEffects.shape).toBe('keyed');
    expect(registries.shapeRasterizer.shape).toBe('slot');
    expect(registries.strokeTessellator.shape).toBe('slot');
    expect(registries.textureResolvers.shape).toBe('keyed');
    expect(registries.velocityWriters.shape).toBe('keyed');
  });

  it('starts with zero entries in every keyed table', () => {
    const registries = createEmptyGlRegistries();
    expect(registries.renderers.entries.size).toBe(0);
    expect(registries.blendRealizations.entries.size).toBe(0);
    expect(registries.textureResolvers.entries.size).toBe(0);
  });
});

describe('createGlPipeline', () => {
  it('returns a pipeline with the supplied registries', () => {
    const registries = createEmptyGlRegistries();
    const pipeline = createGlPipeline(registries);
    expect(pipeline.registries).toBe(registries);
  });

  it('yields distinct pipelines from two calls over the same registries', () => {
    const registries = createEmptyGlRegistries();
    const pipelineA = createGlPipeline(registries);
    const pipelineB = createGlPipeline(registries);
    expect(pipelineA).not.toBe(pipelineB);
  });

  it('carries the provided registries unchanged', () => {
    const registries = createEmptyGlRegistries();
    const renderer: Renderer = {
      createData: () => null,
      submit: () => {},
    };
    const withRenderer = {
      ...registries,
      renderers: withRegistryTableEntry(registries.renderers, 'Sprite', renderer),
    };
    const pipeline = createGlPipeline(withRenderer);
    expect(pipeline.registries.renderers.entries.size).toBe(1);
    expect(pipeline.registries.renderers.entries.has('Sprite')).toBe(true);
  });

  it('does not share registries between two pipelines built from the same base', () => {
    const base = createEmptyGlRegistries();
    const renderer: Renderer = {
      createData: () => null,
      submit: () => {},
    };
    const regA = {
      ...base,
      renderers: withRegistryTableEntry(base.renderers, 'Sprite', renderer),
    };
    const regB = { ...base };
    const pipelineA = createGlPipeline(regA);
    const pipelineB = createGlPipeline(regB);
    expect(pipelineA.registries.renderers.entries.size).toBe(1);
    expect(pipelineB.registries.renderers.entries.size).toBe(0);
  });
});

describe('getGlPipelineRegistries', () => {
  it('returns the registries carried by the pipeline', () => {
    const registries = createEmptyGlRegistries();
    const pipeline = createGlPipeline(registries);
    expect(getGlPipelineRegistries(pipeline)).toBe(registries);
  });
});
describe('initializeEmptyGlRegistries', () => {
  it('is the construction initializer of createEmptyGlRegistries', () => {
    expect(typeof initializeEmptyGlRegistries).toBe('function');
  });
});
