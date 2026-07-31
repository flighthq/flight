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
  it('installs the full stroke tessellator on the render state', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderStateRuntime(state).strokeTessellator).toBeNull();

    enableWgpuStrokePathTessellation(state);

    expect(getWgpuRenderStateRuntime(state).strokeTessellator).toBe(tessellateStrokePath);
  });
});
