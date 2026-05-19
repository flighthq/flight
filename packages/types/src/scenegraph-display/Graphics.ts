import type { ImageSource } from '../assets/ImageSource';
import type { Matrix3x2 } from '../geometry/Matrix3x2';

export type CapsStyle = 'none' | 'round' | 'square';

export type GradientType = 'linear' | 'radial';

export type GraphicsPathWinding = 'evenOdd' | 'nonZero';

export type InterpolationMethod = 'linearRGB' | 'rgb';

export type JointStyle = 'bevel' | 'miter' | 'round';

export type LineScaleMode = 'horizontal' | 'none' | 'normal' | 'vertical';

export type SpreadMethod = 'pad' | 'reflect' | 'repeat';

// export type TriangleCulling = 'negative' | 'none' | 'positive'; // deferred — home for this may be Mesh/MeshBatch in scenegraph-sprite

export interface BeginBitmapFillCommand {
  type: 'beginBitmapFill';
  bitmap: ImageSource;
  matrix: Matrix3x2 | null;
  repeat: boolean;
  smooth: boolean;
}

export interface BeginFillCommand {
  type: 'beginFill';
  alpha: number;
  color: number;
}

export interface BeginGradientFillCommand {
  type: 'beginGradientFill';
  alphas: number[];
  colors: number[];
  focalPointRatio: number;
  gradientType: GradientType;
  interpolationMethod: InterpolationMethod;
  matrix: Matrix3x2 | null;
  ratios: number[];
  spreadMethod: SpreadMethod;
}

export interface CubicCurveToCommand {
  type: 'cubicCurveTo';
  anchorX: number;
  anchorY: number;
  controlX1: number;
  controlY1: number;
  controlX2: number;
  controlY2: number;
}

export interface CurveToCommand {
  type: 'curveTo';
  anchorX: number;
  anchorY: number;
  controlX: number;
  controlY: number;
}

export interface DrawCircleCommand {
  type: 'drawCircle';
  radius: number;
  x: number;
  y: number;
}

export interface DrawEllipseCommand {
  type: 'drawEllipse';
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DrawPathCommand {
  type: 'drawPath';
  commands: number[];
  data: number[];
  winding: GraphicsPathWinding;
}

export interface DrawRectCommand {
  type: 'drawRect';
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface DrawRoundRectCommand {
  type: 'drawRoundRect';
  ellipseHeight: number;
  ellipseWidth: number;
  height: number;
  width: number;
  x: number;
  y: number;
}

// export interface DrawTrianglesCommand {
//   type: 'drawTriangles';
//   culling: TriangleCulling;
//   indices: number[] | null;
//   uvtData: number[] | null;
//   vertices: number[];
// }

export interface EndFillCommand {
  type: 'endFill';
}

export interface LineBitmapStyleCommand {
  type: 'lineBitmapStyle';
  bitmap: ImageSource;
  matrix: Matrix3x2 | null;
  repeat: boolean;
  smooth: boolean;
}

export interface LineGradientStyleCommand {
  type: 'lineGradientStyle';
  alphas: number[];
  colors: number[];
  focalPointRatio: number;
  gradientType: GradientType;
  interpolationMethod: InterpolationMethod;
  matrix: Matrix3x2 | null;
  ratios: number[];
  spreadMethod: SpreadMethod;
}

export interface LineStyleCommand {
  type: 'lineStyle';
  alpha: number;
  caps: CapsStyle;
  color: number;
  joints: JointStyle;
  miterLimit: number;
  pixelHinting: boolean;
  scaleMode: LineScaleMode;
  thickness: number;
}

export interface LineToCommand {
  type: 'lineTo';
  x: number;
  y: number;
}

export interface MoveToCommand {
  type: 'moveTo';
  x: number;
  y: number;
}

export type ShapeCommand =
  | BeginBitmapFillCommand
  | BeginFillCommand
  | BeginGradientFillCommand
  | CubicCurveToCommand
  | CurveToCommand
  | DrawCircleCommand
  | DrawEllipseCommand
  | DrawPathCommand
  | DrawRectCommand
  | DrawRoundRectCommand
  // | DrawTrianglesCommand
  | EndFillCommand
  | LineBitmapStyleCommand
  | LineGradientStyleCommand
  | LineStyleCommand
  | LineToCommand
  | MoveToCommand;

export interface Graphics {
  commands: ShapeCommand[];
}
