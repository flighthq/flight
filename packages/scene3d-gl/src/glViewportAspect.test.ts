import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';

import { makeGlScene3DState } from './glScene3DTestHelper';
import { getGlScene3DViewportAspect } from './glViewportAspect';

describe('getGlScene3DViewportAspect', () => {
  it('uses the active render-pass dimensions', () => {
    const { state } = makeGlScene3DState();
    getGlRenderStateRuntime(state).renderTargetViewport = { height: 100, width: 200, x: 10, y: 20 };

    expect(getGlScene3DViewportAspect(state)).toBe(2);
  });
});
