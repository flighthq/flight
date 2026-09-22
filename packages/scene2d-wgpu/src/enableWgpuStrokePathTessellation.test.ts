import { tessellateStrokePath } from '@flighthq/path/contract';
import {
  createWgpuRenderStateForTest,
  getWgpuRenderStateRuntime,
  installWgpuMock,
} from '@flighthq/render-wgpu/contract';

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

    expect(runtime.registries.strokeTessellator).toBe(tessellateStrokePath);
  });
});
