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
} from '@flighthq/types/contract';

import { canvasScene2DRendererEntries, registerCanvasScene2DRenderers } from './canvasRegistration';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';

describe('canvasScene2DRendererEntries', () => {
  it('contains all expected display-object kinds', () => {
    const kinds = canvasScene2DRendererEntries.map(([kind]) => kind);
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
    for (const [, renderer] of canvasScene2DRendererEntries) {
      expect(typeof renderer.submit).toBe('function');
    }
  });
});

describe('registerCanvasScene2DRenderers', () => {
  it('registers all default renderers into the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasScene2DRenderers(state);
    const rendererMap = getCanvasRenderStateRuntime(state).rendererMap;
    for (const [kind, renderer] of canvasScene2DRendererEntries) {
      expect(rendererMap.get(kind)).toBe(renderer);
    }
  });

  it('registers exactly the same number of kinds as the entries array', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    registerCanvasScene2DRenderers(state);
    const rendererMap = getCanvasRenderStateRuntime(state).rendererMap;
    expect(rendererMap.size).toBe(canvasScene2DRendererEntries.length);
  });
});
