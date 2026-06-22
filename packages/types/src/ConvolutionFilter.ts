import type { BitmapFilter } from './BitmapFilter';

export interface ConvolutionFilter extends BitmapFilter {
  readonly kind: 'ConvolutionFilter';
  readonly bias?: number;
  readonly clamp?: boolean;
  readonly color?: number;
  readonly divisor?: number;
  readonly matrix: ReadonlyArray<number>;
  readonly matrixX: number;
  readonly matrixY: number;
  readonly preserveAlpha?: boolean;
}
