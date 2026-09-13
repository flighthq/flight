import { CIRCLE_KAPPA } from '@flighthq/math/contract';
import { invalidateContent } from '@flighthq/node/contract';
import type {
  CapsStyle,
  GradientType,
  InterpolationMethod,
  JointStyle,
  LineScaleMode,
  Matrix,
  PathWinding,
  Shape,
  ShapeCommandToken,
  SpreadMethod,
  Texture,
  TriangleCulling,
} from '@flighthq/types/contract';

// Canonical definition now lives in @flighthq/types (shared with @flighthq/path); re-exported here so
// shape authoring keeps a single import surface.
export { PathCommand } from '@flighthq/types/contract';

// Appends an arc to the shape's command stream, expanding it into a moveTo followed by
// cubicCurveTo commands using the standard cubic bezier circle approximation. The arc is drawn
// from startAngle to endAngle around (cx, cy) with the given radius. Angles are in radians.
// Set anticlockwise to true for a counter-clockwise arc.
//
// Always emits a moveTo to the arc start — use this as a standalone arc primitive. When connecting
// an arc to an existing open path (e.g. inside appendShapeTangentArcTo), use the commands buffer directly
// via appendShapeArcSegments.
export function appendShapeArc(
  shape: Shape,
  centerX: number,
  centerY: number,
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
  cmds.push('moveTo', 2, centerX + radius * Math.cos(startAngle), centerY + radius * Math.sin(startAngle));
  pushArcCubics(cmds, centerX, centerY, radius, startAngle, segmentCount, segmentAngle, alpha);
  invalidateContent(shape);
}

export function appendShapeBeginFill(shape: Shape, color: number, alpha = 1): void {
  shape.data.commands.push('beginFill', 2, color, alpha);
  invalidateContent(shape);
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
  invalidateContent(shape);
}

export function appendShapeBeginTextureFill(shape: Shape, texture: Texture, matrix: Matrix | null = null): void {
  shape.data.commands.push('beginTextureFill', 2, texture, matrix);
  invalidateContent(shape);
}

export function appendShapeCircle(shape: Shape, centerX: number, centerY: number, radius: number): void {
  shape.data.commands.push('drawCircle', 3, centerX, centerY, radius);
  invalidateContent(shape);
}

export function appendShapeCubicCurveTo(
  shape: Shape,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  x: number,
  y: number,
): void {
  shape.data.commands.push('cubicCurveTo', 6, controlX1, controlY1, controlX2, controlY2, x, y);
  invalidateContent(shape);
}

export function appendShapeDrawTriangles(
  shape: Shape,
  vertices: number[],
  indices: number[] | null = null,
  uvtData: number[] | null = null,
  culling: TriangleCulling = 'none',
): void {
  shape.data.commands.push('drawTriangles', 4, vertices, indices, uvtData, culling);
  invalidateContent(shape);
}

export function appendShapeEllipse(
  shape: Shape,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): void {
  shape.data.commands.push('drawEllipse', 4, centerX, centerY, radiusX, radiusY);
  invalidateContent(shape);
}

export function appendShapeEllipticalArcTo(
  shape: Shape,
  radiusX: number,
  radiusY: number,
  xAxisRotation: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): void {
  if (radiusX === 0 || radiusY === 0) {
    shape.data.commands.push('lineTo', 2, x, y);
    invalidateContent(shape);
    return;
  }
  const cmds = shape.data.commands;
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
      case 'quadraticCurveTo':
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
  if (penX === x && penY === y) return;
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  const cosφ = Math.cos(xAxisRotation);
  const sinφ = Math.sin(xAxisRotation);
  const dx = (penX - x) / 2;
  const dy = (penY - y) / 2;
  const x1p = cosφ * dx + sinφ * dy;
  const y1p = -sinφ * dx + cosφ * dy;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }
  const rxSq2 = rx * rx;
  const rySq2 = ry * ry;
  const num = rxSq2 * rySq2 - rxSq2 * y1pSq - rySq2 * x1pSq;
  const den = rxSq2 * y1pSq + rySq2 * x1pSq;
  const sq = den <= 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  const sign = largeArc === sweep ? -1 : 1;
  const cxp = (sign * sq * (rx * y1p)) / ry;
  const cyp = (sign * sq * (-ry * x1p)) / rx;
  const cx = cosφ * cxp - sinφ * cyp + (penX + x) / 2;
  const cy = sinφ * cxp + cosφ * cyp + (penY + y) / 2;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = vectorAngle(1, 0, ux, uy);
  let dtheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && dtheta > 0) dtheta -= Math.PI * 2;
  if (sweep && dtheta < 0) dtheta += Math.PI * 2;
  if (dtheta === 0) return;
  const segmentCount = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
  const segmentAngle = dtheta / segmentCount;
  const alpha = (4 / 3) * Math.tan(segmentAngle / 4);
  for (let seg = 0; seg < segmentCount; seg++) {
    const t1 = theta1 + seg * segmentAngle;
    const t2 = t1 + segmentAngle;
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    const dx1 = -rx * sin1 * alpha;
    const dy1 = ry * cos1 * alpha;
    const dx2 = rx * sin2 * alpha;
    const dy2 = -ry * cos2 * alpha;
    const p1x = cx + cosφ * rx * cos1 - sinφ * ry * sin1;
    const p1y = cy + sinφ * rx * cos1 + cosφ * ry * sin1;
    const p2x = cx + cosφ * rx * cos2 - sinφ * ry * sin2;
    const p2y = cy + sinφ * rx * cos2 + cosφ * ry * sin2;
    const c1x = p1x + cosφ * dx1 - sinφ * dy1;
    const c1y = p1y + sinφ * dx1 + cosφ * dy1;
    const c2x = p2x + cosφ * dx2 - sinφ * dy2;
    const c2y = p2y + sinφ * dx2 + cosφ * dy2;
    cmds.push('cubicCurveTo', 6, c1x, c1y, c2x, c2y, p2x, p2y);
  }
  invalidateContent(shape);
}

