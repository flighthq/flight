import { allocateEmptyCanvasRenderRegistries, initializeEmptyCanvasRenderRegistries } from './canvasPipeline.ts';

describe('allocateEmptyCanvasRenderRegistries', () => {
  it('returns registries with empty tables', () => {
    const registries = allocateEmptyCanvasRenderRegistries();
    expect(registries.nodeRenderers.size).toBe(0);
    expect(registries.effects.size).toBe(0);
    expect(registries.strokeTessellator).toBeNull();
  });

  it('does not carry blend mode application', () => {
    const registries = allocateEmptyCanvasRenderRegistries();
    expect(registries.blendModeApplication).toBeUndefined();
  });

  it('does not carry canvas shape commands', () => {
    const registries = allocateEmptyCanvasRenderRegistries();
    expect(registries.canvasShapeCommands).toBeUndefined();
  });
});

describe('initializeEmptyCanvasRenderRegistries', () => {
  it('is the construction initializer of allocateEmptyCanvasRenderRegistries', () => {
    expect(typeof initializeEmptyCanvasRenderRegistries).toBe('function');
  });
});
