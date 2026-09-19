import { tessellateStrokePath } from '@flighthq/path/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

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
    // JavaScript, so a missing fallback would silently yield a table with no shape, registry, or miss
    // policy and every identity-based check downstream would read undefined.
    expect(runtime.registries.strokeTessellator).toMatchObject({
      onMiss: 'Rasterize',
      registry: 'StrokeTessellator',
      shape: 'slot',
    });
    expect(runtime.registries.strokeTessellator?.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: tessellateStrokePath,
    });
  });
});
