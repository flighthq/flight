import { Matrix2D } from '@flighthq/math';

import type { CanvasRendererOptions } from './CanvasRendererOptions';

export default class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly contextAttributes: CanvasRenderingContext2DSettings;

  backgroundColor: number | null;
  pixelRatio: number;
  roundPixels: boolean;
  worldTransform: Matrix2D;

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;

    const context = canvas.getContext('2d', options?.contextAttributes || undefined);
    if (!context) throw new Error('Failed to get context for canvas.');
    this.context = context;
    this.context.imageSmoothingEnabled = options?.imageSmoothingEnabled ?? true;
    this.context.imageSmoothingQuality = options?.imageSmoothingQuality ?? 'high';

    this.contextAttributes = this.context.getContextAttributes();

    this.backgroundColor = options?.backgroundColor ?? null;
    this.pixelRatio = options?.pixelRatio ?? window.devicePixelRatio | 1;
    this.roundPixels = options?.roundPixels ?? false;
    this.worldTransform = options?.worldTransform ?? new Matrix2D();
  }

  // Get & Set Methods

  get imageSmoothingEnabled(): boolean {
    return this.context?.imageSmoothingEnabled ?? false;
  }

  set imageSmoothingEnabled(value: boolean) {
    if (this.context !== null) this.context.imageSmoothingEnabled = value;
  }

  get imageSmoothingQuality(): ImageSmoothingQuality {
    return this.context?.imageSmoothingQuality ?? 'high';
  }

  set imageSmoothingQuality(value: ImageSmoothingQuality) {
    if (this.context !== null) this.context.imageSmoothingQuality = value;
  }
}
