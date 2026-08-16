import { createMatrix } from '@flighthq/geometry/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type {
  ColorScaleBias,
  RenderProxy2D,
  WgpuRenderState,
  WgpuShapeMeshBuffers,
  WgpuShapeMeshPipeline,
} from '@flighthq/types/contract';
import type { WgpuShapeMesh } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import { drawWgpuShapeMeshBatch, drawWgpuShapeMeshes } from './wgpuShapeMesh';

beforeAll(() => {
  installWgpuMock();
});

const TRIANGLE: WgpuShapeMesh = {
  vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
  indices: new Uint16Array([0, 1, 2]),
  color: 0xff8040ff,
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
    colorScaleBiasUniformBuffers: [],
    colorScaleBiasBindGroups: [],
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

function makeProxy(overrides?: Partial<RenderProxy2D>): RenderProxy2D {
  return {
    alpha: 1,
    blendMode: null,
    colorMatrix: null,
    colorScaleBias: null,
    transform2D: createMatrix(),
    ...overrides,
  } as unknown as RenderProxy2D;
}

function ct(
  redScale = 1,
  greenScale = 1,
  blueScale = 1,
  alphaScale = 1,
  redBias = 0,
  greenBias = 0,
  blueBias = 0,
  alphaBias = 0,
): ColorScaleBias {
  return {
    redScale,
    greenScale,
    blueScale,
    alphaScale,
    redBias,
    greenBias,
    blueBias,
    alphaBias,
  } as ColorScaleBias;
}

async function makeState(): Promise<WgpuRenderState> {
  const state = await createWgpuRenderStateForTest();
  getWgpuRenderStateRuntime(state).renderPass = makePassSpy();
  return state;
}

describe('drawWgpuShapeMeshBatch', () => {
  it('writes only the shared matrix and color fields, preserving a feature-owned uniform tail', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    const uniformBuffers: GPUBuffer[] = [];
    const bindGroups: GPUBindGroup[] = [];
    const uniformData = new Float32Array(24);
    uniformData.set([0.25, 0.5, 0.75, 1, 0.1, 0.2, 0.3, 0.4], 16);
    const pipelineEntry: WgpuShapeMeshPipeline = {
      bindGroupLayout: {} as GPUBindGroupLayout,
      pipeline: {} as GPURenderPipeline,
    };
    let upload: Float32Array | undefined;
    state.device.queue.writeBuffer = vi.fn((buffer: GPUBuffer, _offset: number, data: BufferSource) => {
      if (buffer !== uniformBuffers[0]) return;
      const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data as ArrayBuffer);
      upload = new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    }) as unknown as GPUQueue['writeBuffer'];

    drawWgpuShapeMeshBatch(
      state,
      makeProxy({ alpha: 0.5 }),
      [{ ...TRIANGLE, color: 0xffffffff }],
      buffers,
      pipelineEntry,
      uniformBuffers,
      bindGroups,
      uniformData,
    );

    expect(uniformBuffers).toHaveLength(1);
    expect(upload?.slice(12, 16)).toEqual(new Float32Array([0.5, 0.5, 0.5, 0.5]));
    expect(upload?.slice(16, 24)).toEqual(new Float32Array([0.25, 0.5, 0.75, 1, 0.1, 0.2, 0.3, 0.4]));
  });
});

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

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE, { ...TRIANGLE, color: 0x0080ffff }], buffers);

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

    drawWgpuShapeMeshes(state, makeProxy({ blendMode: BlendMode.Normal }), [TRIANGLE], makeBuffers());
    drawWgpuShapeMeshes(state, makeProxy({ blendMode: BlendMode.Add }), [TRIANGLE], makeBuffers());

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

    drawWgpuShapeMeshes(state, makeProxy({ alpha: 0.5 }), [{ ...TRIANGLE, color: 0xffffffff }], buffers);

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

  it('ignores ColorScaleBias when the opt-in feature is not registered', async () => {
    const state = await makeState();
    const buffers = makeBuffers();

    drawWgpuShapeMeshes(state, makeProxy({ colorScaleBias: ct(0.5) }), [TRIANGLE], buffers);

    expect(buffers.uniformBuffers).toHaveLength(1);
    expect(buffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });

  it('keeps registered but unadjusted meshes on the lean uniform path', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    registerWgpuColorAdjustmentMaterialFeature(state);

    drawWgpuShapeMeshes(state, makeProxy(), [TRIANGLE], buffers);

    expect(buffers.uniformBuffers).toHaveLength(1);
    expect(buffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });

  it('folds ColorScaleBias through a separate 96-byte uniform and shader', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    registerWgpuColorAdjustmentMaterialFeature(state);
    const createShaderModule = vi.spyOn(state.device, 'createShaderModule');
    const writes = new Map<GPUBuffer, Float32Array>();
    state.device.queue.writeBuffer = vi.fn((buffer: GPUBuffer, _offset: number, data: BufferSource) => {
      const view = ArrayBuffer.isView(data) ? data : new Uint8Array(data as ArrayBuffer);
      if (view.byteLength % 4 === 0) {
        writes.set(buffer, new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)));
      }
    }) as unknown as GPUQueue['writeBuffer'];

    drawWgpuShapeMeshes(
      state,
      makeProxy({ alpha: 0.5, colorScaleBias: ct(0.25, 0.5, 0.75, 0.8, 0.1, 0.2, 0.3, 0.4) }),
      [{ ...TRIANGLE, color: 0xffffffff }],
      buffers,
    );

    expect(buffers.uniformBuffers).toHaveLength(0);
    expect(buffers.colorScaleBiasUniformBuffers).toHaveLength(1);
    const uniform = writes.get(buffers.colorScaleBiasUniformBuffers[0]);
    expect(uniform).toHaveLength(24);
    expect(uniform?.slice(12, 16)).toEqual(new Float32Array([0.5, 0.5, 0.5, 0.5]));
    expect(uniform?.slice(16, 24)).toEqual(new Float32Array([0.25, 0.5, 0.75, 0.8, 0.1, 0.2, 0.3, 0.4]));
    const shader = createShaderModule.mock.calls
      .map(([descriptor]) => descriptor.code)
      .find((code) => code.includes('struct ShapeMeshUniforms'));
    expect(shader).toContain('u.color.rgb / u.color.a');
    expect(shader).toContain('applyFlightColorAdjustment(color, u.colorScale, u.colorBias)');
    expect(shader).toContain('color.rgb * color.a');
  });

  it('leaves the full color-matrix path outside the bounded solid-mesh fold', async () => {
    const state = await makeState();
    const buffers = makeBuffers();
    registerWgpuColorAdjustmentMaterialFeature(state);

    drawWgpuShapeMeshes(state, makeProxy({ colorMatrix: new Array(20).fill(0) }), [TRIANGLE], buffers);

    expect(buffers.uniformBuffers).toHaveLength(1);
    expect(buffers.colorScaleBiasUniformBuffers).toHaveLength(0);
  });
});