export function appendShapeEndFill(shape: Shape): void {
  shape.data.commands.push('endFill', 0);
  invalidateContent(shape);
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
  invalidateContent(shape);
}

export function appendShapeLineStyle(
  shape: Shape,
  thickness = 1,
  color: number,
  alpha = 1,
  pixelHinting = false,
  scaleMode: LineScaleMode = 'normal',
  caps: CapsStyle = 'none',
  joints: JointStyle = 'round',
  miterLimit = 3,
): void {
  shape.data.commands.push('lineStyle', 8, thickness, color, alpha, pixelHinting, scaleMode, caps, joints, miterLimit);
  invalidateContent(shape);
}

export function appendShapeLineTextureStyle(shape: Shape, texture: Texture, matrix: Matrix | null = null): void {
  shape.data.commands.push('lineTextureStyle', 2, texture, matrix);
  invalidateContent(shape);
}

export function appendShapeLineTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('lineTo', 2, x, y);
  invalidateContent(shape);
}

export function appendShapeMoveTo(shape: Shape, x: number, y: number): void {
  shape.data.commands.push('moveTo', 2, x, y);
  invalidateContent(shape);
}

export function appendShapePath(
  shape: Shape,
  commands: number[],
  pathData: number[],
  winding: PathWinding = 'evenOdd',
): void {
  shape.data.commands.push('drawPath', 3, commands, pathData, winding);
  invalidateContent(shape);
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
  invalidateContent(shape);
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
  invalidateContent(shape);
}

export function appendShapeQuadraticCurveTo(
  shape: Shape,
  controlX: number,
  controlY: number,
  x: number,
  y: number,
): void {
  shape.data.commands.push('quadraticCurveTo', 4, controlX, controlY, x, y);
  invalidateContent(shape);
}

export function appendShapeRectangle(shape: Shape, x: number, y: number, width: number, height: number): void {
  shape.data.commands.push('drawRectangle', 4, x, y, width, height);
  invalidateContent(shape);
}

export function appendShapeRoundedRectangle(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
): void {
  shape.data.commands.push('drawRoundedRectangle', 6, x, y, width, height, ellipseWidth, ellipseHeight);
  invalidateContent(shape);
}

export function appendShapeRoundedRectangleWithCornerRadii(
  shape: Shape,
  x: number,
  y: number,
  width: number,
  height: number,
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
): void {
  const r = x + width;
  const b = y + height;
  const cmds = shape.data.commands;
  const kTR = topRight * CIRCLE_KAPPA;
  const kBR = bottomRight * CIRCLE_KAPPA;
  const kBL = bottomLeft * CIRCLE_KAPPA;
  const kTL = topLeft * CIRCLE_KAPPA;
  cmds.push('moveTo', 2, x + topLeft, y);
  cmds.push('lineTo', 2, r - topRight, y);
  cmds.push('cubicCurveTo', 6, r - topRight + kTR, y, r, y + topRight - kTR, r, y + topRight);
  cmds.push('lineTo', 2, r, b - bottomRight);
  cmds.push('cubicCurveTo', 6, r, b - bottomRight + kBR, r - bottomRight + kBR, b, r - bottomRight, b);
  cmds.push('lineTo', 2, x + bottomLeft, b);
  cmds.push('cubicCurveTo', 6, x + bottomLeft - kBL, b, x, b - bottomLeft + kBL, x, b - bottomLeft);
  cmds.push('lineTo', 2, x, y + topLeft);
  cmds.push('cubicCurveTo', 6, x, y + topLeft - kTL, x + topLeft - kTL, y, x + topLeft, y);
  invalidateContent(shape);
}

// Appends an arc segment using tangent-line arguments. Draws an arc from the current
// pen position through the intersection of two tangent lines defined by (x1, y1) and (x2, y2),
// with the given radius, using cubic bezier approximation. Equivalent to the SVG/Canvas2D
// arcTo(x1, y1, x2, y2, radius) semantics.
//
// If the pen has not been moved (no prior moveTo/lineTo), the current pen is treated as (0, 0).
// A lineTo to the tangent start point is emitted before the arc when the current point differs.
export function appendShapeTangentArcTo(
  shape: Shape,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  radius: number,
): void {
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
      case 'quadraticCurveTo':
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
    invalidateContent(shape);
    return;
  }
  // Compute the angle between the two tangent lines.
  const cosHalf = (d1x * d2x + d1y * d2y) / (len1 * len2);
  const clampedCos = Math.max(-1, Math.min(1, cosHalf));
  const halfAngle = Math.acos(clampedCos) / 2;
  // Degenerate: tangents are parallel/anti-parallel.
  if (Math.abs(Math.sin(halfAngle)) < 1e-10) {
    cmds.push('lineTo', 2, x1, y1);
    invalidateContent(shape);
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
  invalidateContent(shape);
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
  cmds: ShapeCommandToken[],
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

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const lenU = Math.sqrt(ux * ux + uy * uy);
  const lenV = Math.sqrt(vx * vx + vy * vy);
  if (lenU === 0 || lenV === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (lenU * lenV)));
  const angle = Math.acos(cosAngle);
  return ux * vy - uy * vx < 0 ? -angle : angle;
}
