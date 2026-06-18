import { destroyWebGPURenderState, isWebGPUSupported } from './webgpuRenderState';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPURenderState', () => {
  it('returns a render state with device and context', async () => {
    const state = await createWebGPURenderStateForTest();
    expect((state as never as { device: unknown }).device).toBeDefined();
    expect((state as never as { context: unknown }).context).toBeDefined();
  });

  it('sets allowSmoothing to true by default', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(state.allowSmoothing).toBe(true);
  });

  it('initialises uniform ring buffer', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as never as { uniformBuffer: unknown; uniformData: Float32Array; uniformOffset: number };
    expect(internal.uniformBuffer).toBeDefined();
    expect(internal.uniformData).toBeInstanceOf(Float32Array);
    expect(internal.uniformOffset).toBe(0);
  });

  it('stores the canvas', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(state.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('starts with null renderPass and commandEncoder', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as never as { renderPass: unknown; commandEncoder: unknown };
    expect(internal.renderPass).toBeNull();
    expect(internal.commandEncoder).toBeNull();
  });
});

describe('destroyWebGPURenderState', () => {
  it('destroys the state-owned uniform buffer', async () => {
    const state = await createWebGPURenderStateForTest();
    const internal = state as never as { uniformBuffer: GPUBuffer };
    const destroy = vi.spyOn(internal.uniformBuffer, 'destroy');

    destroyWebGPURenderState(state);

    expect(destroy).toHaveBeenCalled();
  });

  it('does not throw on a fresh state with no lazily-created buffers', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(() => destroyWebGPURenderState(state)).not.toThrow();
  });
});

describe('isWebGPUSupported', () => {
  it('returns true when navigator.gpu is present', () => {
    expect(isWebGPUSupported()).toBe(true);
  });
});
