export type BlurFilter = {
  readonly type: 'blur';
  readonly blurX?: number;
  readonly blurY?: number;
  readonly quality?: number;
};

export type BevelFilter = {
  readonly type: 'bevel';
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly distance?: number;
  readonly highlightAlpha?: number;
  readonly highlightColor?: number;
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly shadowAlpha?: number;
  readonly shadowColor?: number;
  readonly strength?: number;
};

export type ColorMatrixFilter = {
  readonly type: 'colorMatrix';
  readonly matrix: ReadonlyArray<number>;
};

export type ConvolutionFilter = {
  readonly type: 'convolution';
  readonly bias?: number;
  readonly clamp?: boolean;
  readonly color?: number;
  readonly divisor?: number;
  readonly matrix: ReadonlyArray<number>;
  readonly matrixX: number;
  readonly matrixY: number;
  readonly preserveAlpha?: boolean;
};

export type DropShadowFilter = {
  readonly type: 'dropShadow';
  readonly alpha?: number;
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly distance?: number;
  readonly hideObject?: boolean;
  readonly inner?: boolean;
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
};

export type GlowFilter = {
  readonly type: 'glow';
  readonly alpha?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly inner?: boolean;
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
};

export type BitmapFilter =
  | BevelFilter
  | BlurFilter
  | ColorMatrixFilter
  | ConvolutionFilter
  | DropShadowFilter
  | GlowFilter;
