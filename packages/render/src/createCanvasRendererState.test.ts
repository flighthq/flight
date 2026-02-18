import { matrix3x2 } from '@flighthq/math';
import type { CanvasRendererOptions } from '@flighthq/types';

import { createCanvasRendererState } from './createCanvasRendererState';

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
  const renderer = createCanvasRendererState(canvas);

  expect(renderer).not.toBeNull();
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
  expect(renderer.renderTransform).not.toBeNull();
});

it('should use provided options', () => {
  const options: CanvasRendererOptions = {
    backgroundColor: 0xffffff,
    pixelRatio: 2,
    roundPixels: true,
    renderTransform: matrix3x2.create(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const renderer = createCanvasRendererState(canvas, options);

  expect(renderer.backgroundColor).toBe(0xffffff);
  expect(renderer.pixelRatio).toBe(2);
  expect(renderer.roundPixels).toBe(true);
  expect(renderer.renderTransform).not.toBeNull();
  expect(renderer.context.imageSmoothingEnabled).toBe(false);
  expect(renderer.context.imageSmoothingQuality).toBe('low');
});

it('should throw an error if context is not available', () => {
  canvas.getContext = vi.fn().mockReturnValue(null); // Simulate failure to get context

  expect(() => createCanvasRendererState(canvas)).toThrowError('Failed to get context for canvas.');
});

it('should default imageSmoothingEnabled to true', () => {
  const renderer = createCanvasRendererState(canvas);

  expect(renderer.context.imageSmoothingEnabled).toBe(true);
});

it('should default imageSmoothingQuality to "high"', () => {
  const renderer = createCanvasRendererState(canvas);

  expect(renderer.context.imageSmoothingQuality).toBe('high');
});

it('should correctly handle backgroundColor option', () => {
  const options: CanvasRendererOptions = {
    backgroundColor: 0xff0000, // Red
  };

  const renderer = createCanvasRendererState(canvas, options);
  expect(renderer.backgroundColor).toBe(0xff0000);
});

it('should use default pixelRatio if not provided', () => {
  const renderer = createCanvasRendererState(canvas);
  expect(renderer.pixelRatio).toBe(window.devicePixelRatio);
});

it('should handle custom pixelRatio correctly', () => {
  const options: CanvasRendererOptions = {
    pixelRatio: 2,
  };

  const renderer = createCanvasRendererState(canvas, options);
  expect(renderer.pixelRatio).toBe(2);
});

it('should default roundPixels to false', () => {
  const renderer = createCanvasRendererState(canvas);
  expect(renderer.roundPixels).toBe(false);
});

it('should correctly handle roundPixels option', () => {
  const options: CanvasRendererOptions = {
    roundPixels: true,
  };

  const renderer = createCanvasRendererState(canvas, options);
  expect(renderer.roundPixels).toBe(true);
});

it('should handle worldTransform option correctly', () => {
  const customTransform = matrix3x2.create();
  const options: CanvasRendererOptions = {
    renderTransform: customTransform,
  };

  const renderer = createCanvasRendererState(canvas, options);
  expect(renderer.renderTransform).toBe(customTransform);
});

it('should fall back to default Matrix3x2 if worldTransform is not provided', () => {
  const renderer = createCanvasRendererState(canvas);
  expect(renderer.renderTransform).not.toBeNull();
});

// Check if contextAttributes are passed and correctly retrieved
it('should retrieve contextAttributes from the context', () => {
  const renderer = createCanvasRendererState(canvas);

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

  const renderer = createCanvasRendererState(canvas, options);
  expect(renderer.context.imageSmoothingEnabled).toBe(true);
  expect(renderer.context.imageSmoothingQuality).toBe('high');
});
