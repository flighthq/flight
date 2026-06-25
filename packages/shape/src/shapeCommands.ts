import type {
  CapsStyle,
  GradientType,
  ImageResource,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix,
  PathWinding,
  Shape,
  SpreadMethod,
  TriangleCulling,
} from '@flighthq/types';

import { invalidateShapeGeometry } from './shape';

// Canonical definition now lives in @flighthq/types (shared with @flighthq/path); re-exported here so
// shape authoring keeps a single import surface.
export { PathCommand } from '@flighthq/types';

// Appends an arc to the shape's command stream, expanding it into a moveTo followed by
// cubicCurveTo commands using the standard cubic bezier circle approximation. The arc is drawn
// from startAngle to endAngle around (cx, cy) with the given radius. Angles are in radians.
// Set anticlockwise to true for a counter-clockwise arc.
//
// Always emits a moveTo to the arc start — use this as a standalone arc primitive. When connecting
// an arc to an existing open path (e.g. inside appendShapeArcTo), use the commands buffer directly
// via appendShapeArcSegments.
export function appendShapeArc(
  shape: Shape,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  anticlockwise = false,
): void {
  const cmds = shape.data.commands;
  const sweep = normalizeArcSweep(startAngle, endAngle, anticlockwise);
  const segmentCount = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const segmentAngle = sweep / segmentCount;
  const alpha = (4 / 3) * Math.tan(segmentAngle / 4);
  cmds.push('moveTo', 2, cx + radius * Math.cos(startAngle), cy + radius * Math.sin(startAngle));
  pushArcCubics(cmds, cx, cy, radius, startAngle, segmentCount, segmentAngle, alpha);
  invalidateShapeGeometry(shape);
}

// Appends an arc segment using SVG-style tangent-line arguments. Draws an arc from the current
// pen position through the intersection of two tangent lines defined by (x1, y1) and (x2, y2),
// with the given radius, using cubic bezier approximation. Equivalent to the SVG/Canvas2D
// arcTo(x1, y1, x2, y2, radius) semantics.
//
// If the pen has not been moved (no prior moveTo/lineTo), the current pen is treated as (0, 0).
// A lineTo to the tangent start point is emitted before the arc when the current point differs.
export function appendShapeArcTo(shape: Shape, x1: number, y1: number, x2: number, y2: number, radius: number): void {
  const cmds = shape.data.commands;
  // Recover the current pen position by scanning the command stream for the last pen-position
  // command. The pen starts at (0, 0) if no prior command set it.
  let penX = 0;
  let penY = 0;
  let i = 0;
  while (i < cmds.length) {
    const key = cmds[i] as string;
    const argCount = cmds[i + 1] as number;
    const b = i + 2;
    switch (key) {
      case 'moveTo':
      case 'lineTo':
        penX = cmds[b] as number;
        penY = cmds[b + 1] as number;
        break;
      case 'curveTo':
        penX = cmds[b + 2] as number;
        penY = cmds[b + 3] as number;
        break;
      case 'cubicCurveTo':
        penX = cmds[b + 4] as number;
        penY = cmds[b + 5] as number;
        break;
    }
    i += argCount + 2;
  }
  // Compute tangent direction vectors.
  const d1x = penX - x1;
  const d1y = penY - y1;
  const d2x = x2 - x1;
  const d2y = y2 - y1;
  const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
  const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
  // Degenerate case: zero-length tangent → emit a plain lineTo to (x1, y1).
  if (len1 < 1e-10 || len2 < 1e-10) {
    cmds.push('lineTo', 2, x1, y1);
    invalidateShapeGeometry(shape);
    return;
  }
  // Compute the angle between the two tangent lines.
  const cosHalf = (d1x * d2x + d1y * d2y) / (len1 * len2);
  const clampedCos = Math.max(-1, Math.min(1, cosHalf));
  const halfAngle = Math.acos(clampedCos) / 2;
  // Degenerate: tangents are parallel/anti-parallel.
  if (Math.abs(Math.sin(halfAngle)) < 1e-10) {
    cmds.push('lineTo', 2, x1, y1);
    invalidateShapeGeometry(shape);
    return;
  }
  // Distance from the corner (x1, y1) to the tangent points.
  const d = radius / Math.tan(halfAngle);
  // Tangent start point (on the line from pen to x1,y1).
  const n1x = d1x / len1;
  const n1y = d1y / len1;
  const tx1 = x1 + n1x * d;
  const ty1 = y1 + n1y * d;
  // Tangent end point (on the line from x1,y1 to x2,y2).
  const n2x = d2x / len2;
  const n2y = d2y / len2;
  const tx2 = x1 + n2x * d;
  const ty2 = y1 + n2y * d;
  // Line to arc start.
  cmds.push('lineTo', 2, tx1, ty1);
  // Compute the center of the arc.
  // The center lies on the angle bisector at distance radius / sin(halfAngle).
  const bx = (n1x + n2x) / 2;
  const by = (n1y + n2y) / 2;
  const blen = Math.sqrt(bx * bx + by * by);
  const distToCenter = radius / Math.sin(halfAngle);
  const ocx = x1 + (bx / blen) * distToCenter;
  const ocy = y1 + (by / blen) * distToCenter;
  // The sweep from start tangent to end tangent.
  const startA = Math.atan2(ty1 - ocy, tx1 - ocx);
  const endA = Math.atan2(ty2 - ocy, tx2 - ocx);
  // Determine direction: cross product of the two tangent vectors tells us winding.
  const cross = d1x * d2y - d1y * d2x;
  const isAnticlockwise = cross < 0;
  const sweep = normalizeArcSweep(startA, endA, isAnticlockwise);
  const segmentCount = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const segmentAngle = sweep / segmentCount;
  const alpha = (4 / 3) * Math.tan(segmentAngle / 4);
  // Push arc cubics directly — no moveTo because we already emitted lineTo(tx1, ty1).
  pushArcCubics(cmds, ocx, ocy, radius, startA, segmentCount, segmentAngle, alpha);
  invalidateShapeGeometry(shape);
}

