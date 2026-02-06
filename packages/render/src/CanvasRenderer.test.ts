import { Matrix3 } from '@flighthq/math';

import CanvasRenderer from './CanvasRenderer';
import type { CanvasRendererOptions } from './CanvasRendererOptions';

describe('CanvasRenderer', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    // Mock canvas and context for testing
    canvas = document.createElement('canvas');
    const mockContext = {
      getContextAttributes: vi.fn().mockReturnValue({
        alpha: true,
        desynchronized: false,
      }),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    } as unknown as CanvasRenderingContext2D;
    canvas.getContext = vi.fn().mockReturnValue(mockContext);
  });

  it('should be instantiated with default options', () => {
    const renderer = new CanvasRenderer(canvas);

    expect(renderer).toBeInstanceOf(CanvasRenderer);
    expect(renderer.canvas).toBe(canvas);
    expect(renderer.context.imageSmoothingEnabled).toBe(true);
    expect(renderer.context.imageSmoothingQuality).toBe('high');
    expect(renderer.contextAttributes).toEqual({
      alpha: true,
      desynchronized: false,
    });
    expect(renderer.backgroundColor).toBe(0);
    expect(renderer.pixelRatio).toBe(window.devicePixelRatio);
    expect(renderer.roundPixels).toBe(false);
    expect(renderer.renderTransform).toBeInstanceOf(Matrix3);
  });

  it('should use provided options', () => {
    const options: CanvasRendererOptions = {
      backgroundColor: 0xffffff,
      pixelRatio: 2,
      roundPixels: true,
      renderTransform: new Matrix3(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };

    const renderer = new CanvasRenderer(canvas, options);

    expect(renderer.backgroundColor).toBe(0xffffff);
    expect(renderer.pixelRatio).toBe(2);
    expect(renderer.roundPixels).toBe(true);
    expect(renderer.renderTransform).toBeInstanceOf(Matrix3);
    expect(renderer.imageSmoothingEnabled).toBe(false);
    expect(renderer.imageSmoothingQuality).toBe('low');
  });

  it('should throw an error if context is not available', () => {
    canvas.getContext = vi.fn().mockReturnValue(null); // Simulate failure to get context

    expect(() => new CanvasRenderer(canvas)).toThrowError('Failed to get context for canvas.');
  });

  it('should default imageSmoothingEnabled to true', () => {
    const renderer = new CanvasRenderer(canvas);

    expect(renderer.imageSmoothingEnabled).toBe(true);
  });

  it('should set imageSmoothingEnabled correctly', () => {
    const renderer = new CanvasRenderer(canvas);
    renderer.imageSmoothingEnabled = false;

    expect(renderer.imageSmoothingEnabled).toBe(false);
    expect(renderer.context.imageSmoothingEnabled).toBe(false);
  });

  it('should default imageSmoothingQuality to "high"', () => {
    const renderer = new CanvasRenderer(canvas);

    expect(renderer.imageSmoothingQuality).toBe('high');
  });

  it('should set imageSmoothingQuality correctly', () => {
    const renderer = new CanvasRenderer(canvas);
    renderer.imageSmoothingQuality = 'low';

    expect(renderer.imageSmoothingQuality).toBe('low');
    expect(renderer.context.imageSmoothingQuality).toBe('low');
  });

  it('should correctly handle backgroundColor option', () => {
    const options: CanvasRendererOptions = {
      backgroundColor: 0xff0000, // Red
    };

    const renderer = new CanvasRenderer(canvas, options);
    expect(renderer.backgroundColor).toBe(0xff0000);
  });

  it('should use default pixelRatio if not provided', () => {
    const renderer = new CanvasRenderer(canvas);
    expect(renderer.pixelRatio).toBe(window.devicePixelRatio);
  });

  it('should handle custom pixelRatio correctly', () => {
    const options: CanvasRendererOptions = {
      pixelRatio: 2,
    };

    const renderer = new CanvasRenderer(canvas, options);
    expect(renderer.pixelRatio).toBe(2);
  });

  it('should default roundPixels to false', () => {
    const renderer = new CanvasRenderer(canvas);
    expect(renderer.roundPixels).toBe(false);
  });

  it('should correctly handle roundPixels option', () => {
    const options: CanvasRendererOptions = {
      roundPixels: true,
    };

    const renderer = new CanvasRenderer(canvas, options);
    expect(renderer.roundPixels).toBe(true);
  });

  it('should handle worldTransform option correctly', () => {
    const customTransform = new Matrix3();
    const options: CanvasRendererOptions = {
      renderTransform: customTransform,
    };

    const renderer = new CanvasRenderer(canvas, options);
    expect(renderer.renderTransform).toBe(customTransform);
  });

  it('should fall back to default Matrix3 if worldTransform is not provided', () => {
    const renderer = new CanvasRenderer(canvas);
    expect(renderer.renderTransform).toBeInstanceOf(Matrix3);
  });

  // Check if contextAttributes are passed and correctly retrieved
  it('should retrieve contextAttributes from the context', () => {
    const renderer = new CanvasRenderer(canvas);

    expect(renderer.contextAttributes).toEqual({
      alpha: true,
      desynchronized: false,
    });
  });

  // Ensure options with missing properties are handled gracefully
  it('should handle missing imageSmoothingQuality and imageSmoothingEnabled in options', () => {
    const options: CanvasRendererOptions = {
      imageSmoothingEnabled: undefined,
      imageSmoothingQuality: undefined,
    };

    const renderer = new CanvasRenderer(canvas, options);
    expect(renderer.imageSmoothingEnabled).toBe(true);
    expect(renderer.imageSmoothingQuality).toBe('high');
  });
});
