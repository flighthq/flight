import { createRectangle } from '@flighthq/geometry';
import type { Node, RenderView, RenderViewRenderer } from '@flighthq/types';
import { RenderViewKind } from '@flighthq/types';

import {
  computeRenderViewLocalBoundsRectangle,
  createRenderView,
  createRenderViewData,
  createRenderViewRuntime,
  getRenderViewRuntime,
  setRenderViewSize,
} from './renderView';

function makeRenderer(): RenderViewRenderer {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  return { canvas, render: () => {} };
}

describe('computeRenderViewLocalBoundsRectangle', () => {
  it('writes width and height from data', () => {
    const view = createRenderView({ data: { width: 400, height: 300 } });
    const out = createRectangle(0, 0, 0, 0);
    computeRenderViewLocalBoundsRectangle(out, view as unknown as Node);
    expect(out.width).toBe(400);
    expect(out.height).toBe(300);
  });
});

describe('createRenderView', () => {
  let view: RenderView;

  beforeEach(() => {
    view = createRenderView();
  });

  it('initializes default values', () => {
    expect(view.data.renderer).toBeNull();
    expect(view.data.width).toBe(0);
    expect(view.data.height).toBe(0);
    expect(view.kind).toStrictEqual(RenderViewKind);
  });

  it('allows pre-defined values', () => {
    const renderer = makeRenderer();
    const obj = createRenderView({ data: { renderer, width: 320, height: 240 } });
    expect(obj.data.renderer).toStrictEqual(renderer);
    expect(obj.data.width).toBe(320);
    expect(obj.data.height).toBe(240);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createRenderView(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createRenderViewData', () => {
  it('returns default values', () => {
    const data = createRenderViewData();
    expect(data.renderer).toBeNull();
    expect(data.width).toBe(0);
    expect(data.height).toBe(0);
  });

  it('allows pre-defined values', () => {
    const renderer = makeRenderer();
    const data = createRenderViewData({ renderer, width: 800, height: 600 });
    expect(data.renderer).toStrictEqual(renderer);
    expect(data.width).toBe(800);
    expect(data.height).toBe(600);
  });
});

describe('createRenderViewRuntime', () => {
  it('returns a non-null runtime', () => {
    expect(createRenderViewRuntime()).not.toBeNull();
  });
});

describe('getRenderViewRuntime', () => {
  it('returns the runtime for a RenderView', () => {
    const view = createRenderView();
    expect(getRenderViewRuntime(view)).not.toBeNull();
  });
});

describe('setRenderViewSize', () => {
  it('updates width and height', () => {
    const view = createRenderView();
    setRenderViewSize(view, 640, 480);
    expect(view.data.width).toBe(640);
    expect(view.data.height).toBe(480);
  });

  it('is a no-op when size is unchanged', () => {
    const view = createRenderView({ data: { width: 100, height: 100 } });
    const before = view.data.width;
    setRenderViewSize(view, 100, 100);
    expect(view.data.width).toBe(before);
  });
});
