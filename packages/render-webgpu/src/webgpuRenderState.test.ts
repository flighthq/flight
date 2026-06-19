import {
  createWebGPURenderStateRuntime,
  destroyWebGPURenderState,
  getWebGPURenderStateRuntime,
  isWebGPUSupported,
} from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPURenderState', () => {
  it('returns a render state with device and context', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(state.device).toBeDefined();
    expect(state.context).toBeDefined();
  });

  it('sets allowSmoothing to true by default', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(state.allowSmoothing).toBe(true);
  });

  it('initialises uniform ring buffer', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    expect(runtime.uniformBuffer).toBeDefined();
    expect(runtime.uniformData).toBeInstanceOf(Float32Array);
    expect(runtime.uniformOffset).toBe(0);
  });

  it('stores the canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(state.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('starts with null renderPass and commandEncoder', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    expect(runtime.renderPass).toBeNull();
    expect(runtime.commandEncoder).toBeNull();
  });
});

describe('createWebGPURenderStateRuntime', () => {
  it('returns a runtime carrying the base entity-runtime binding slot', () => {
    const runtime = createWebGPURenderStateRuntime();
    expect(runtime.binding).toBeNull();
  });
});

describe('destroyWebGPURenderState', () => {
  it('destroys the state-owned uniform buffer', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    const destroy = vi.spyOn(runtime.uniformBuffer, 'destroy');

    destroyWebGPURenderState(state);

    expect(destroy).toHaveBeenCalled();
  });

  it('does not throw on a fresh state with no lazily-created buffers', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(() => destroyWebGPURenderState(state)).not.toThrow();
  });
});

describe('getWebGPURenderStateRuntime', () => {
  it('returns the runtime attached by createWebGPURenderState', async () => {
    const state = await createWebGPURenderStateForTest();
    const runtime = getWebGPURenderStateRuntime(state);
    expect(runtime).toBeDefined();
    expect(runtime.uniformBuffer).toBeDefined();
  });

  it('resolves the same runtime object on repeated calls', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(getWebGPURenderStateRuntime(state)).toBe(getWebGPURenderStateRuntime(state));
  });
});

describe('isWebGPUSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWebGPUSupported()).toBe(true);
  });
});
