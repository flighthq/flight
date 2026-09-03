import { setCanvasRenderStateHandles } from './canvasRenderStateHandles';
import { createCanvasRenderState } from './canvasTestSupport';

describe('setCanvasRenderStateHandles', () => {
  it('redirects both handles at the target the renderer is drawing into', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const target = document.createElement('canvas');
    const context = target.getContext('2d')!;

    setCanvasRenderStateHandles(state, target, context);

    expect(state.canvas).toBe(target);
    expect(state.context).toBe(context);
  });

  it('restores the handles it was given back, so the redirection is reversible', () => {
    // Redirect-and-restore is the whole shape of a render pass. If restoring were not symmetric with
    // redirecting, every pass would leave the state pointed at the last offscreen target it used.
    const canvas = document.createElement('canvas');
    const state = createCanvasRenderState(canvas);
    const originalCanvas = state.canvas;
    const originalContext = state.context;
    const target = document.createElement('canvas');

    setCanvasRenderStateHandles(state, target, target.getContext('2d')!);
    setCanvasRenderStateHandles(state, originalCanvas, originalContext);

    expect(state.canvas).toBe(originalCanvas);
    expect(state.context).toBe(originalContext);
  });

  it('is the only writable path: the handles stay readonly on the public shape', () => {
    // The seam exists BECAUSE the fields are readonly. If a later edit dropped the readonly modifier
    // the seam would look redundant and be deleted, and the writes would scatter again.
    const state = createCanvasRenderState(document.createElement('canvas'));
    // @ts-expect-error canvas is readonly on CanvasRenderState; only the seam may rewrite it.
    state.canvas = document.createElement('canvas');
    // @ts-expect-error context is readonly on CanvasRenderState; only the seam may rewrite it.
    state.context = document.createElement('canvas').getContext('2d')!;
    expect(state.canvas).toBeInstanceOf(HTMLCanvasElement);
  });
});
