import { createWebHostWgpuContext, initializeWebHostWgpuContext } from './webHostWgpuContext';
import { createWebSurfaceFromElement } from './webSurfaceHandle';

function installMinimalWgpuMock(): void {
  if (globalThis.navigator == null) {
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  }
  Object.defineProperty(globalThis.navigator, 'gpu', {
    value: {
      getPreferredCanvasFormat: () => 'bgra8unorm',
      requestAdapter: () =>
        Promise.resolve({
          features: new Set(),
          limits: { maxBindGroups: 8 },
          requestDevice: () =>
            Promise.resolve({
              destroy: vi.fn(),
              features: new Set(),
              limits: { maxTextureDimension2D: 8192 },
            }),
        }),
    } as unknown as GPU,
    configurable: true,
    writable: true,
  });

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ) {
    if (contextId === 'webgpu') {
      return { configure: vi.fn(), getCurrentTexture: vi.fn(), unconfigure: vi.fn() } as unknown as GPUCanvasContext;
    }
    return (origGetContext as Function).call(this, contextId, options);
  };

  const g = globalThis as Record<string, unknown>;
  if (!g['GPUTextureUsage']) {
    g['GPUTextureUsage'] = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  }
}

beforeAll(installMinimalWgpuMock);
describe('createWebHostWgpuContext', () => {
  it('returns an entity that can acquire a WebGPU device through a surface', async () => {
    const context = createWebHostWgpuContext();
    const canvas = document.createElement('canvas');
    const target = createWebSurfaceFromElement(canvas);
    const acquisition = await context.acquire(target, {});

    expect(acquisition.device).toBeDefined();
    expect(acquisition.format).toBe('bgra8unorm');
    expect(acquisition.ownership).toBe('flight');
    expect(acquisition.surface).toBe(canvas);

    context.release(acquisition);
  });

  it('reports WebGPU support through isSupported', () => {
    expect(createWebHostWgpuContext().isSupported()).toBe(true);
  });

  it('returns null from attachSurface when the surface is not backed by a canvas', () => {
    const context = createWebHostWgpuContext();
    const unregisteredSurface = createWebSurfaceFromElement(document.createElement('div'));

    expect(
      context.attachSurface(unregisteredSurface, {
        alphaMode: 'premultiplied',
        device: {} as GPUDevice,
        format: 'bgra8unorm',
      }),
    ).toBeNull();
  });
});

describe('initializeWebHostWgpuContext', () => {
  it('is the construction initializer of createWebHostWgpuContext', () => {
    expect(typeof initializeWebHostWgpuContext).toBe('function');
  });
});
