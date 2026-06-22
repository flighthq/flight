import {
  createWgpuRenderStateRuntime,
  destroyWgpuRenderState,
  getWgpuRenderStateRuntime,
  isWgpuSupported,
} from './webgpuRenderState';
import { createWgpuRenderStateForTest, installWgpuMock } from './webgpuTestHelper';

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

describe('isWgpuSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWgpuSupported()).toBe(true);
  });
});
