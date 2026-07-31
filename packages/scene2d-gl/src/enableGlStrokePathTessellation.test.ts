import { tessellateStrokePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';

import { enableGlStrokePathTessellation } from './enableGlStrokePathTessellation';
import { createGlState } from './glTestHelper';

describe('enableGlStrokePathTessellation', () => {
  it('installs the full stroke tessellator on the render state', () => {
    const { state } = createGlState();
    expect(getGlRenderStateRuntime(state).strokeTessellator).toBeNull();

    enableGlStrokePathTessellation(state);

    expect(getGlRenderStateRuntime(state).strokeTessellator).toBe(tessellateStrokePath);
  });
});
