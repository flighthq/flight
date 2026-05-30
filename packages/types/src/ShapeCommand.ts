import type { ImageSource } from './ImageSource';
import type { Matrix } from './Matrix';

export type CapsStyle = 'none' | 'round' | 'square';

export type GradientType = 'linear' | 'radial';

export type GraphicsPathWinding = 'evenOdd' | 'nonZero';

export type InterpolationMethod = 'linearRGB' | 'rgb';

export type JointStyle = 'bevel' | 'miter' | 'round';

export type LineScaleMode = 'horizontal' | 'none' | 'normal' | 'vertical';

export type SpreadMethod = 'pad' | 'reflect' | 'repeat';

// Maps command key strings to their argument tuples. May be extended via declaration merging.
export interface ShapeCommandRegistry {
  beginBitmapFill: readonly [bitmap: ImageSource, matrix: Matrix | null, repeat: boolean, smooth: boolean];
  beginFill: readonly [color: number, alpha: number];
  beginGradientFill: readonly [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix | null,
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
  drawRectangle: readonly [x: number, y: number, width: number, height: number];
  drawRoundRectangle: readonly [
    x: number,
    y: number,
    width: number,
    height: number,
    ellipseWidth: number,
    ellipseHeight: number,
  ];
  endFill: readonly [];
  lineBitmapStyle: readonly [bitmap: ImageSource, matrix: Matrix | null, repeat: boolean, smooth: boolean];
  lineGradientStyle: readonly [
    gradientType: GradientType,
    colors: number[],
    alphas: number[],
    ratios: number[],
    matrix: Matrix | null,
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

// Handler for hit-testing a command. Reads args from the flat command buffer at position i.
export type ShapeCommandHitTest = (x: number, y: number, buf: unknown[], i: number) => boolean;

// Command definition registered in the hit-test registry.
export type ShapeHitTestCommand<K extends ShapeCommandKey = ShapeCommandKey> = K extends ShapeCommandKey
  ? { readonly key: K; readonly hitTest: ShapeCommandHitTest }
  : never;
