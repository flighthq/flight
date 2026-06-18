import { createMatrix } from '@flighthq/geometry';
import type { CanvasRenderOptions } from '@flighthq/types';

import { createCanvasRenderState } from './canvasRenderState';

describe('createCanvasRenderState', () => {
  it('creates state with a valid context and canvas', () => {
    const c = document.createElement('canvas');
    const state = createCanvasRenderState(c);
    expect(state).not.toBeNull();
    expect(state.canvas).toBe(c);
  });
});

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
  const renderer = createCanvasRenderState(canvas);

  expect(renderer).not.toBeNull();
  expect(renderer.canvas).toBe(canvas);
  expect(renderer.context.imageSmoothingEnabled).toBe(true);
  expect(renderer.context.imageSmoothingQuality).toBe('high');
  expect(renderer.contextAttributes).toEqual({
    alpha: true,
    desynchronized: false,
  });
  expect(renderer.backgroundColor).toBe(0);
  expect(renderer.pixelRatio).toBe(1);
  expect(renderer.roundPixels).toBe(false);
  expect(renderer.renderTransform2D).not.toBeNull();
});

it('should use provided options', () => {
  const options: CanvasRenderOptions = {
    backgroundColor: 0xffffff,
    pixelRatio: 2,
    roundPixels: true,
    renderTransform: createMatrix(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const renderer = createCanvasRenderState(canvas, options);

  expect(renderer.backgroundColor).toBe(0xffffff);
  expect(renderer.pixelRatio).toBe(2);
  expect(renderer.roundPixels).toBe(true);
  expect(renderer.renderTransform2D).not.toBeNull();
  expect(renderer.context.imageSmoothingEnabled).toBe(false);
  expect(renderer.context.imageSmoothingQuality).toBe('low');
});

it('should throw an error if context is not available', () => {
  canvas.getContext = vi.fn().mockReturnValue(null); // Simulate failure to get context

  expect(() => createCanvasRenderState(canvas)).toThrowError('Failed to get context for canvas.');
});

it('should default imageSmoothingEnabled to true', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.context.imageSmoothingEnabled).toBe(true);
});

it('should default imageSmoothingQuality to "high"', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.context.imageSmoothingQuality).toBe('high');
});

it('should correctly handle backgroundColor option', () => {
  const options: CanvasRenderOptions = {
    backgroundColor: 0xff0000, // Red
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.backgroundColor).toBe(0xff0000);
});

it('should use default pixelRatio if not provided', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.pixelRatio).toBe(1);
});

it('should handle custom pixelRatio correctly', () => {
  const options: CanvasRenderOptions = {
    pixelRatio: 2,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.pixelRatio).toBe(2);
});

it('should default roundPixels to false', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.roundPixels).toBe(false);
});

it('should correctly handle roundPixels option', () => {
  const options: CanvasRenderOptions = {
    roundPixels: true,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.roundPixels).toBe(true);
});

it('should handle worldTransform option correctly', () => {
  const customTransform = createMatrix();
  const options: CanvasRenderOptions = {
    renderTransform: customTransform,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.renderTransform2D).toBe(customTransform);
});

it('should fall back to default Matrix if worldTransform is not provided', () => {
  const renderer = createCanvasRenderState(canvas);
  expect(renderer.renderTransform2D).not.toBeNull();
});

// Check if contextAttributes are passed and correctly retrieved
it('should retrieve contextAttributes from the context', () => {
  const renderer = createCanvasRenderState(canvas);

  expect(renderer.contextAttributes).toEqual({
    alpha: true,
    desynchronized: false,
  });
});

// Ensure options with missing properties are handled gracefully
it('should handle missing imageSmoothingQuality and imageSmoothingEnabled in options', () => {
  const options: CanvasRenderOptions = {
    imageSmoothingEnabled: undefined,
    imageSmoothingQuality: undefined,
  };

  const renderer = createCanvasRenderState(canvas, options);
  expect(renderer.context.imageSmoothingEnabled).toBe(true);
  expect(renderer.context.imageSmoothingQuality).toBe('high');
});
