import { tessellateStrokePath } from '@flighthq/path/contract';
import {
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { enableWgpuStrokePathTessellation } from './enableWgpuStrokePathTessellation';

beforeAll(() => {
  installWgpuMock();
});

describe('enableWgpuStrokePathTessellation', () => {
  it('replaces the full stroke-tessellator policy slot', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    // Nothing allocates the slot until the opt-in runs.
    expect(runtime.registries.strokeTessellator).toBeNull();

    enableWgpuStrokePathTessellation(state);

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
