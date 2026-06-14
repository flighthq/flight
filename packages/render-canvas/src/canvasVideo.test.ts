import { createVideo } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateDisplayObjectRenderNode } from '@flighthq/render';
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
  it('has draw, and createData functions', () => {
    expect(typeof defaultCanvasVideoRenderer.draw).toBe('function');
    expect(typeof defaultCanvasVideoRenderer.createData).toBe('function');
  });
});

describe('drawCanvasVideo', () => {
  it('does not throw when source is null', () => {
    const state = makeState();
    const video = createVideo();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    expect(() => drawCanvasVideo(state, renderNode)).not.toThrow();
  });

  it('skips drawImage when element has not loaded', () => {
    const state = makeState();
    const video = createVideo();
    const el = document.createElement('video');
    video.data.source = { element: el } as never;
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    const spy = vi.spyOn(state.context, 'drawImage');
    drawCanvasVideo(state, renderNode);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('drawCanvasVideoMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const video = createVideo();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    expect(() => drawCanvasVideoMask(state, renderNode)).not.toThrow();
  });
});
