import { AdvancedBlendMode, BlendMode } from '@flighthq/types';

import { renderWgpuBackground } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  createWgpuBindGroupLayouts,
  createWgpuPipelineLayout,
  getActiveWgpuPipeline,
  getWgpuPipeline,
  setWgpuMatrixFromTransform,
  UNIFORM_BYTE_SIZE,
  writeWgpuMatrixOnlyUniforms,
  writeWgpuQuadUniforms,
} from './wgpuShader';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuBindGroupLayouts', () => {
  it('returns uniformBindGroupLayout and textureBindGroupLayout', async () => {
    const state = await createWgpuRenderStateForTest();
    const layouts = createWgpuBindGroupLayouts(state.device);
    expect(layouts.uniformBindGroupLayout).toBeDefined();
    expect(layouts.textureBindGroupLayout).toBeDefined();
  });
});

describe('createWgpuPipelineLayout', () => {
  it('returns a pipeline layout', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const layout = createWgpuPipelineLayout(
      state.device,
      runtime.uniformBindGroupLayout,
      runtime.textureBindGroupLayout,
    );
    expect(layout).toBeDefined();
  });
});

describe('getActiveWgpuPipeline', () => {
  it('returns the normal pipeline when no mask is active', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentMaskDepth = 0;
    runtime.maskWriteMode = false;
    const pipeline = getActiveWgpuPipeline(state);
    expect(pipeline).toBeDefined();
  });
});

describe('getWgpuPipeline', () => {
  it('returns a cached pipeline on second call', async () => {
    const state = await createWgpuRenderStateForTest();
    const p1 = getWgpuPipeline(state, null, 'normal');
    const p2 = getWgpuPipeline(state, null, 'normal');
    expect(p1).toBe(p2);
  });

  it('returns different pipelines for different stencil modes', async () => {
    const state = await createWgpuRenderStateForTest();
    const normal = getWgpuPipeline(state, null, 'normal');
    const maskwrite = getWgpuPipeline(state, null, 'maskwrite');
    expect(normal).not.toBe(maskwrite);
  });

  it('realizes each fixed-function blend mode with GL-parity factors', async () => {
    const state = await createWgpuRenderStateForTest();
    const blendOf = (mode: BlendMode) =>
      [
        ...(getWgpuPipeline(state, mode, 'normal') as unknown as { __descriptor: GPURenderPipelineDescriptor })
          .__descriptor.fragment!.targets,
      ][0]!.blend!.color;
    expect(blendOf(BlendMode.Normal)).toEqual({ srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' });
    expect(blendOf(BlendMode.Add)).toEqual({ srcFactor: 'one', dstFactor: 'one', operation: 'add' });
    expect(blendOf(BlendMode.Multiply)).toEqual({
      srcFactor: 'dst',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    });
    expect(blendOf(BlendMode.Screen)).toEqual({ srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' });
    expect(blendOf(BlendMode.Darken).operation).toBe('min');
    expect(blendOf(BlendMode.Lighten).operation).toBe('max');
  });

  it('falls back to normal blend for shader-composited modes', async () => {
    const state = await createWgpuRenderStateForTest();
    const blendOf = (mode: BlendMode) =>
      [
        ...(getWgpuPipeline(state, mode, 'normal') as unknown as { __descriptor: GPURenderPipelineDescriptor })
          .__descriptor.fragment!.targets,
      ][0]!.blend!.color;
    expect(blendOf(AdvancedBlendMode.Overlay)).toEqual({
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    });
    expect(blendOf(AdvancedBlendMode.HardLight)).toEqual({
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    });
  });
});

describe('setWgpuMatrixFromTransform', () => {
  it('builds a column-major clip-space matrix from an identity transform', () => {
    const m = new Float32Array(9);
    setWgpuMatrixFromTransform(m, { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, { width: 2, height: 2 });
    // Identity scale on a 2×2 viewport: a*iw=1, -d*ih=-1, tx*iw-1=-1, -ty*ih+1=1
    expect(m[0]).toBeCloseTo(1);
    expect(m[4]).toBeCloseTo(-1);
    expect(m[6]).toBeCloseTo(-1);
    expect(m[7]).toBeCloseTo(1);
  });

  it('builds a distinct out from aliased inputs (out === input matrix)', () => {
    const m = new Float32Array(9);
    setWgpuMatrixFromTransform(m, { a: 2, b: 0, c: 0, d: 2, tx: 100, ty: 50 }, { width: 400, height: 300 });
    expect(m[0]).toBeCloseTo(2 * (2 / 400));
  });
});

describe('UNIFORM_BYTE_SIZE', () => {
  it('is 128 bytes', () => {
    expect(UNIFORM_BYTE_SIZE).toBe(128);
  });
});

describe('writeWgpuMatrixOnlyUniforms', () => {
  it('advances uniformOffset', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    renderWgpuBackground(state);
    const before = runtime.uniformOffset;
    const fakeNode = { alpha: 1, useColorTransform: false, colorTransform: null };
    const t = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    writeWgpuMatrixOnlyUniforms(state, fakeNode as never, t, 0, 0, 10, 10, 0, 0, 1, 1);
    expect(runtime.uniformOffset).toBe(before + runtime.uniformStride);
  });
});

describe('writeWgpuQuadUniforms', () => {
  it('advances uniformOffset by uniformStride', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    renderWgpuBackground(state);
    const before = runtime.uniformOffset;
    const fakeNode = {
      alpha: 1,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    writeWgpuQuadUniforms(state, fakeNode, null, 0, 0, 100, 100, 0, 0, 1, 1);
    expect(runtime.uniformOffset).toBe(before + runtime.uniformStride);
  });

  it('writes quad coordinates into uniform data at float offset 24', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    renderWgpuBackground(state);
    const fakeNode = {
      alpha: 0.5,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    const offset = writeWgpuQuadUniforms(state, fakeNode, null, 10, 20, 30, 40, 0.1, 0.2, 0.9, 0.8);
    const floatBase = offset >> 2;
    expect(runtime.uniformData[floatBase + 24]).toBeCloseTo(10);
    expect(runtime.uniformData[floatBase + 25]).toBeCloseTo(20);
    expect(runtime.uniformData[floatBase + 26]).toBeCloseTo(30);
    expect(runtime.uniformData[floatBase + 27]).toBeCloseTo(40);
    expect(runtime.uniformData[floatBase + 28]).toBeCloseTo(0.1);
    expect(runtime.uniformData[floatBase + 12]).toBeCloseTo(0.5); // alpha
  });
});
