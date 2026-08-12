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
    const before = runtime.registries.strokeTessellator;
    expect(before.entry).toBeNull();

    enableWgpuStrokePathTessellation(state);

    expect(runtime.registries.strokeTessellator).not.toBe(before);
    expect(runtime.registries.strokeTessellator.entry).toEqual({
      state: RegistryEntryState.Bound,
      value: tessellateStrokePath,
    });
  });
});