export function appendShapeBeginBitmapFill(
  shape: Shape,
  bitmap: ImageResource,
  matrix: Matrix | null = null,
  repeat = true,
  smooth = false,
): void {
  shape.data.commands.push('beginBitmapFill', 4, bitmap, matrix, repeat, smooth);
  invalidateShapeGeometry(shape);
}

export function appendShapeBeginFill(shape: Shape, color = 0, alpha = 1): void {
  shape.data.commands.push('beginFill', 2, color, alpha);
  invalidateShapeGeometry(shape);
}

export function appendShapeBeginGradientFill(
  shape: Shape,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix | null = null,
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
  invalidateShapeGeometry(shape);
}

export function appendShapeCircle(shape: Shape, x: number, y: number, radius: number): void {
  shape.data.commands.push('drawCircle', 3, x, y, radius);
  invalidateShapeGeometry(shape);
}

export function appendShapeCubicCurveTo(
  shape: Shape,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
): void {
  shape.data.commands.push('cubicCurveTo', 6, controlX1, controlY1, controlX2, controlY2, anchorX, anchorY);
  invalidateShapeGeometry(shape);
}

export function appendShapeCurveTo(
  shape: Shape,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  shape.data.commands.push('curveTo', 4, controlX, controlY, anchorX, anchorY);
  invalidateShapeGeometry(shape);
}

export function appendShapeDrawTriangles(
  shape: Shape,
  vertices: number[],
  indices: number[] | null = null,
  uvtData: number[] | null = null,
  culling: TriangleCulling = 'none',
): void {
  shape.data.commands.push('drawTriangles', 4, vertices, indices, uvtData, culling);
  invalidateShapeGeometry(shape);
}

export function appendShapeEllipse(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push('drawEllipse', 4, x, y, width, height);
  invalidateShapeGeometry(shape);
}

export function appendShapeEndFill(shape: Shape): void {
  shape.data.commands.push('endFill', 0);
  invalidateShapeGeometry(shape);
}

export function appendShapeLineBitmapStyle(
  shape: Shape,
  bitmap: ImageResource,
  matrix: Matrix | null = null,
  repeat = true,
  smooth = false,
): void {
  shape.data.commands.push('lineBitmapStyle', 4, bitmap, matrix, repeat, smooth);
  invalidateShapeGeometry(shape);
}

