import type { ImageResource } from '@flighthq/types/contract';

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
    const source = document.createElement('canvas');
    source.width = 4;
    source.height = 4;
    uploadWgpuTextureElement(device, texture, [0, 0, 0], 4, 4, source);
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source },
      { texture, origin: [0, 0, 0] },
      [4, 4, 1],
    );
  });

  it('skips a copy with a zero-sized extent', () => {
    const device = makeDevice();
    const source = document.createElement('canvas');
    source.width = 4;
    source.height = 4;
    uploadWgpuTextureElement(device, {} as GPUTexture, [0, 0, 0], 0, 4, source);
    expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  });

  it('skips a copy when the browser cannot snapshot the source', () => {
    const device = makeDevice();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    vi.mocked(device.queue.copyExternalImageToTexture).mockImplementation(() => {
      throw new TypeError('Failed to copy content from external image.');
    });
    expect(() => uploadWgpuTextureElement(device, {} as GPUTexture, [0, 0, 0], 4, 4, canvas)).not.toThrow();
  });
});

describe('uploadWgpuTextureImageResource', () => {
  it('takes the element path when the resource carries a source', () => {
    const device = makeDevice();
    const texture = {} as GPUTexture;
    const source = document.createElement('canvas');
    source.width = 4;
    source.height = 4;
    const image = { source, width: 4, height: 4 } as unknown as ImageResource;
    uploadWgpuTextureImageResource(device, texture, [0, 0, 0], image);
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    expect(device.queue.writeTexture).not.toHaveBeenCalled();
  });
});
