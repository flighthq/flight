import { isWgpuExternalImageSourceReady } from './wgpuExternalImageSource';

describe('isWgpuExternalImageSourceReady', () => {
  it('accepts a readable canvas with enough pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(isWgpuExternalImageSourceReady(canvas, 4, 4)).toBe(true);
  });

  it('rejects zero extents and undersized sources', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(isWgpuExternalImageSourceReady(canvas, 0, 4)).toBe(false);
    expect(isWgpuExternalImageSourceReady(canvas, 5, 4)).toBe(false);
  });

  it('rejects a lost 2D canvas context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const getContext = vi
      .spyOn(canvas, 'getContext')
      .mockReturnValue({ isContextLost: () => true } as unknown as GPUCanvasContext);
    expect(isWgpuExternalImageSourceReady(canvas, 4, 4)).toBe(false);
    getContext.mockRestore();
  });

  it('rejects an undecoded image element', () => {
    const image = document.createElement('img');
    expect(isWgpuExternalImageSourceReady(image, 1, 1)).toBe(false);
  });
});
