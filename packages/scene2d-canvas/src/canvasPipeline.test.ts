import { withRegistryTableEntry } from '@flighthq/registry/contract';
import { EntityRuntimeKey, RegistryEntryState, SpriteKind } from '@flighthq/types/contract';

import {
  createCanvasPipeline,
  createEmptyCanvasRegistries,
  getCanvasPipelineRegistries,
  initializeEmptyCanvasRegistries,
} from './canvasPipeline';
import { defaultCanvasSpriteRenderer } from './canvasSprite';

describe('createCanvasPipeline', () => {
  it('returns an Entity with EntityRuntimeKey', () => {
    const pipeline = createCanvasPipeline(createEmptyCanvasRegistries());
    expect(EntityRuntimeKey in pipeline).toBe(true);
  });

  it('carries the provided registries', () => {
    const registries = createEmptyCanvasRegistries();
    const pipeline = createCanvasPipeline(registries);
    expect(getCanvasPipelineRegistries(pipeline)).toBe(registries);
  });
});

describe('createEmptyCanvasRegistries', () => {
  it('returns registries with empty tables', () => {
    const registries = createEmptyCanvasRegistries();
    expect(registries.renderers.entries.size).toBe(0);
    expect(registries.renderEffects.entries.size).toBe(0);
    expect(registries.strokeTessellator.entry).toBeNull();
  });

  it('does not carry blend mode application', () => {
    const registries = createEmptyCanvasRegistries();
    expect(registries.blendModeApplication).toBeUndefined();
  });

  it('does not carry canvas shape commands', () => {
    const registries = createEmptyCanvasRegistries();
    expect(registries.canvasShapeCommands).toBeUndefined();
  });
});

describe('getCanvasPipelineRegistries', () => {
  it('returns the registries from a single-renderer pipeline', () => {
    const pipeline = createCanvasPipeline({
      ...createEmptyCanvasRegistries(),
      renderers: withRegistryTableEntry(
        createEmptyCanvasRegistries().renderers,
        SpriteKind,
        defaultCanvasSpriteRenderer,
      ),
    });
    const registries = getCanvasPipelineRegistries(pipeline);
    expect(registries.renderers.entries.size).toBe(1);
    expect(registries.renderers.entries.has(SpriteKind)).toBe(true);
    const entry = registries.renderers.entries.get(SpriteKind);
    expect(entry?.state).toBe(RegistryEntryState.Bound);
  });
});
describe('initializeEmptyCanvasRegistries', () => {
  it('is the construction initializer of createEmptyCanvasRegistries', () => {
    expect(typeof initializeEmptyCanvasRegistries).toBe('function');
  });
});
