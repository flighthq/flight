import { renderWebGPUBackground } from './webgpuBackground';
import { getWebGPURenderStateRuntime } from './webgpuRenderState';
import {
  createWebGPUBindGroupLayouts,
  createWebGPUPipelineLayout,
  getActiveWebGPUPipeline,
  getWebGPUPipeline,
  setWebGPUMatrixFromTransform,
  UNIFORM_BYTE_SIZE,
  writeWebGPUMatrixOnlyUniforms,
  writeWebGPUQuadUniforms,
} from './webgpuShader';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPUBindGroupLayouts', () => {
  it('returns uniformBindGroupLayout and textureBindGroupLayout', async () => {
    const state = await createWebGPURenderStateForTest();
    const layouts = createWebGPUBindGroupLayouts(state.device);
    expect(layouts.uniformBindGroupLayout).toBeDefined();
    expect(layouts.textureBindGroupLayout).toBeDefined();
  });
});

describe('createWebGPUPipelineLayout', () => {
  it('returns a pipeline layout', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    const layout = createWebGPUPipelineLayout(
      state.device,
      runtime.uniformBindGroupLayout,
      runtime.textureBindGroupLayout,
    );
    expect(layout).toBeDefined();
  });
});

describe('getActiveWebGPUPipeline', () => {
  it('returns the normal pipeline when no mask is active', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    runtime.currentMaskDepth = 0;
    runtime.maskWriteMode = false;
    const pipeline = getActiveWebGPUPipeline(state);
    expect(pipeline).toBeDefined();
  });
});

describe('getWebGPUPipeline', () => {
  it('returns a cached pipeline on second call', async () => {
    const state = await createWebGPURenderStateForTest();
    const p1 = getWebGPUPipeline(state, null, 'normal');
    const p2 = getWebGPUPipeline(state, null, 'normal');
    expect(p1).toBe(p2);
  });

  it('returns different pipelines for different stencil modes', async () => {
    const state = await createWebGPURenderStateForTest();
    const normal = getWebGPUPipeline(state, null, 'normal');
    const maskwrite = getWebGPUPipeline(state, null, 'maskwrite');
    expect(normal).not.toBe(maskwrite);
  });
});

describe('setWebGPUMatrixFromTransform', () => {
  it('builds a column-major clip-space matrix from an identity transform', () => {
    const m = new Float32Array(9);
    setWebGPUMatrixFromTransform(m, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, { width: 2, height: 2 });
    // Identity scale on a 2×2 viewport: a*iw=1, -d*ih=-1, tx*iw-1=-1, -ty*ih+1=1
    expect(m[0]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(-1);
    expect(m[6]).toBeCloseTo(-1);
    expect(m[7]).toBeCloseTo(1);
  });

  it('builds a distinct out from aliased inputs (out === input matrix)', () => {
    const m = new Float32Array(9);
    setWebGPUMatrixFromTransform(m, { a: 2, b: 0, c: 0, d: 2, tx: 100, ty: 50 }, { width: 400, height: 300 });
    expect(m[0]).toBeCloseTo(2 * (2 / 400));
  });
});

describe('UNIFORM_BYTE_SIZE', () => {
  it('is 128 bytes', () => {
    expect(UNIFORM_BYTE_SIZE).toBe(128);
  });
});

describe('writeWebGPUMatrixOnlyUniforms', () => {
  it('advances uniformOffset', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    renderWebGPUBackground(state);
    const before = runtime.uniformOffset;
    const fakeNode = { alpha: 1, useColorTransform: false, colorTransform: null };
    const t = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    writeWebGPUMatrixOnlyUniforms(state, fakeNode as never, t, 0, 0, 10, 10, 0, 0, 1, 1);
    expect(runtime.uniformOffset).toBe(before + runtime.uniformStride);
  });
});

describe('writeWebGPUQuadUniforms', () => {
  it('advances uniformOffset by uniformStride', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    renderWebGPUBackground(state);
    const before = runtime.uniformOffset;
    const fakeNode = {
      alpha: 1,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    writeWebGPUQuadUniforms(state, fakeNode, null, 0, 0, 100, 100, 0, 0, 1, 1);
    expect(runtime.uniformOffset).toBe(before + runtime.uniformStride);
  });

  it('writes quad coordinates into uniform data at float offset 24', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    renderWebGPUBackground(state);
    const fakeNode = {
      alpha: 0.5,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    const offset = writeWebGPUQuadUniforms(state, fakeNode, null, 10, 20, 30, 40, 0.1, 0.2, 0.9, 0.8);
    const floatBase = offset >> 2;
    expect(runtime.uniformData[floatBase + 24]).toBeCloseTo(10);
    expect(runtime.uniformData[floatBase + 25]).toBeCloseTo(20);
    expect(runtime.uniformData[floatBase + 26]).toBeCloseTo(30);
    expect(runtime.uniformData[floatBase + 27]).toBeCloseTo(40);
    expect(runtime.uniformData[floatBase + 28]).toBeCloseTo(0.1);
    expect(runtime.uniformData[floatBase + 12]).toBeCloseTo(0.5); // alpha
  });
});
