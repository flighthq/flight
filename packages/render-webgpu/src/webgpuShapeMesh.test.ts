import { createMatrix } from '@flighthq/geometry';
import type { RenderProxy2D, WebGPURenderState, WebGPUShapeMeshBuffers } from '@flighthq/types';

import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import type { WebGPUShapeMesh } from './webgpuShapeMesh';
import { drawWebGPUShapeMeshes } from './webgpuShapeMesh';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

const TRIANGLE: WebGPUShapeMesh = {
  vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
  indices: new Uint16Array([0, 1, 2]),
  color: 0xff8040,
  alpha: 1,
};

function makeBuffers(): WebGPUShapeMeshBuffers {
  return {
    vertexBuffer: null,
    vertexCapacity: 0,
    indexBuffer: null,
    indexCapacity: 0,
    uniformBuffer: null,
    bindGroup: null,
  };
}

function makePassSpy(): GPURenderPassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setStencilReference: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeProxy(matrix = createMatrix(), alpha = 1): RenderProxy2D {
  return { alpha, blendMode: null, transform2D: matrix } as unknown as RenderProxy2D;
}

async function makeState(): Promise<WebGPURenderState> {
  const state = await createWebGPURenderStateForTest();
  getWebGPURenderStateRuntime(state).renderPass = makePassSpy();
  return state;
}

describe('drawWebGPUShapeMeshes', () => {
  it('sets the shape-mesh pipeline and draws each mesh', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);
    const pass = runtime.renderPass as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      drawIndexed: ReturnType<typeof vi.fn>;
    };

    drawWebGPUShapeMeshes(state, makeProxy(), [TRIANGLE, TRIANGLE], makeBuffers());

    expect(pass.setPipeline).toHaveBeenCalled();
    expect(runtime.shapeMeshPipeline).not.toBeNull();
    expect(pass.drawIndexed).toHaveBeenCalledTimes(2);
    expect(pass.drawIndexed).toHaveBeenCalledWith(3);
  });

  it('gates the fill by the active contour-clip stencil reference', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);
    runtime.currentMaskDepth = 2;
    const pass = runtime.renderPass as unknown as { setStencilReference: ReturnType<typeof vi.fn> };

    drawWebGPUShapeMeshes(state, makeProxy(), [TRIANGLE], makeBuffers());

    expect(pass.setStencilReference).toHaveBeenCalledWith(2);
  });

  it('writes premultiplied color (color * alpha) into the uniform buffer', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    const writes = new Map<GPUBuffer, Float32Array>();
    state.device.queue.writeBuffer = vi.fn((buffer: GPUBuffer, _offset: number, data: BufferSource) => {
      const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data as ArrayBuffer);
      // Only the uniform write is inspected; record a copy keyed by its destination buffer.
      if (view.byteLength % 4 === 0) {
        writes.set(buffer, new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)));
      }
    }) as unknown as GPUQueue['writeBuffer'];

    drawWebGPUShapeMeshes(state, makeProxy(createMatrix(), 0.5), [{ ...TRIANGLE, color: 0xffffff }], buffers);

    const uniformData = writes.get(buffers.uniformBuffer!);
    expect(uniformData).toBeDefined();
    // Color occupies floats 12..15 (after the mat3x3f columns): premultiplied (0.5, 0.5, 0.5, 0.5).
    const color = uniformData!.slice(12, 16);
    expect(color[0]).toBeCloseTo(0.5);
    expect(color[1]).toBeCloseTo(0.5);
    expect(color[2]).toBeCloseTo(0.5);
    expect(color[3]).toBeCloseTo(0.5);
  });

  it('skips fully transparent meshes', async () => {
    const state = await makeState();
    const pass = getWebGPURenderStateRuntime(state).renderPass as unknown as { drawIndexed: ReturnType<typeof vi.fn> };

    drawWebGPUShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, alpha: 0 }], makeBuffers());

    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty mesh list', async () => {
    const state = await makeState();
    const runtime = getWebGPURenderStateRuntime(state);
    const pass = runtime.renderPass as unknown as { setPipeline: ReturnType<typeof vi.fn> };

    drawWebGPUShapeMeshes(state, makeProxy(), [], makeBuffers());

    expect(pass.setPipeline).not.toHaveBeenCalled();
    expect(runtime.shapeMeshPipeline).toBeNull();
  });
});
