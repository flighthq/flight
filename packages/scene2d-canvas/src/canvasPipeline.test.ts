import { createEmptyCanvasRenderRegistries, initializeEmptyCanvasRenderRegistries } from './canvasPipeline';

describe('createEmptyCanvasRenderRegistries', () => {
  it('returns registries with empty tables', () => {
    const registries = createEmptyCanvasRenderRegistries();
    expect(registries.renderers.entries.size).toBe(0);
    expect(registries.renderEffects.entries.size).toBe(0);
    expect(registries.strokeTessellator.entry).toBeNull();
  });

  it('does not carry blend mode application', () => {
    const registries = createEmptyCanvasRenderRegistries();
    expect(registries.blendModeApplication).toBeUndefined();
  });

  it('does not carry canvas shape commands', () => {
    const registries = createEmptyCanvasRenderRegistries();
    expect(registries.canvasShapeCommands).toBeUndefined();
  });
});

describe('initializeEmptyCanvasRenderRegistries', () => {
  it('is the construction initializer of createEmptyCanvasRenderRegistries', () => {
    expect(typeof initializeEmptyCanvasRenderRegistries).toBe('function');
  });
});
