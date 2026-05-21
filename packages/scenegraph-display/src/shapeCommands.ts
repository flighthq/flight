import type {
  CapsStyle,
  GradientType,
  GraphicsPathWinding,
  ImageSource,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix3x2,
  Shape,
  SpreadMethod,
} from '@flighthq/types';

export const GraphicsPathCommand = {
  NO_OP: 0,
  MOVE_TO: 1,
  LINE_TO: 2,
  CURVE_TO: 3,
  WIDE_MOVE_TO: 4,
  WIDE_LINE_TO: 5,
  CUBIC_CURVE_TO: 6,
} as const;

export function beginBitmapFill(
  shape: Shape,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null = null,
  repeat = true,
  smooth = false,
): void {
  shape.data.commands.push('beginBitmapFill', 4, bitmap, matrix, repeat, smooth);
}

export function beginFill(shape: Shape, color = 0, alpha = 1): void {
  shape.data.commands.push('beginFill', 2, color, alpha);
}

export function beginGradientFill(
  shape: Shape,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null = null,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
  focalPointRatio = 0,
): void {
  shape.data.commands.push(
    'beginGradientFill',
    8,
    gradientType,
    colors,
    alphas,
    ratios,
    matrix,
    spreadMethod,
    interpolationMethod,
    focalPointRatio,
  );
}

export function cubicCurveTo(
  shape: Shape,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
): void {
  shape.data.commands.push('cubicCurveTo', 6, controlX1, controlY1, controlX2, controlY2, anchorX, anchorY);
}

export function curveTo(shape: Shape, controlX: number, controlY: number, anchorX: number, anchorY: number): void {
  shape.data.commands.push('curveTo', 4, controlX, controlY, anchorX, anchorY);
}

export function drawCircle(shape: Shape, x: number, y: number, radius: number): void {
  shape.data.commands.push('drawCircle', 3, x, y, radius);
}

export function drawEllipse(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push('drawEllipse', 4, x, y, width, height);
}

export function drawPath(
  shape: Shape,
  commands: number[],
  pathData: number[],
  winding: GraphicsPathWinding = 'evenOdd',
): void {
  shape.data.commands.push('drawPath', 3, commands, pathData, winding);
}

export function drawRect(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push('drawRect', 4, x, y, width, height);
}

export function drawRoundRect(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
): void {
  shape.data.commands.push('drawRoundRect', 6, x, y, width, height, ellipseWidth, ellipseHeight);
}

export function drawRoundRectComplex(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  topLeftRadius: number,
  topRightRadius: number,
  bottomLeftRadius: number,
  bottomRightRadius: number,
): void {
  const r = x + width;
  const b = y + height;
  const cmds = shape.data.commands;
  cmds.push('moveTo', 2, x + topLeftRadius, y);
  cmds.push('lineTo', 2, r - topRightRadius, y);
  cmds.push('curveTo', 4, r, y, r, y + topRightRadius);
  cmds.push('lineTo', 2, r, b - bottomRightRadius);
  cmds.push('curveTo', 4, r, b, r - bottomRightRadius, b);
  cmds.push('lineTo', 2, x + bottomLeftRadius, b);
  cmds.push('curveTo', 4, x, b, x, b - bottomLeftRadius);
  cmds.push('lineTo', 2, x, y + topLeftRadius);
  cmds.push('curveTo', 4, x, y, x + topLeftRadius, y);
}

export function endFill(shape: Shape): void {
  shape.data.commands.push('endFill', 0);
}

export function lineBitmapStyle(
  shape: Shape,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null = null,
  repeat = true,
  smooth = false,
): void {
  shape.data.commands.push('lineBitmapStyle', 4, bitmap, matrix, repeat, smooth);
}

export function lineGradientStyle(
  shape: Shape,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null = null,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
  focalPointRatio = 0,
): void {
  shape.data.commands.push(
    'lineGradientStyle',
    8,
    gradientType,
    colors,
    alphas,
    ratios,
    matrix,
    spreadMethod,
    interpolationMethod,
    focalPointRatio,
  );
}

export function lineStyle(
  shape: Shape,
  thickness = 1,
  color = 0,
  alpha = 1,
  pixelHinting = false,
  scaleMode: LineScaleMode = 'normal',
  caps: CapsStyle = 'none',
  joints: JointStyle = 'round',
  miterLimit = 3,
): void {
  shape.data.commands.push('lineStyle', 8, thickness, color, alpha, pixelHinting, scaleMode, caps, joints, miterLimit);
}

export function lineTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('lineTo', 2, x, y);
}

export function moveTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('moveTo', 2, x, y);
}
