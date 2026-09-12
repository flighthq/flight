import { createBitmapFromCanvas, initializeBitmapFromCanvas } from './webBitmapFrom';

describe('createBitmapFromCanvas', () => {
  it('returns Bitmap matching the canvas size', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const data = createBitmapFromCanvas(canvas);
    expect(data.width).toBe(4);
    expect(data.height).toBe(4);
  });

  it('returns a Bitmap with data length matching canvas pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const data = createBitmapFromCanvas(canvas);
    expect(data.data.length).toBe(8 * 8 * 4);
  });

  it('returns only the requested subrectangle', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;

    const data = createBitmapFromCanvas(canvas, 2, 1, 2, 3);

    expect(data.width).toBe(2);
    expect(data.height).toBe(3);
    expect(data.data).toHaveLength(2 * 3 * 4);
  });

  it('rejects a zero-area read like a browser canvas', () => {
    const context = document.createElement('canvas').getContext('2d')!;
    const callWithTooFewArguments = context.getImageData as unknown as (...args: number[]) => ImageData;

    expect(() => callWithTooFewArguments(0, 0, 1)).toThrowError(TypeError);
    expect(() => context.getImageData(0, 0, 0, 1)).toThrowError(DOMException);
    expect(() => context.getImageData(0, 0, 1, 0)).toThrowError(DOMException);
  });
});

describe('initializeBitmapFromCanvas', () => {
  it('is the construction initializer of createBitmapFromCanvas', () => {
    expect(typeof initializeBitmapFromCanvas).toBe('function');
  });
});
