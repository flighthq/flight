import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import { enableWgpuScreenRenderTargetAntialias } from './wgpuScreenAntialias';
import { bindWgpuScreenRenderTarget } from './wgpuScreenRenderTarget';
import { createWgpuRenderStateForTest, createWgpuScreenRenderTargetForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('enableWgpuScreenRenderTargetAntialias', () => {
  // ★ THE COST IS OPT-IN, AND THAT IS THE POINT OF THE SLOTS. A screen target that was never asked for
  // antialiasing carries no resolve hook, so the module holding the resolve pipeline and its shader is
  // unreachable from an ordinary frame loop and tree-shakes out of the bundle entirely.
  it('installs the hooks a plain screen target does not carry', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);

    expect(screen.antialias).toBe(false);
    expect(screen.acquireAntialiasView).toBeNull();
    expect(screen.encodeAntialiasResolve).toBeNull();

    enableWgpuScreenRenderTargetAntialias(screen);

    expect(screen.antialias).toBe(true);
    expect(screen.acquireAntialiasView).not.toBeNull();
    expect(screen.encodeAntialiasResolve).not.toBeNull();
  });

  it('draws into supersample storage twice the surface extent', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state, { antialias: true }, 400, 300);

    const view = bindWgpuScreenRenderTarget(state, screen);

    expect(screen.width).toBe(800);
    expect(view).toBe(screen.antialiasView);
    expect(view).not.toBe(screen.presentationView);
    expect(screen.antialiasTexture?.width).toBe(800);
  });

  it('resolves the supersample texture into the presentation view', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state, { antialias: true });
    const pass = beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 0] });
    const presentationView = screen.presentationView;
    const encoded: GPURenderPassDescriptor[] = [];
    const encoder = {
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => {
        encoded.push(descriptor);
        return { draw: () => {}, end: () => {}, setBindGroup: () => {}, setPipeline: () => {} };
      },
    } as unknown as GPUCommandEncoder;

    screen.encodeAntialiasResolve!(state, screen, encoder);

    expect(encoded.length).toBe(1);
    expect(Array.from(encoded[0]!.colorAttachments)[0]!.view).toBe(presentationView);
    endWgpuRenderPass(pass);
  });
});
