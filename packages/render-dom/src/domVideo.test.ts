import { createVideo } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { VideoKind } from '@flighthq/types';

import { createDOMRenderState } from './domRenderState';
import { defaultDOMVideoRenderer, drawDOMVideo, drawDOMVideoMask } from './domVideo';

function makeState() {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  registerRenderer(state, VideoKind, defaultDOMVideoRenderer);
  return state;
}

describe('defaultDOMVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultDOMVideoRenderer.submit).toBe('function');
    expect(typeof defaultDOMVideoRenderer.createData).toBe('function');
  });
});

describe('drawDOMVideo', () => {
  it('does not throw when source element is null', () => {
    const state = makeState();
    const video = createVideo();
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawDOMVideo(state, renderProxy)).not.toThrow();
  });
});

describe('drawDOMVideoMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const video = createVideo();
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawDOMVideoMask(state, renderProxy)).not.toThrow();
  });
});
