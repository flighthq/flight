import { tessellateStrokePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';

import { enableGlStrokePathTessellation } from './enableGlStrokePathTessellation';
import { createGlState } from './glTestHelper';

describe('enableGlStrokePathTessellation', () => {
  it('replaces the full stroke-tessellator policy slot', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    // Nothing allocates the slot until the opt-in runs.
    expect(runtime.registries.strokeTessellator).toBeNull();

    enableGlStrokePathTessellation(state);

    // The slot the opt-in creates must be a whole table, not just an entry: `{...undefined}` is legal
    expect(runtime.registries.strokeTessellator).toBe(tessellateStrokePath);
  });
});
