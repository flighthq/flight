import type { ImageSource } from './ImageSource';
import type { Matrix3x2 } from './Matrix3x2';

export type CapsStyle = 'none' | 'round' | 'square';

export type GradientType = 'linear' | 'radial';

export type GraphicsPathWinding = 'evenOdd' | 'nonZero';

export type InterpolationMethod = 'linearRGB' | 'rgb';

export type JointStyle = 'bevel' | 'miter' | 'round';

export type LineScaleMode = 'horizontal' | 'none' | 'normal' | 'vertical';

export type SpreadMethod = 'pad' | 'reflect' | 'repeat';

// Maps command key strings to their argument tuples. May be extended via declaration merging.
export interface ShapeCommandRegistry {
  beginBitmapFill: readonly [bitmap: ImageSource, matrix: Matrix3x2 | null, repeat: boolean, smooth: boolean];
  beginFill: readonly [color: number, alpha: number];
  beginGradientFill: readonly [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix3x2 | null,
    spreadMethod: SpreadMethod,
    interpolationMethod: InterpolationMethod,
    focalPointRatio: number,
  ];
  cubicCurveTo: readonly [
    controlX1: number,
    controlY1: number,
    controlX2: number,
    controlY2: number,
    anchorX: number,
    anchorY: number,
  ];
  curveTo: readonly [controlX: number, controlY: number, anchorX: number, anchorY: number];
  drawCircle: readonly [x: number, y: number, radius: number];
  drawEllipse: readonly [x: number, y: number, width: number, height: number];
  drawPath: readonly [commands: number[], data: number[], winding: GraphicsPathWinding];
  drawRect: readonly [x: number, y: number, width: number, height: number];
  drawRoundRect: readonly [
    x: number,
    y: number,
    width: number,
    height: number,
    ellipseWidth: number,
    ellipseHeight: number,
  ];
  endFill: readonly [];
  lineBitmapStyle: readonly [bitmap: ImageSource, matrix: Matrix3x2 | null, repeat: boolean, smooth: boolean];
  lineGradientStyle: readonly [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix3x2 | null,
    spreadMethod: SpreadMethod,
    interpolationMethod: InterpolationMethod,
    focalPointRatio: number,
  ];
  lineStyle: readonly [
    thickness: number,
    color: number,
    alpha: number,
    pixelHinting: boolean,
    scaleMode: LineScaleMode,
    caps: CapsStyle,
    joints: JointStyle,
    miterLimit: number,
  ];
  lineTo: readonly [x: number, y: number];
  moveTo: readonly [x: number, y: number];
}

export type ShapeCommandKey = keyof ShapeCommandRegistry;

export type ShapeCommand<K extends ShapeCommandKey = ShapeCommandKey> = K extends ShapeCommandKey
  ? { readonly key: K; readonly args: ShapeCommandRegistry[K] }
  : never;

export type ShapeCommandHitTest<K extends ShapeCommandKey = ShapeCommandKey> = (
  x: number,
  y: number,
  ...args: ShapeCommandRegistry[K]
) => boolean;
