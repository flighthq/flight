import { createMatrix } from '@flighthq/geometry';
import type { WebGPURenderState } from '@flighthq/types';

import { popWebGPUClipContours, pushWebGPUClipContours } from './webgpuClipContours';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

const SQUARE = [[0, 0, 50, 0, 50, 50, 0, 50]];

function makePassSpy(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setStencilReference: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

async function makeState(): Promise<WebGPURenderState> {
  const state = await createWebGPURenderStateForTest();
  getWebGPURenderStateRuntime(state).renderPass = makePassSpy();
  return state;
}

describe('popWebGPUClipContours', () => {
  it('decrements the stencil depth and pops the contour stack', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);
    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());
    expect(runtime.currentMaskDepth).toBe(1);
    expect(runtime.clipContourStack.length).toBe(1);

    popWebGPUClipContours(state);

    expect(runtime.currentMaskDepth).toBe(0);
    expect(runtime.clipContourStack.length).toBe(0);
  });

  it('redraws the stored geometry with the erase pipeline to undo its stencil region', async () => {
    const state = await makeState();
    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());
    const pass = getWebGPURenderStateRuntime(state).renderPass as unknown as {
      setStencilReference: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
    };
    pass.setStencilReference.mockClear();
    pass.draw.mockClear();

    popWebGPUClipContours(state);

    // Erase decrements the region stamped at depth 1, so the reference is the removed depth (1).
    expect(pass.setStencilReference).toHaveBeenCalledWith(1);
    expect(pass.draw).toHaveBeenCalled();
  });
});

describe('pushWebGPUClipContours', () => {
  it('increments the stencil depth and records the clip on the stack', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);

    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(runtime.currentMaskDepth).toBe(1);
    expect(runtime.clipContourStack.length).toBe(1);
    expect(runtime.clipContourStack[0].vertexCount).toBe(6); // one quad fan -> two triangles -> 6 verts
  });

  it('draws the contour with the parent depth as the stencil reference', async () => {
    const state = await makeState();
    const pass = getWebGPURenderStateRuntime(state).renderPass as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      setStencilReference: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
    };

    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(pass.setStencilReference).toHaveBeenCalledWith(0); // first clip increments from depth 0
    expect(pass.setPipeline).toHaveBeenCalled();
    expect(pass.draw).toHaveBeenCalled();
  });

  it('nests: a second clip increments from depth 1', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);
    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());
    const pass = runtime.renderPass as unknown as { setStencilReference: ReturnType<typeof vi.fn> };
    pass.setStencilReference.mockClear();

    pushWebGPUClipContours(state, SQUARE, 'nonZero', createMatrix());

    expect(runtime.currentMaskDepth).toBe(2);
    expect(pass.setStencilReference).toHaveBeenCalledWith(1);
  });
});
