export type BevelFilter = {
  readonly type: 'bevel';
  readonly angle?: number;
  readonly bevelType?: 'full' | 'inner' | 'outer';
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

export type BlurFilter = {
  readonly type: 'blur';
  readonly blurX?: number;
  readonly blurY?: number;
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

export type DisplacementMapMode = 'clamp' | 'color' | 'ignore' | 'wrap';

export type DisplacementMapFilter = {
  readonly type: 'displacementMap';
  /** Fill alpha (0..1) used when mode is 'color'. Default 0. */
  readonly alpha?: number;
  /** Packed RGB fill used when mode is 'color'. Default 0. */
  readonly color?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of the displacement map that drives X offset. Default 0. */
  readonly componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of the displacement map that drives Y offset. Default 1. */
  readonly componentY?: number;
  /** How to handle sample positions that fall outside the source. Default 'wrap'. */
  readonly mode?: DisplacementMapMode;
  /** X displacement scale. A map value of 128 is neutral (no shift). Default 0. */
  readonly scaleX?: number;
  /** Y displacement scale. Default 0. */
  readonly scaleY?: number;
};

export type DropShadowFilter = {
  readonly type: 'dropShadow';
  readonly alpha?: number;
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly distance?: number;
  /** Render the shadow only, hiding the source object. */
  readonly hideObject?: boolean;
  /** Composite only the shadow, omitting the source from the output. */
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
};

export type GradientBevelFilter = {
  readonly type: 'gradientBevel';
  readonly alphas: ReadonlyArray<number>;
  readonly angle?: number;
  readonly bevelType?: 'full' | 'inner' | 'outer';
  readonly blurX?: number;
  readonly blurY?: number;
  readonly colors: ReadonlyArray<number>;
  readonly distance?: number;
  readonly quality?: number;
  readonly ratios: ReadonlyArray<number>;
  readonly strength?: number;
};

export type GradientGlowFilter = {
  readonly type: 'gradientGlow';
  readonly alphas: ReadonlyArray<number>;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly colors: ReadonlyArray<number>;
  readonly quality?: number;
  readonly ratios: ReadonlyArray<number>;
  readonly strength?: number;
};

export type InnerGlowFilter = {
  readonly type: 'innerGlow';
  readonly alpha?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly quality?: number;
  readonly strength?: number;
};

export type InnerShadowFilter = {
  readonly type: 'innerShadow';
  readonly alpha?: number;
  readonly angle?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  readonly distance?: number;
  readonly quality?: number;
  readonly strength?: number;
};

export type MedianFilter = {
  readonly type: 'median';
  readonly radius?: number;
};

export type OuterGlowFilter = {
  readonly type: 'outerGlow';
  readonly alpha?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly color?: number;
  /** Composite only the glow, omitting the source from the output. */
  readonly knockout?: boolean;
  readonly quality?: number;
  readonly strength?: number;
};

export type PixelateFilter = {
  readonly type: 'pixelate';
  readonly blockSize?: number;
};

export type SharpenFilter = {
  readonly type: 'sharpen';
  readonly amount?: number;
  readonly blurX?: number;
  readonly blurY?: number;
  readonly quality?: number;
};

export type BitmapFilter =
  | BevelFilter
  | BlurFilter
  | ColorMatrixFilter
  | ConvolutionFilter
  | DisplacementMapFilter
  | DropShadowFilter
  | GradientBevelFilter
  | GradientGlowFilter
  | InnerGlowFilter
  | InnerShadowFilter
  | MedianFilter
  | OuterGlowFilter
  | PixelateFilter
  | SharpenFilter;
