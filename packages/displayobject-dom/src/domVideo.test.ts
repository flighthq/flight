import { createVideo } from '@flighthq/displayobject';
import { registerRenderer } from '@flighthq/render';
import { getOrCreateRenderProxy2D } from '@flighthq/render';
import { VideoKind } from '@flighthq/types';

import { createDomRenderState } from './domRenderState';
import { defaultDomVideoRenderer, drawDomVideo } from './domVideo';

function makeState() {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  registerRenderer(state, VideoKind, defaultDomVideoRenderer);
  return state;
}

describe('defaultDomVideoRenderer', () => {
  it('has submit, and createData functions', () => {
    expect(typeof defaultDomVideoRenderer.submit).toBe('function');
    expect(typeof defaultDomVideoRenderer.createData).toBe('function');
  });
});

describe('drawDomVideo', () => {
  it('does not throw when source element is null', () => {
    const state = makeState();
    const video = createVideo();
    const renderProxy = getOrCreateRenderProxy2D(state, video);
    expect(() => drawDomVideo(state, renderProxy)).not.toThrow();
  });
});
