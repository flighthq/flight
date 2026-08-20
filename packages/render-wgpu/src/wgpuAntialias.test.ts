import type { WgpuRenderTarget } from '@flighthq/types/contract';

import {
  acquireWgpuSurfaceAntialiasView,
  clearWgpuSurfacePresentation,
  encodeWgpuSurfaceAntialiasResolve,
  getWgpuSurfaceRenderExtent,
  getWgpuSurfaceRenderScale,
} from './wgpuAntialias';
import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import { setWgpuRenderPassScissorRect } from './wgpuScissor';
import { enableWgpuFrameCapture } from './wgpuSurface';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('acquireWgpuSurfaceAntialiasView', () => {
  it('returns and retains a 2x render view when the option is enabled', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    const presentationView = state.context.getCurrentTexture().createView();

    const view = acquireWgpuSurfaceAntialiasView(state, presentationView);

    expect(view).toBe(getWgpuRenderStateRuntime(state).surfaceAntialiasView);
    expect(getWgpuRenderStateRuntime(state).surfacePresentationView).toBe(presentationView);
  });
});

describe('clearWgpuSurfacePresentation', () => {
  it('drops the per-frame presentation view without destroying reusable resolve resources', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    acquireWgpuSurfaceAntialiasView(state, state.context.getCurrentTexture().createView());
    const runtime = getWgpuRenderStateRuntime(state);
    const texture = runtime.surfaceAntialiasTexture;

    clearWgpuSurfacePresentation(state);

    expect(runtime.surfacePresentationView).toBeNull();
    expect(runtime.surfaceAntialiasTexture).toBe(texture);
  });
});

describe('encodeWgpuSurfaceAntialiasResolve', () => {
  it('draws one fullscreen triangle into the retained presentation view', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    acquireWgpuSurfaceAntialiasView(state, state.context.getCurrentTexture().createView());
    const draw = vi.fn();
    const beginRenderPass = vi.fn(() => ({
      draw,
      end: () => {},
      setBindGroup: () => {},
      setPipeline: () => {},
    }));

    encodeWgpuSurfaceAntialiasResolve(state, { beginRenderPass } as unknown as GPUCommandEncoder);

    expect(beginRenderPass).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenCalledWith(3);
  });
});

describe('getWgpuSurfaceRenderExtent', () => {
  it('switches from the logical canvas extent to the acquired supersample extent', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    expect(getWgpuSurfaceRenderExtent(state)).toEqual({ width: 800, height: 600 });

    acquireWgpuSurfaceAntialiasView(state, state.context.getCurrentTexture().createView());

    expect(getWgpuSurfaceRenderExtent(state)).toEqual({ width: 1600, height: 1200 });
  });
});

describe('getWgpuSurfaceRenderScale', () => {
  it('scales only the acquired main surface', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    acquireWgpuSurfaceAntialiasView(state, state.context.getCurrentTexture().createView());
    const runtime = getWgpuRenderStateRuntime(state);

    expect(getWgpuSurfaceRenderScale(state)).toBe(2);
    runtime.currentRenderTarget = {} as WgpuRenderTarget;
    expect(getWgpuSurfaceRenderScale(state)).toBe(1);
  });
});

