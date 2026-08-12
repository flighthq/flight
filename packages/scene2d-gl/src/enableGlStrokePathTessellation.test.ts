import { tessellateStrokePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { enableGlStrokePathTessellation } from './enableGlStrokePathTessellation';
import { createGlState } from './glTestHelper';

describe('enableGlStrokePathTessellation', () => {
  it('replaces the full stroke-tessellator policy slot', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const before = runtime.registries.strokeTessellator;
    expect(before.entry).toBeNull();

    enableGlStrokePathTessellation(state);

    expect(runtime.registries.strokeTessellator).not.toBe(before);
    expect(runtime.registries.strokeTessellator.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: tessellateStrokePath,
    });
  });
});
