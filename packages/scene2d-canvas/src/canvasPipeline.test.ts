import { createEmptyCanvasRenderRegistry, initializeEmptyCanvasRenderRegistry } from './canvasPipeline';

describe('createEmptyCanvasRenderRegistry', () => {
  it('returns registries with empty tables', () => {
    const registries = createEmptyCanvasRenderRegistry();
    expect(registries.renderers.entries.size).toBe(0);
    expect(registries.renderEffects.entries.size).toBe(0);
    expect(registries.strokeTessellator.entry).toBeNull();
  });

  it('does not carry blend mode application', () => {
    const registries = createEmptyCanvasRenderRegistry();
    expect(registries.blendModeApplication).toBeUndefined();
  });

  it('does not carry canvas shape commands', () => {
    const registries = createEmptyCanvasRenderRegistry();
    expect(registries.canvasShapeCommands).toBeUndefined();
  });
});

describe('initializeEmptyCanvasRenderRegistry', () => {
  it('is the construction initializer of createEmptyCanvasRenderRegistry', () => {
    expect(typeof initializeEmptyCanvasRenderRegistry).toBe('function');
  });
});
