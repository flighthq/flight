import { createVideo } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { VideoKind } from '@flighthq/types';

import { createCanvasRenderState } from './canvasRenderState';
import { defaultCanvasVideoRenderer, drawCanvasVideo, drawCanvasVideoMask } from './canvasVideo';

function makeState() {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const state = createCanvasRenderState(canvas);
  registerRenderer(state, VideoKind, defaultCanvasVideoRenderer);
  return state;
}

describe('defaultCanvasVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultCanvasVideoRenderer.submit).toBe('function');
    expect(typeof defaultCanvasVideoRenderer.createData).toBe('function');
  });
});

describe('drawCanvasVideo', () => {
  it('does not throw when source is null', () => {
    const state = makeState();
    const video = createVideo();
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawCanvasVideo(state, renderProxy)).not.toThrow();
  });

  it('skips drawImage when element has not loaded', () => {
    const state = makeState();
    const video = createVideo();
    const el = document.createElement('video');
    video.data.source = { element: el } as never;
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasVideo(state, renderProxy);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('drawCanvasVideoMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const video = createVideo();
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawCanvasVideoMask(state, renderProxy)).not.toThrow();
  });
});
