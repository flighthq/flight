import { imageSourceFromCanvas, imageSourceFromImageBitmap, imageSourceFromImageElement } from './imageSourceFrom';

describe('imageSourceFromCanvas', () => {
  it('wraps a canvas with correct dimensions', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const source = imageSourceFromCanvas(canvas);

    expect(source.src).toBe(canvas);
    expect(source.width).toBe(320);
    expect(source.height).toBe(240);
  });

  it('reflects the canvas dimensions at wrap time', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    const source = imageSourceFromCanvas(canvas);

    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const canvas = document.createElement('canvas');
    expect(imageSourceFromCanvas(canvas)).not.toBe(imageSourceFromCanvas(canvas));
  });
});

describe('imageSourceFromImageBitmap', () => {
  it('wraps an ImageBitmap with correct dimensions', () => {
    const bitmap = { width: 64, height: 128, close: () => {} } as ImageBitmap;
    const source = imageSourceFromImageBitmap(bitmap);

    expect(source.src).toBe(bitmap);
    expect(source.width).toBe(64);
    expect(source.height).toBe(128);
  });

  it('returns a new object each call', () => {
    const bitmap = { width: 1, height: 1, close: () => {} } as ImageBitmap;
    expect(imageSourceFromImageBitmap(bitmap)).not.toBe(imageSourceFromImageBitmap(bitmap));
  });
});

describe('imageSourceFromImageElement', () => {
  it('wraps an HTMLImageElement with correct dimensions', () => {
    const img = { width: 200, height: 100 } as HTMLImageElement;
    const source = imageSourceFromImageElement(img);

    expect(source.src).toBe(img);
    expect(source.width).toBe(200);
    expect(source.height).toBe(100);
  });

  it('reflects zero dimensions for an unloaded image element', () => {
    const img = document.createElement('img');
    const source = imageSourceFromImageElement(img);

    expect(source.width).toBe(0);
    expect(source.height).toBe(0);
  });

  it('returns a new object each call', () => {
    const img = document.createElement('img');
    expect(imageSourceFromImageElement(img)).not.toBe(imageSourceFromImageElement(img));
  });
});
