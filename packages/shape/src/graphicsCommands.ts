import type {
  CapsStyle,
  GradientType,
  Graphics,
  GraphicsPathWinding,
  ImageSource,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix3x2,
  SpreadMethod,
  // TriangleCulling, // deferred — see DrawTrianglesCommand
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
  graphics: Graphics,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null = null,
  repeat = true,
  smooth = false,
): void {
  graphics.commands.push({ type: 'beginBitmapFill', bitmap, matrix, repeat, smooth });
}

export function beginFill(graphics: Graphics, color = 0, alpha = 1): void {
  graphics.commands.push({ type: 'beginFill', alpha, color });
}

export function beginGradientFill(
  graphics: Graphics,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null = null,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
  focalPointRatio = 0,
): void {
  graphics.commands.push({
    type: 'beginGradientFill',
    alphas,
    colors,
    focalPointRatio,
    gradientType,
    interpolationMethod,
    matrix,
    ratios,
    spreadMethod,
  });
}

export function cubicCurveTo(
  graphics: Graphics,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
): void {
  graphics.commands.push({ type: 'cubicCurveTo', anchorX, anchorY, controlX1, controlY1, controlX2, controlY2 });
}

export function curveTo(
  graphics: Graphics,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  graphics.commands.push({ type: 'curveTo', anchorX, anchorY, controlX, controlY });
}

export function drawCircle(graphics: Graphics, x: number, y: number, radius: number): void {
  graphics.commands.push({ type: 'drawCircle', radius, x, y });
}

export function drawEllipse(graphics: Graphics, x: number, y: number, width: number, height: number): void {
  graphics.commands.push({ type: 'drawEllipse', height, width, x, y });
}

export function drawPath(
  graphics: Graphics,
  commands: number[],
  data: number[],
  winding: GraphicsPathWinding = 'evenOdd',
): void {
  graphics.commands.push({ type: 'drawPath', commands, data, winding });
}

export function drawRect(graphics: Graphics, x: number, y: number, width: number, height: number): void {
  graphics.commands.push({ type: 'drawRect', height, width, x, y });
}

export function drawRoundRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
): void {
  graphics.commands.push({ type: 'drawRoundRect', ellipseHeight, ellipseWidth, height, width, x, y });
}

export function drawRoundRectComplex(
  graphics: Graphics,
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
  graphics.commands.push({ type: 'moveTo', x: x + topLeftRadius, y });
  graphics.commands.push({ type: 'lineTo', x: r - topRightRadius, y });
  graphics.commands.push({ type: 'curveTo', controlX: r, controlY: y, anchorX: r, anchorY: y + topRightRadius });
  graphics.commands.push({ type: 'lineTo', x: r, y: b - bottomRightRadius });
  graphics.commands.push({ type: 'curveTo', controlX: r, controlY: b, anchorX: r - bottomRightRadius, anchorY: b });
  graphics.commands.push({ type: 'lineTo', x: x + bottomLeftRadius, y: b });
  graphics.commands.push({ type: 'curveTo', controlX: x, controlY: b, anchorX: x, anchorY: b - bottomLeftRadius });
  graphics.commands.push({ type: 'lineTo', x, y: y + topLeftRadius });
  graphics.commands.push({ type: 'curveTo', controlX: x, controlY: y, anchorX: x + topLeftRadius, anchorY: y });
}

// export function drawTriangles(
//   graphics: Graphics,
//   vertices: number[],
//   indices: number[] | null = null,
//   uvtData: number[] | null = null,
//   culling: TriangleCulling = 'none',
// ): void {
//   graphics.commands.push({ type: 'drawTriangles', culling, indices, uvtData, vertices });
// }

export function endFill(graphics: Graphics): void {
  graphics.commands.push({ type: 'endFill' });
}

export function lineBitmapStyle(
  graphics: Graphics,
  bitmap: ImageSource,
  matrix: Matrix3x2 | null = null,
  repeat = true,
  smooth = false,
): void {
  graphics.commands.push({ type: 'lineBitmapStyle', bitmap, matrix, repeat, smooth });
}

export function lineGradientStyle(
  graphics: Graphics,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix3x2 | null = null,
  spreadMethod: SpreadMethod = 'pad',
  interpolationMethod: InterpolationMethod = 'rgb',
  focalPointRatio = 0,
): void {
  graphics.commands.push({
    type: 'lineGradientStyle',
    alphas,
    colors,
    focalPointRatio,
    gradientType,
    interpolationMethod,
    matrix,
    ratios,
    spreadMethod,
  });
}

export function lineStyle(
  graphics: Graphics,
  thickness = 1,
  color = 0,
  alpha = 1,
  pixelHinting = false,
  scaleMode: LineScaleMode = 'normal',
  caps: CapsStyle = 'none',
  joints: JointStyle = 'round',
  miterLimit = 3,
): void {
  graphics.commands.push({
    type: 'lineStyle',
    alpha,
    caps,
    color,
    joints,
    miterLimit,
    pixelHinting,
    scaleMode,
    thickness,
  });
}

export function lineTo(graphics: Graphics, x: number, y: number): void {
  graphics.commands.push({ type: 'lineTo', x, y });
}

export function moveTo(graphics: Graphics, x: number, y: number): void {
  graphics.commands.push({ type: 'moveTo', x, y });
}
