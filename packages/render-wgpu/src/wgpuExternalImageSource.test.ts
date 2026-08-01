import { isWgpuExternalImageSourceReady, tryCopyWgpuExternalImageToTexture } from './wgpuExternalImageSource';
import { createReadyImageElementForTest } from './wgpuTestHelper';

describe('isWgpuExternalImageSourceReady', () => {
  it('accepts a dimension-valid canvas without probing or binding its context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const getContext = vi.spyOn(canvas, 'getContext');
    expect(isWgpuExternalImageSourceReady(canvas, 4, 4)).toBe(true);
    expect(getContext).not.toHaveBeenCalled();
  });

  it('accepts a decoded image with enough pixels', () => {
    const image = createReadyImageElementForTest(4, 4);
    expect(isWgpuExternalImageSourceReady(image, 4, 4)).toBe(true);
  });

  it('rejects zero extents and undersized sources', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(isWgpuExternalImageSourceReady(canvas, 0, 4)).toBe(false);
    expect(isWgpuExternalImageSourceReady(canvas, 5, 4)).toBe(false);
  });

  it('rejects an undecoded image element', () => {
    const image = document.createElement('img');
    expect(isWgpuExternalImageSourceReady(image, 1, 1)).toBe(false);
  });

  it('rejects an unrecognized source instead of failing open', () => {
    expect(isWgpuExternalImageSourceReady({} as GPUCopyExternalImageSource, 1, 1)).toBe(false);
  });
});

describe('tryCopyWgpuExternalImageToTexture', () => {
  it('copies a ready source', () => {
    const copyExternalImageToTexture = vi.fn();
    const queue = { copyExternalImageToTexture } as unknown as GPUQueue;
    const texture = {} as GPUTexture;
    const source = createReadyImageElementForTest(4, 4);
    expect(tryCopyWgpuExternalImageToTexture(queue, { source }, { texture }, 4, 4)).toBe(true);
    expect(copyExternalImageToTexture).toHaveBeenCalledWith({ source }, { texture }, [4, 4, 1]);
  });

  it('fails closed when a canvas has no usable context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const copyExternalImageToTexture = vi.fn(() => {
      throw new DOMException('canvas has no rendering context', 'OperationError');
    });
    const queue = { copyExternalImageToTexture } as unknown as GPUQueue;
    expect(tryCopyWgpuExternalImageToTexture(queue, { source: canvas }, { texture: {} as GPUTexture }, 4, 4)).toBe(
      false,
    );
  });

  it('fails closed when the browser cannot snapshot current canvas content', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const copyExternalImageToTexture = vi.fn(() => {
      throw new TypeError(
        "Failed to execute 'copyExternalImageToTexture' on 'GPUQueue': Failed to copy content from external image.",
      );
    });
    const queue = { copyExternalImageToTexture } as unknown as GPUQueue;
    expect(tryCopyWgpuExternalImageToTexture(queue, { source: canvas }, { texture: {} as GPUTexture }, 4, 4)).toBe(
      false,
    );
  });

  it('rethrows security failures', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const error = new DOMException('tainted canvas', 'SecurityError');
    const queue = {
      copyExternalImageToTexture: vi.fn(() => {
        throw error;
      }),
    } as unknown as GPUQueue;
    expect(() =>
      tryCopyWgpuExternalImageToTexture(queue, { source: canvas }, { texture: {} as GPUTexture }, 4, 4),
    ).toThrow(error);
  });
});
