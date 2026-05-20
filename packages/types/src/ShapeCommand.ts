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
  beginBitmapFill: [bitmap: ImageSource, matrix: Matrix3x2 | null, repeat: boolean, smooth: boolean];
  beginFill: [color: number, alpha: number];
  beginGradientFill: [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix3x2 | null,
    spreadMethod: SpreadMethod,
    interpolationMethod: InterpolationMethod,
    focalPointRatio: number,
  ];
  cubicCurveTo: [
    controlX1: number,
    controlY1: number,
    controlX2: number,
    controlY2: number,
    anchorX: number,
    anchorY: number,
  ];
  curveTo: [controlX: number, controlY: number, anchorX: number, anchorY: number];
  drawCircle: [x: number, y: number, radius: number];
  drawEllipse: [x: number, y: number, width: number, height: number];
  drawPath: [commands: number[], data: number[], winding: GraphicsPathWinding];
  drawRect: [x: number, y: number, width: number, height: number];
  drawRoundRect: [x: number, y: number, width: number, height: number, ellipseWidth: number, ellipseHeight: number];
  endFill: [];
  lineBitmapStyle: [bitmap: ImageSource, matrix: Matrix3x2 | null, repeat: boolean, smooth: boolean];
  lineGradientStyle: [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix3x2 | null,
    spreadMethod: SpreadMethod,
    interpolationMethod: InterpolationMethod,
    focalPointRatio: number,
  ];
  lineStyle: [
    thickness: number,
    color: number,
    alpha: number,
    pixelHinting: boolean,
    scaleMode: LineScaleMode,
    caps: CapsStyle,
    joints: JointStyle,
    miterLimit: number,
  ];
  lineTo: [x: number, y: number];
  moveTo: [x: number, y: number];
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