export function appendShapeLineGradientStyle(
  shape: Shape,
  gradientType: GradientType,
  colors: number[],
  alphas: number[],
  ratios: number[],
  matrix: Matrix | null = null,
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
  invalidateShapeGeometry(shape);
}

export function appendShapeLineStyle(
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
  invalidateShapeGeometry(shape);
}

export function appendShapeLineTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('lineTo', 2, x, y);
  invalidateShapeGeometry(shape);
}

export function appendShapeMoveTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('moveTo', 2, x, y);
  invalidateShapeGeometry(shape);
}

export function appendShapePath(
  shape: Shape,
  commands: number[],
  pathData: number[],
  winding: PathWinding = 'evenOdd',
): void {
  shape.data.commands.push('drawPath', 3, commands, pathData, winding);
  invalidateShapeGeometry(shape);
}

// Appends a closed polygon to the shape's command stream as a sequence of moveTo and lineTo
// commands. The polygon is automatically closed by returning to the first vertex. Requires at
// least 2 points; with fewer points, no commands are emitted.
//
// points: flat [x0, y0, x1, y1, ...] array.
export function appendShapePolygon(shape: Shape, points: number[]): void {
  if (points.length < 4) return;
  const cmds = shape.data.commands;
  cmds.push('moveTo', 2, points[0], points[1]);
  for (let k = 2; k < points.length - 1; k += 2) {
    cmds.push('lineTo', 2, points[k], points[k + 1]);
  }
  // Close the polygon.
  cmds.push('lineTo', 2, points[0], points[1]);
  invalidateShapeGeometry(shape);
}

// Appends an open polyline to the shape's command stream as a sequence of moveTo and lineTo
// commands. Unlike appendShapePolygon, no closing lineTo is emitted. Requires at least 2 points.
//
// points: flat [x0, y0, x1, y1, ...] array.
export function appendShapePolyline(shape: Shape, points: number[]): void {
  if (points.length < 4) return;
  const cmds = shape.data.commands;
  cmds.push('moveTo', 2, points[0], points[1]);
  for (let k = 2; k < points.length - 1; k += 2) {
    cmds.push('lineTo', 2, points[k], points[k + 1]);
  }
  invalidateShapeGeometry(shape);
}

export function appendShapeRectangle(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push('drawRectangle', 4, x, y, width, height);
  invalidateShapeGeometry(shape);
}

export function appendShapeRoundRectangle(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
): void {
  shape.data.commands.push('drawRoundRectangle', 6, x, y, width, height, ellipseWidth, ellipseHeight);
  invalidateShapeGeometry(shape);
}

export function appendShapeRoundRectangleVarying(
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
  invalidateShapeGeometry(shape);
}

// Returns the normalized arc sweep in the requested direction. Always returns a value whose
// absolute value is in [0, 2π]. Clockwise → positive sweep; anticlockwise → negative sweep.
function normalizeArcSweep(startAngle: number, endAngle: number, anticlockwise: boolean): number {
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep > 0) sweep -= Math.PI * 2;
  } else {
    if (sweep < 0) sweep += Math.PI * 2;
  }
  return sweep;
}

// Pushes segmentCount cubicCurveTo entries onto cmds, approximating a circular arc centered at
// (cx, cy) with the given radius. startAngle is the arc's start; segmentAngle is the angle
// covered per segment; alpha is the cubic control-point scale factor.
function pushArcCubics(
  cmds: unknown[],
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  segmentCount: number,
  segmentAngle: number,
  alpha: number,
): void {
  let angle = startAngle;
  for (let s = 0; s < segmentCount; s++) {
    const nextAngle = angle + segmentAngle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cosB = Math.cos(nextAngle);
    const sinB = Math.sin(nextAngle);
    cmds.push(
      'cubicCurveTo',
      6,
      cx + radius * (cosA - alpha * sinA),
      cy + radius * (sinA + alpha * cosA),
      cx + radius * (cosB + alpha * sinB),
      cy + radius * (sinB - alpha * cosB),
      cx + radius * cosB,
      cy + radius * sinB,
    );
    angle = nextAngle;
  }
}
