import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  bindWgpuScreenRenderTarget,
  createWgpuScreenRenderTarget,
  destroyWgpuScreenRenderTarget,
  endWgpuScreenRenderTargetFrame,
  initializeWgpuScreenRenderTarget,
  isWgpuScreenRenderTarget,
  syncWgpuScreenRenderTargetExtent,
} from './wgpuScreenRenderTarget';
import { createWgpuRenderStateForTest, createWgpuScreenRenderTargetForTest, installWgpuMock } from './wgpuTestHelper';
import { createWgpuTextureRenderTarget } from './wgpuTextureRenderTarget';

beforeAll(() => {
  installWgpuMock();
});

describe('bindWgpuScreenRenderTarget', () => {
  it('acquires one swap-chain view per frame and releases it at the end of the frame', async () => {
    // Nothing may hold a swap-chain view across frames — that is the property that makes a screen target
    // unsampleable — so the view is acquired inside the frame and dropped when it is submitted.
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);

    const first = bindWgpuScreenRenderTarget(state, screen);
    expect(bindWgpuScreenRenderTarget(state, screen)).toBe(first);
    expect(screen.presentationView).toBe(first);

    endWgpuScreenRenderTargetFrame(screen);
    expect(screen.presentationView).toBeNull();
  });

  it('follows a surface that resized between frames', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const screen = createWgpuScreenRenderTarget(state.device, canvas, { format: state.format });

    canvas.width = 640;
    canvas.height = 480;
    bindWgpuScreenRenderTarget(state, screen);

    expect(screen.width).toBe(640);
    expect(screen.height).toBe(480);
    expect(screen.depthStencilTexture.width).toBe(640);
  });

  it('draws into supersample storage when the target is antialiased', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state, { antialias: true }, 400, 300);

    const view = bindWgpuScreenRenderTarget(state, screen);

    expect(screen.width).toBe(800);
    expect(view).toBe(screen.antialiasView);
    expect(view).not.toBe(screen.presentationView);
    expect(screen.antialiasTexture?.width).toBe(800);
  });
});

describe('createWgpuScreenRenderTarget', () => {
  it('configures the surface context and declares one color attachment', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext('webgpu')!;
    const configure = vi.spyOn(context, 'configure');

    const screen = createWgpuScreenRenderTarget(state.device, canvas, { format: 'rgba8unorm' });

    expect(configure).toHaveBeenCalledOnce();
    expect(configure.mock.calls[0]![0].format).toBe('rgba8unorm');
    expect(screen.context).toBe(context);
    expect(screen.colorAttachments).toBe(1);
    expect(screen.format).toBe('rgba8unorm');
    expect(screen.width).toBe(800);
    expect(screen.height).toBe(600);
  });

  it('reports a surface the host cannot present rather than returning a target that cannot bind', async () => {
    const state = await createWgpuRenderStateForTest();
    const surface = { getContext: () => null, height: 100, width: 100 };

    expect(() => createWgpuScreenRenderTarget(state.device, surface)).toThrow(/cannot present WebGPU/);
  });
});

describe('destroyWgpuScreenRenderTarget', () => {
  it('frees the storage it owns and unconfigures the context', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state, { antialias: true });
    bindWgpuScreenRenderTarget(state, screen);
    const depth = vi.spyOn(screen.depthStencilTexture, 'destroy');
    const antialias = vi.spyOn(screen.antialiasTexture!, 'destroy');
    const unconfigure = vi.spyOn(screen.context, 'unconfigure');

    destroyWgpuScreenRenderTarget(screen);

    expect(depth).toHaveBeenCalledOnce();
    expect(antialias).toHaveBeenCalledOnce();
    expect(unconfigure).toHaveBeenCalledOnce();
    expect(screen.antialiasView).toBeNull();
    expect(screen.presentationView).toBeNull();
  });
});

describe('endWgpuScreenRenderTargetFrame', () => {
  it('is what a submitted frame calls, leaving no view behind', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);

    endWgpuRenderPass(beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 0] }));

    expect(screen.presentationView).toBeNull();
    expect(getWgpuRenderStateRuntime(state).frameScreenTarget).toBeNull();
  });
});

describe('initializeWgpuScreenRenderTarget', () => {
  it('is the construction initializer of createWgpuScreenRenderTarget', () => {
    expect(typeof initializeWgpuScreenRenderTarget).toBe('function');
  });
});

describe('isWgpuScreenRenderTarget', () => {
  it('separates the two realizations by the field that says where the pixels live', async () => {
    const state = await createWgpuRenderStateForTest();

    expect(isWgpuScreenRenderTarget(createWgpuScreenRenderTargetForTest(state))).toBe(true);
    expect(isWgpuScreenRenderTarget(createWgpuTextureRenderTarget(state, 16, 16))).toBe(false);
  });
});

describe('syncWgpuScreenRenderTargetExtent', () => {
  it('follows the surface without a resize call', async () => {
    const state = await createWgpuRenderStateForTest();
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const screen = createWgpuScreenRenderTarget(state.device, canvas, { format: state.format });

    canvas.width = 500;
    canvas.height = 400;
    syncWgpuScreenRenderTargetExtent(screen);

    expect(screen.width).toBe(500);
    expect(screen.height).toBe(400);
  });
});
