import { getOrCreateDisplayObjectRenderNode, registerRenderer } from '@flighthq/render-core';
import { createVideo } from '@flighthq/scenegraph-display';
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
  it('has draw, drawMask, and createData functions', () => {
    expect(typeof defaultDOMVideoRenderer.draw).toBe('function');
    expect(typeof defaultDOMVideoRenderer.drawMask).toBe('function');
    expect(typeof defaultDOMVideoRenderer.createData).toBe('function');
  });
});

describe('drawDOMVideo', () => {
  it('does not throw when source element is null', () => {
    const state = makeState();
    const video = createVideo();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    expect(() => drawDOMVideo(state, renderNode)).not.toThrow();
  });
});

describe('drawDOMVideoMask', () => {
  it('does not throw', () => {
    const state = makeState();
    const video = createVideo();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, video);
    expect(() => drawDOMVideoMask(state, renderNode)).not.toThrow();
  });
});