describe('WgpuRenderOptions.antialias', () => {
  it('leaves the direct presentation path and all resolve resources off by default', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const { encoder, setViewport } = installRecordingEncoder(state);

    renderWgpuBackground(state);

    expect(runtime.surfaceAntialiasEnabled).toBe(false);
    expect(runtime.surfaceAntialiasTexture).toBeNull();
    expect(runtime.surfaceAntialiasResolvePipeline).toBeNull();
    expect(runtime.surfacePresentationView).toBeNull();
    expect(setViewport).toHaveBeenCalledWith(0, 0, 800, 600, 0, 1);
    expect(encoder.beginRenderPass).toHaveBeenCalledTimes(1);
  });

  it('renders the main pass into a 2x surface while preserving logical canvas coordinates', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    const runtime = getWgpuRenderStateRuntime(state);
    const { setViewport } = installRecordingEncoder(state);

    renderWgpuBackground(state);

    expect(runtime.surfaceAntialiasTexture?.width).toBe(1600);
    expect(runtime.surfaceAntialiasTexture?.height).toBe(1200);
    expect(runtime.depthStencilWidth).toBe(1600);
    expect(runtime.depthStencilHeight).toBe(1200);
    expect(runtime.renderTargetViewport).toBeNull();
    expect(runtime.surfacePresentationView).not.toBeNull();
    expect(setViewport).toHaveBeenCalledWith(0, 0, 1600, 1200, 0, 1);
  });

  it('encodes one fullscreen resolve before frame-capture readback', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    const events: string[] = [];
    let passIndex = 0;
    const encoder = {
      beginRenderPass: vi.fn(() => {
        const name = passIndex++ === 0 ? 'main' : 'resolve';
        events.push(`${name}:begin`);
        return {
          draw: (vertices: number) => events.push(`${name}:draw:${vertices}`),
          end: () => events.push(`${name}:end`),
          setBindGroup: () => {},
          setPipeline: () => {},
          setScissorRect: () => {},
          setStencilReference: () => {},
          setViewport: () => {},
        } as unknown as GPURenderPassEncoder;
      }),
      copyTextureToBuffer: () => events.push('capture:copy'),
      finish: () => {
        events.push('encoder:finish');
        return {} as GPUCommandBuffer;
      },
    } as unknown as GPUCommandEncoder;
    vi.spyOn(state.device, 'createCommandEncoder').mockReturnValue(encoder);
    enableWgpuFrameCapture(state);

    renderWgpuBackground(state);
    submitWgpuRenderPass(state);

    expect(events).toEqual([
      'main:begin',
      'main:end',
      'resolve:begin',
      'resolve:draw:3',
      'resolve:end',
      'capture:copy',
      'encoder:finish',
    ]);
    expect(getWgpuRenderStateRuntime(state).surfacePresentationView).toBeNull();
  });

  it('reallocates the supersample surface when the canvas size changes', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const first = runtime.surfaceAntialiasTexture!;
    const destroy = vi.spyOn(first, 'destroy');
    submitWgpuRenderPass(state);

    state.canvas.width = 400;
    state.canvas.height = 300;
    renderWgpuBackground(state);

    expect(destroy).toHaveBeenCalledOnce();
    expect(runtime.surfaceAntialiasTexture).not.toBe(first);
    expect(runtime.surfaceAntialiasTexture?.width).toBe(800);
    expect(runtime.surfaceAntialiasTexture?.height).toBe(600);
  });

  it('scales main-surface scissors but leaves offscreen-target scissors unchanged', async () => {
    const state = await createWgpuRenderStateForTest({ antialias: true });
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const setScissorRect = vi.fn();
    const pass = { setScissorRect } as unknown as GPURenderPassEncoder;

    setWgpuRenderPassScissorRect(state, pass, 3, 5, 7, 11);
    expect(setScissorRect).toHaveBeenLastCalledWith(6, 10, 14, 22);

    runtime.currentRenderTarget = {} as WgpuRenderTarget;
    setWgpuRenderPassScissorRect(state, pass, 3, 5, 7, 11);
    expect(setScissorRect).toHaveBeenLastCalledWith(3, 5, 7, 11);
  });
});

function installRecordingEncoder(state: { device: GPUDevice }): {
  encoder: GPUCommandEncoder & { beginRenderPass: ReturnType<typeof vi.fn> };
  setViewport: ReturnType<typeof vi.fn>;
} {
  const setViewport = vi.fn();
  const pass = {
    draw: () => {},
    end: () => {},
    setBindGroup: () => {},
    setPipeline: () => {},
    setScissorRect: () => {},
    setStencilReference: () => {},
    setViewport,
  } as unknown as GPURenderPassEncoder;
  const beginRenderPass = vi.fn(() => pass);
  const encoder = {
    beginRenderPass,
    finish: () => ({}) as GPUCommandBuffer,
  } as unknown as GPUCommandEncoder & { beginRenderPass: ReturnType<typeof vi.fn> };
  vi.spyOn(state.device, 'createCommandEncoder').mockReturnValue(encoder);
  return { encoder, setViewport };
}
