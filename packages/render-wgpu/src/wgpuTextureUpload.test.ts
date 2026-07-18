import type { ImageResource } from '@flighthq/types';

import { uploadWgpuTextureData, uploadWgpuTextureElement, uploadWgpuTextureImageResource } from './wgpuTextureUpload';

// A device whose queue records the two upload calls so a test can assert which path ran and with what.
function makeDevice(): GPUDevice {
  return {
    queue: { writeTexture: vi.fn(), copyExternalImageToTexture: vi.fn() },
  } as unknown as GPUDevice;
}

describe('uploadWgpuTextureData', () => {
  it('drives writeTexture with a tightly-packed rgba8 layout (bytesPerRow = width*4)', () => {
    const device = makeDevice();
    const texture = {} as GPUTexture;
    const data = new Uint8ClampedArray(2 * 2 * 4);
    uploadWgpuTextureData(device, texture, [0, 0, 3], 2, 2, data);
    expect(device.queue.writeTexture).toHaveBeenCalledWith(
      { texture, origin: [0, 0, 3] },
      data,
      { bytesPerRow: 8, rowsPerImage: 2 },
      [2, 2, 1],
    );
  });
});

describe('uploadWgpuTextureElement', () => {
  it('drives copyExternalImageToTexture with the external source', () => {
    const device = makeDevice();
    const texture = {} as GPUTexture;
    const source = {} as GPUCopyExternalImageSource;
    uploadWgpuTextureElement(device, texture, [0, 0, 0], 4, 4, source);
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source },
      { texture, origin: [0, 0, 0] },
      [4, 4, 1],
    );
  });
});

describe('uploadWgpuTextureImageResource', () => {
  it('takes the element path when the resource carries a source', () => {
    const device = makeDevice();
    const texture = {} as GPUTexture;
    const image = { source: {} as CanvasImageSource, data: null, width: 4, height: 4 } as ImageResource;
    uploadWgpuTextureImageResource(device, texture, [0, 0, 0], image);
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    expect(device.queue.writeTexture).not.toHaveBeenCalled();
  });

  it('takes the raw-pixel path when the resource is data-only', () => {
    const device = makeDevice();
    const texture = {} as GPUTexture;
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const image = { source: null, data, width: 4, height: 4 } as ImageResource;
    uploadWgpuTextureImageResource(device, texture, [0, 0, 0], image);
    expect(device.queue.writeTexture).toHaveBeenCalledTimes(1);
    expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  });
});
