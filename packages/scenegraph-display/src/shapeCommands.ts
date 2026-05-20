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
  shape.data.commands.push({ key: 'beginBitmapFill', args: [bitmap, matrix, repeat, smooth] });
}

export function beginFill(shape: Shape, color = 0, alpha = 1): void {
  shape.data.commands.push({ key: 'beginFill', args: [color, alpha] });
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
  shape.data.commands.push({
    key: 'beginGradientFill',
    args: [gradientType, colors, alphas, ratios, matrix, spreadMethod, interpolationMethod, focalPointRatio],
  });
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
  shape.data.commands.push({
    key: 'cubicCurveTo',
    args: [controlX1, controlY1, controlX2, controlY2, anchorX, anchorY],
  });
}

export function curveTo(shape: Shape, controlX: number, controlY: number, anchorX: number, anchorY: number): void {
  shape.data.commands.push({ key: 'curveTo', args: [controlX, controlY, anchorX, anchorY] });
}

export function drawCircle(shape: Shape, x: number, y: number, radius: number): void {
  shape.data.commands.push({ key: 'drawCircle', args: [x, y, radius] });
}

export function drawEllipse(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push({ key: 'drawEllipse', args: [x, y, width, height] });
}

export function drawPath(
  shape: Shape,
  commands: number[],
  pathData: number[],
  winding: GraphicsPathWinding = 'evenOdd',
): void {
  shape.data.commands.push({ key: 'drawPath', args: [commands, pathData, winding] });
}

export function drawRect(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push({ key: 'drawRect', args: [x, y, width, height] });
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
  shape.data.commands.push({ key: 'drawRoundRect', args: [x, y, width, height, ellipseWidth, ellipseHeight] });
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
  cmds.push({ key: 'moveTo', args: [x + topLeftRadius, y] });
  cmds.push({ key: 'lineTo', args: [r - topRightRadius, y] });
  cmds.push({ key: 'curveTo', args: [r, y, r, y + topRightRadius] });
  cmds.push({ key: 'lineTo', args: [r, b - bottomRightRadius] });
  cmds.push({ key: 'curveTo', args: [r, b, r - bottomRightRadius, b] });
  cmds.push({ key: 'lineTo', args: [x + bottomLeftRadius, b] });
  cmds.push({ key: 'curveTo', args: [x, b, x, b - bottomLeftRadius] });
  cmds.push({ key: 'lineTo', args: [x, y + topLeftRadius] });
  cmds.push({ key: 'curveTo', args: [x, y, x + topLeftRadius, y] });
}

export function endFill(shape: Shape): void {
  shape.data.commands.push({ key: 'endFill', args: [] });
}

export function lineBitmapStyle(
  shape: Shape,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null = null,
  repeat = true,
  smooth = false,
): void {
  shape.data.commands.push({ key: 'lineBitmapStyle', args: [bitmap, matrix, repeat, smooth] });
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
  shape.data.commands.push({
    key: 'lineGradientStyle',
    args: [gradientType, colors, alphas, ratios, matrix, spreadMethod, interpolationMethod, focalPointRatio],
  });
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
  shape.data.commands.push({
    key: 'lineStyle',
    args: [thickness, color, alpha, pixelHinting, scaleMode, caps, joints, miterLimit],
  });
}

export function lineTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push({ key: 'lineTo', args: [x, y] });
}

export function moveTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push({ key: 'moveTo', args: [x, y] });
}
