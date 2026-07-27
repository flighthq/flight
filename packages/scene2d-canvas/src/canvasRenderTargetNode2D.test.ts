import { createRenderProxy2D } from '@flighthq/render/contract';
import { createRenderTargetNode2D } from '@flighthq/scene2d/contract';
import type { CanvasRenderState } from '@flighthq/types/contract';
import { RenderTargetNode2DKind } from '@flighthq/types/contract';

import { createCanvasCacheState } from './canvasCache';
import { createCanvasRenderState, getCanvasRenderStateRuntime } from './canvasRenderState';
import {
  defaultCanvasRenderTargetNode2DRenderer,
  destroyCanvasRenderTargetNode2D,
  enableCanvasRenderTargetNode2D,
  renderIntoCanvasRenderTargetNode2D,
} from './canvasRenderTargetNode2D';

describe('defaultCanvasRenderTargetNode2DRenderer', () => {
  it('does nothing before the node has been populated', () => {
    const state = createState();
    const drawImage = vi.spyOn(state.context, 'drawImage');

    defaultCanvasRenderTargetNode2DRenderer.submit(
      state,
      createRenderProxy2D(state, createRenderTargetNode2D({ height: 16, width: 32 })),
    );

    expect(drawImage).not.toHaveBeenCalled();
  });

  it('composites a screen-owned target while a cache state walks the node', () => {
    const screenState = createState();
    const cacheState = createCanvasCacheState(screenState);
    const node = createRenderTargetNode2D({ height: 16, width: 32 });
    let targetCanvas: HTMLCanvasElement | undefined;
    renderIntoCanvasRenderTargetNode2D(screenState, node, (state) => {
      targetCanvas = state.canvas;
    });
    const drawImage = vi.spyOn(cacheState.context, 'drawImage');

    defaultCanvasRenderTargetNode2DRenderer.submit(cacheState, createRenderProxy2D(cacheState, node));

    expect(drawImage).toHaveBeenCalledWith(targetCanvas, 0, 0);
  });
});

describe('destroyCanvasRenderTargetNode2D', () => {
  it('destroys the screen-owned target and recreates it on the next population', () => {
    const screenState = createState();
    const cacheState = createCanvasCacheState(screenState);
    const node = createRenderTargetNode2D({ height: 16, width: 32 });
    let firstCanvas: HTMLCanvasElement | undefined;
    renderIntoCanvasRenderTargetNode2D(screenState, node, (state) => {
      firstCanvas = state.canvas;
    });

    destroyCanvasRenderTargetNode2D(cacheState, node);

    expect(firstCanvas?.width).toBe(0);
    expect(firstCanvas?.height).toBe(0);

    let secondCanvas: HTMLCanvasElement | undefined;
    renderIntoCanvasRenderTargetNode2D(screenState, node, (state) => {
      secondCanvas = state.canvas;
    });
    expect(secondCanvas).not.toBe(firstCanvas);
  });
});

describe('enableCanvasRenderTargetNode2D', () => {
  it('registers the compositor renderer for the node kind', () => {
    const state = createState();

    enableCanvasRenderTargetNode2D(state);

    expect(getCanvasRenderStateRuntime(state).rendererMap.get(RenderTargetNode2DKind)).toBe(
      defaultCanvasRenderTargetNode2DRenderer,
    );
  });
});

describe('renderIntoCanvasRenderTargetNode2D', () => {
  it('redirects the callback to the target and restores the screen context', () => {
    const state = createState();
    const screenCanvas = state.canvas;
    const screenContext = state.context;
    const callback = vi.fn((targetState: CanvasRenderState) => {
      expect(targetState.canvas).not.toBe(screenCanvas);
      expect(targetState.context).not.toBe(screenContext);
    });

    renderIntoCanvasRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), callback);

    expect(callback).toHaveBeenCalledWith(state);
    expect(state.canvas).toBe(screenCanvas);
    expect(state.context).toBe(screenContext);
  });

  it('restores the screen context when the callback throws', () => {
    const state = createState();
    const screenCanvas = state.canvas;
    const screenContext = state.context;

    expect(() =>
      renderIntoCanvasRenderTargetNode2D(state, createRenderTargetNode2D({ height: 16, width: 32 }), () => {
        throw new Error('custom canvas draw failed');
      }),
    ).toThrow('custom canvas draw failed');

    expect(state.canvas).toBe(screenCanvas);
    expect(state.context).toBe(screenContext);
  });

  it('reuses and resizes the target on later populations', () => {
    const state = createState();
    const node = createRenderTargetNode2D({ height: 48, width: 64 });
    let firstCanvas: HTMLCanvasElement | undefined;
    renderIntoCanvasRenderTargetNode2D(state, node, (targetState) => {
      firstCanvas = targetState.canvas;
    });

    node.data.width = 24;
    node.data.height = 12;
    let secondCanvas: HTMLCanvasElement | undefined;
    renderIntoCanvasRenderTargetNode2D(state, node, (targetState) => {
      secondCanvas = targetState.canvas;
    });

    expect(secondCanvas).toBe(firstCanvas);
    expect(secondCanvas?.width).toBe(24);
    expect(secondCanvas?.height).toBe(12);
  });
});

function createState(): CanvasRenderState {
  const canvas = document.createElement('canvas');
  canvas.height = 200;
  canvas.width = 200;
  return createCanvasRenderState(canvas);
}
