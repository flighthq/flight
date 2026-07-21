import {
  BitmapKind,
  DisplayObjectKind,
  ParticleEmitter2DKind,
  QuadBatchKind,
  RichTextKind,
  Scale9ShapeKind,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
  TilemapKind,
  VideoKind,
} from '@flighthq/types';

import { canvasDisplayObjectRendererEntries, registerCanvasDisplayObjectRenderers } from './canvasRegistration';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';

describe('canvasDisplayObjectRendererEntries', () => {
  it('contains all expected display-object kinds', () => {
    const kinds = canvasDisplayObjectRendererEntries.map(([kind]) => kind);
    expect(kinds).toContain(BitmapKind);
    expect(kinds).toContain(DisplayObjectKind);
    expect(kinds).toContain(ParticleEmitter2DKind);
    expect(kinds).toContain(QuadBatchKind);
    expect(kinds).toContain(RichTextKind);
    expect(kinds).toContain(Scale9ShapeKind);
    expect(kinds).toContain(ShapeKind);
    expect(kinds).toContain(SpriteKind);
    expect(kinds).toContain(TextLabelKind);
    expect(kinds).toContain(TilemapKind);
    expect(kinds).toContain(VideoKind);
  });

  it('has a renderer for every entry', () => {
    for (const [, renderer] of canvasDisplayObjectRendererEntries) {
      expect(typeof renderer.submit).toBe('function');
    }
  });
});

describe('registerCanvasDisplayObjectRenderers', () => {
  it('registers all default renderers into the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasDisplayObjectRenderers(state);
    const rendererMap = getCanvasRenderStateRuntime(state).rendererMap;
    for (const [kind, renderer] of canvasDisplayObjectRendererEntries) {
      expect(rendererMap.get(kind)).toBe(renderer);
    }
  });

  it('registers exactly the same number of kinds as the entries array', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasDisplayObjectRenderers(state);
    const rendererMap = getCanvasRenderStateRuntime(state).rendererMap;
    expect(rendererMap.size).toBe(canvasDisplayObjectRendererEntries.length);
  });
});
