import { createMatrix } from '@flighthq/geometry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { RenderProxy2D, WgpuRenderState, WgpuShapeMeshBuffers } from '@flighthq/types/contract';
import type { WgpuShapeMesh } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { drawWgpuShapeMeshes } from './wgpuShapeMesh';

beforeAll(() => {
  installWgpuMock();
});

const TRIANGLE: WgpuShapeMesh = {
  vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
  indices: new Uint16Array([0, 1, 2]),
  color: 0xff8040,
  alpha: 1,
};

function makeBuffers(): WgpuShapeMeshBuffers {
  return {
    vertexBuffers: [],
    vertexCapacities: [],
    indexBuffers: [],
    indexCapacities: [],
    uniformBuffers: [],
    bindGroups: [],
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

function makeProxy(matrix = createMatrix(), alpha = 1, blendMode: BlendMode | null = null): RenderProxy2D {
  return { alpha, blendMode, transform2D: matrix } as unknown as RenderProxy2D;
}

async function makeState(): Promise<WgpuRenderState> {
  const state = await createWgpuRenderStateForTest();
  getWgpuRenderStateRuntime(state).renderPass = makePassSpy();
  return state;
}

describe('drawWgpuShapeMeshes', () => {
  it('sets the shape-mesh pipeline and draws each mesh', async () => {
    const state = await makeState();
    const runtime = getWgpuRenderStateRuntime(state);
    const pass = runtime.renderPass as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      drawIndexed: ReturnType<typeof vi.fn>;
    };

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE, TRIANGLE], makeBuffers());

    expect(pass.setPipeline).toHaveBeenCalled();
    expect(runtime.shapeMeshPipelines?.size ?? 0).toBeGreaterThan(0);
    expect(pass.drawIndexed).toHaveBeenCalledTimes(2);
    expect(pass.drawIndexed).toHaveBeenCalledWith(3);
  });

  it('retains distinct GPU storage for every mesh recorded before submit', async () => {
    const state = await makeState();
    const buffers = makeBuffers();

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE, { ...TRIANGLE, color: 0x0080ff }], buffers);

    expect(buffers.vertexBuffers).toHaveLength(2);
    expect(buffers.indexBuffers).toHaveLength(2);
    expect(buffers.uniformBuffers).toHaveLength(2);
    expect(buffers.vertexBuffers[0]).not.toBe(buffers.vertexBuffers[1]);
    expect(buffers.indexBuffers[0]).not.toBe(buffers.indexBuffers[1]);
    expect(buffers.uniformBuffers[0]).not.toBe(buffers.uniformBuffers[1]);
  });

  it('retires grown geometry buffers until the recorded frame is submitted', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    const createBuffer = state.device.createBuffer.bind(state.device);
    vi.spyOn(state.device, 'createBuffer').mockImplementation((descriptor) => {
      const buffer = createBuffer(descriptor);
      buffer.destroy = vi.fn();
      return buffer;
    });
    const larger: WgpuShapeMesh = {
      ...TRIANGLE,
      vertices: new Float32Array([...TRIANGLE.vertices, 10, 10]),
      indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
    };

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE], buffers);
    drawWgpuShapeMeshes(state, makeProxy(), [larger], buffers);

    const retired = getWgpuRenderStateRuntime(state).retiredBuffers!;
    expect(retired).toHaveLength(2);
    for (const buffer of retired) {
      expect(buffer.destroy).not.toHaveBeenCalled();
    }
  });

  it('gates the fill by the active contour-clip stencil reference', async () => {
    const state = await makeState();
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentMaskDepth = 2;
    const pass = runtime.renderPass as unknown as { setStencilReference: ReturnType<typeof vi.fn> };

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE], makeBuffers());

    expect(pass.setStencilReference).toHaveBeenCalledWith(2);
  });

  it('bakes the node blend mode into a distinct shape pipeline', async () => {
    const state = await makeState();

    drawWgpuShapeMeshes(state, makeProxy(createMatrix(), 1, BlendMode.Normal), [TRIANGLE], makeBuffers());
    drawWgpuShapeMeshes(state, makeProxy(createMatrix(), 1, BlendMode.Add), [TRIANGLE], makeBuffers());

    const pipelines = [...getWgpuRenderStateRuntime(state).shapeMeshPipelines!.values()].map(
      (entry) => entry.pipeline,
    ) as unknown as { __descriptor: GPURenderPipelineDescriptor }[];
    expect(pipelines).toHaveLength(2);
    const blends = pipelines.map((pipeline) => [...pipeline.__descriptor.fragment!.targets][0]!.blend!.color);
    expect(blends).toContainEqual({ srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' });
    expect(blends).toContainEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
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

    drawWgpuShapeMeshes(state, makeProxy(createMatrix(), 0.5), [{ ...TRIANGLE, color: 0xffffff }], buffers);

    const uniformData = writes.get(buffers.uniformBuffers[0]);
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
    const pass = getWgpuRenderStateRuntime(state).renderPass as unknown as { drawIndexed: ReturnType<typeof vi.fn> };

    drawWgpuShapeMeshes(state, makeProxy(), [{ ...TRIANGLE, alpha: 0 }], makeBuffers());

    expect(pass.drawIndexed).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty mesh list', async () => {
    const state = await makeState();
    const runtime = getWgpuRenderStateRuntime(state);
    const pass = runtime.renderPass as unknown as { setPipeline: ReturnType<typeof vi.fn> };

    drawWgpuShapeMeshes(state, makeProxy(), [], makeBuffers());

    expect(pass.setPipeline).not.toHaveBeenCalled();
    expect(runtime.shapeMeshPipelines?.size ?? 0).toBe(0);
  });
});
