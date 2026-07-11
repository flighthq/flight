import type { ImageResource } from './ImageResource';
import type { Matrix } from './Matrix';

export type CapsStyle = 'none' | 'round' | 'square';

export type GradientType = 'linear' | 'radial';

export type PathWinding = 'evenOdd' | 'nonZero';

export type InterpolationMethod = 'linearRGB' | 'rgb';

export type JointStyle = 'bevel' | 'miter' | 'round';

export type LineScaleMode = 'horizontal' | 'none' | 'normal' | 'vertical';

export type SpreadMethod = 'pad' | 'reflect' | 'repeat';

// Maps command key strings to their argument tuples. May be extended via declaration merging.
export interface ShapeCommandRegistry {
  beginBitmapFill: readonly [bitmap: ImageResource, matrix: Matrix | null, repeat: boolean, smooth: boolean];
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
  drawPath: readonly [commands: number[], data: number[], winding: PathWinding];
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
  lineBitmapStyle: readonly [bitmap: ImageResource, matrix: Matrix | null, repeat: boolean, smooth: boolean];
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

// One slot of the flat, heterogeneous shape command buffer (`ShapeData.commands`). The buffer stores
// each command inline as a key string, an argument count, then that many argument tokens:
// `[key, argCount, ...args, key, argCount, ...args, …]`. Across all commands an argument slot may hold
// a coordinate/color/count (number), a style keyword or command key (string), a flag (boolean), a
// gradient/triangle/path buffer (number[]), a fill matrix (Matrix, or null when absent), or a bitmap
// fill's live resource (ImageResource). A reader advances by `argCount + 2` and casts each slot to the
// type its command's `ShapeCommandRegistry` entry documents.
export type ShapeCommandToken = ImageResource | Matrix | boolean | number | readonly number[] | string | null;

// Handler for hit-testing a command. Reads args from the flat command buffer at position i.
export type ShapeCommandHitTest = (x: number, y: number, buf: readonly ShapeCommandToken[], i: number) => boolean;

// Command definition registered in the hit-test registry.
export type ShapeHitTestCommand<K extends ShapeCommandKey = ShapeCommandKey> = K extends ShapeCommandKey
  ? { readonly key: K; readonly hitTest: ShapeCommandHitTest }
  : never;
