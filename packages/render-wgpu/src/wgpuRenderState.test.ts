import {
  createWgpuRenderStateRuntime,
  destroyWgpuRenderState,
  getWgpuRenderStateRuntime,
  getWgpuSampler,
  isWgpuSupported,
} from './wgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuRenderState', () => {
  it('returns a render state with device and context', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.device).toBeDefined();
    expect(state.context).toBeDefined();
  });

  it('sets allowSmoothing to true by default', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.allowSmoothing).toBe(true);
  });

  it('initialises uniform ring buffer', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.uniformBuffer).toBeDefined();
    expect(runtime.uniformData).toBeInstanceOf(Float32Array);
    expect(runtime.uniformOffset).toBe(0);
  });

  it('stores the canvas', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(state.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('starts with null renderPass and commandEncoder', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.commandEncoder).toBeNull();
  });
});

describe('createWgpuRenderStateRuntime', () => {
  it('returns a runtime carrying the base entity-runtime binding slot', () => {
    const runtime = createWgpuRenderStateRuntime();
    expect(runtime.binding).toBeNull();
  });
});

describe('destroyWgpuRenderState', () => {
  it('destroys the state-owned uniform buffer', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const destroy = vi.spyOn(runtime.uniformBuffer, 'destroy');

    destroyWgpuRenderState(state);

    expect(destroy).toHaveBeenCalled();
  });

  it('does not throw on a fresh state with no lazily-created buffers', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => destroyWgpuRenderState(state)).not.toThrow();
  });
});

describe('getWgpuRenderStateRuntime', () => {
  it('returns the runtime attached by createWgpuRenderState', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime).toBeDefined();
    expect(runtime.uniformBuffer).toBeDefined();
  });

  it('resolves the same runtime object on repeated calls', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuRenderStateRuntime(state)).toBe(getWgpuRenderStateRuntime(state));
  });
});

describe('getWgpuSampler', () => {
  it('caches a sampler per filter+wrap+mip+anisotropy key and reuses it', async () => {
    const state = await createWgpuRenderStateForTest();
    const a = getWgpuSampler(state, 'linear', 'repeat', 'repeat');
    const b = getWgpuSampler(state, 'linear', 'repeat', 'repeat');
    expect(a).toBe(b);
    expect(getWgpuRenderStateRuntime(state).samplerCache.get('linear|repeat|repeat|none|1')).toBe(a);
  });

  it('returns a distinct sampler for a different wrap or filter', async () => {
    const state = await createWgpuRenderStateForTest();
    const repeat = getWgpuSampler(state, 'linear', 'repeat', 'repeat');
    const clamp = getWgpuSampler(state, 'linear', 'clamp-to-edge', 'clamp-to-edge');
    const nearest = getWgpuSampler(state, 'nearest', 'repeat', 'repeat');
    expect(repeat).not.toBe(clamp);
    expect(repeat).not.toBe(nearest);
  });

  it('keys the mip filter separately so a trilinear sampler differs from a non-mip one', async () => {
    const state = await createWgpuRenderStateForTest();
    const noMip = getWgpuSampler(state, 'linear', 'repeat', 'repeat');
    const trilinear = getWgpuSampler(state, 'linear', 'repeat', 'repeat', 'linear');
    expect(noMip).not.toBe(trilinear);
    expect(getWgpuRenderStateRuntime(state).samplerCache.has('linear|repeat|repeat|linear|1')).toBe(true);
  });

  it('forces linear filtering and a linear mip filter when anisotropy exceeds 1', async () => {
    // WebGPU rejects maxAnisotropy > 1 unless min/mag/mip are all linear, so a nearest+aniso request
    // collapses to the linear anisotropic key.
    const state = await createWgpuRenderStateForTest();
    const sampler = getWgpuSampler(state, 'nearest', 'clamp-to-edge', 'clamp-to-edge', undefined, 8);
    const cache = getWgpuRenderStateRuntime(state).samplerCache;
    expect(cache.get('linear|clamp-to-edge|clamp-to-edge|linear|8')).toBe(sampler);
    expect(cache.has('nearest|clamp-to-edge|clamp-to-edge|none|8')).toBe(false);
  });

  it('floors and clamps the anisotropy level into the cache key', async () => {
    const state = await createWgpuRenderStateForTest();
    const a = getWgpuSampler(state, 'linear', 'repeat', 'repeat', 'linear', 4.9);
    const b = getWgpuSampler(state, 'linear', 'repeat', 'repeat', 'linear', 4);
    expect(a).toBe(b);
    expect(getWgpuRenderStateRuntime(state).samplerCache.has('linear|repeat|repeat|linear|4')).toBe(true);
  });
});

describe('isWgpuSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWgpuSupported()).toBe(true);
  });
});
