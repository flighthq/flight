import type {
  CapsStyle,
  JointStyle,
  Rectangle,
  Shape,
  ShapeBoundsCommandHandler,
  ShapeBoundsContext,
  ShapeBoundsExplanation,
  ShapeBoundsGuard,
  ShapeBoundsMode,
  ShapeCommandArgumentCursor,
  ShapeCommandToken,
} from '@flighthq/types/contract';

import { getShapeBoundsCommand } from './shapeBoundsRegistry';

export function computeShapeBoundsRectangle(
  out: Rectangle,
  source: Readonly<Shape>,
  mode: ShapeBoundsMode = 'ink',
): boolean {
  const accumulator = createShapeBoundsAccumulator();
  const fillState = createShapeBoundsLaneState(accumulator, false);
  const fillContext = createShapeBoundsContext(fillState);
  const strokeState = createShapeBoundsLaneState(accumulator, true);
  const strokeContext = createShapeBoundsContext(strokeState);
  const cursor = createShapeCommandArgumentCursor(source.data.commands);
  let complete = true;
  let i = 0;
  while (i < source.data.commands.length) {
    const key = source.data.commands[i] as string;
    const argumentCount = source.data.commands[i + 1] as number;
    const command = getShapeBoundsCommand(key);
    setShapeCommandArgumentCursor(cursor, i + 2, argumentCount);
    if (command === null) {
      complete = false;
      _shapeBoundsGuard?.(source, mode, key);
    } else {
      command.fillBounds?.(fillContext, cursor);
      if (mode === 'ink') command.strokeBounds?.(strokeContext, cursor);
    }
    i += argumentCount + 2;
  }
  fillContext.flushPath();
  if (mode === 'ink') strokeContext.flushPath();
  writeShapeBoundsRectangle(out, accumulator);
  return complete;
}

export const defaultShapeBoundsCubicCurveTo: ShapeBoundsCommandHandler = (context, command) => {
  context.cubicCurveTo(
    command.getArgument(0) as number,
    command.getArgument(1) as number,
    command.getArgument(2) as number,
    command.getArgument(3) as number,
    command.getArgument(4) as number,
    command.getArgument(5) as number,
  );
};

export const defaultShapeBoundsCurveTo: ShapeBoundsCommandHandler = (context, command) => {
  context.curveTo(
    command.getArgument(0) as number,
    command.getArgument(1) as number,
    command.getArgument(2) as number,
    command.getArgument(3) as number,
  );
};

export const defaultShapeBoundsDrawCircle: ShapeBoundsCommandHandler = (context, command) => {
  context.drawCircle(
    command.getArgument(0) as number,
    command.getArgument(1) as number,
    command.getArgument(2) as number,
  );
};

interface ShapeBoundsAccumulator {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

interface ShapeBoundsLaneState {
  readonly accumulator: ShapeBoundsAccumulator;
  readonly firstSegment: ShapeBoundsSegment;
  hasCurrentPoint: boolean;
  hasFirstSegment: boolean;
  hasPendingSegment: boolean;
  hasStroke: boolean;
  penX: number;
  penY: number;
  readonly pendingSegment: ShapeBoundsSegment;
  strokeCap: CapsStyle;
  strokeJoin: JointStyle;
  strokeMiterLimit: number;
  strokeWidth: number;
  subpathStartX: number;
  subpathStartY: number;
  readonly tangentEnd: ShapeBoundsTangent;
  readonly tangentStart: ShapeBoundsTangent;
  readonly writesStroke: boolean;
}

interface ShapeBoundsSegment {
  endTangentX: number;
  endTangentY: number;
  endX: number;
  endY: number;
  startTangentX: number;
  startTangentY: number;
  startX: number;
  startY: number;
}

interface ShapeBoundsTangent {
  x: number;
  y: number;
}

interface ShapeCommandArgumentCursorInternal extends ShapeCommandArgumentCursor {
  argumentCount: number;
  argumentOffset: number;
  readonly commands: readonly ShapeCommandToken[];
}

function appendShapeBoundsSegment(
  state: ShapeBoundsLaneState,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startTangentX: number,
  startTangentY: number,
  endTangentX: number,
  endTangentY: number,
): void {
  if (state.hasPendingSegment) {
    expandShapeBoundsJoin(
      state,
      startX,
      startY,
      state.pendingSegment.endTangentX,
      state.pendingSegment.endTangentY,
      startTangentX,
      startTangentY,
    );
  }
  if (!state.hasFirstSegment) {
    setShapeBoundsSegment(
      state.firstSegment,
      startX,
      startY,
      endX,
      endY,
      startTangentX,
      startTangentY,
      endTangentX,
      endTangentY,
    );
    state.hasFirstSegment = true;
  }
  setShapeBoundsSegment(
    state.pendingSegment,
    startX,
    startY,
    endX,
    endY,
    startTangentX,
    startTangentY,
    endTangentX,
    endTangentY,
  );
  state.hasPendingSegment = true;
}

function closeShapeBoundsPath(state: ShapeBoundsLaneState): void {
  if (!state.hasCurrentPoint) return;
  if (state.writesStroke && state.hasStroke && state.hasPendingSegment) {
    const dx = state.subpathStartX - state.penX;
    const dy = state.subpathStartY - state.penY;
    if (dx !== 0 || dy !== 0) {
      setShapeBoundsTangent(state.tangentStart, dx, dy);
      expandShapeBoundsLine(state, state.penX, state.penY, state.subpathStartX, state.subpathStartY);
      appendShapeBoundsSegment(
        state,
        state.penX,
        state.penY,
        state.subpathStartX,
        state.subpathStartY,
        state.tangentStart.x,
        state.tangentStart.y,
        state.tangentStart.x,
        state.tangentStart.y,
      );
    }
    if (state.hasFirstSegment && state.hasPendingSegment) {
      expandShapeBoundsJoin(
        state,
        state.subpathStartX,
        state.subpathStartY,
        state.pendingSegment.endTangentX,
        state.pendingSegment.endTangentY,
        state.firstSegment.startTangentX,
        state.firstSegment.startTangentY,
      );
    }
  }
  state.penX = state.subpathStartX;
  state.penY = state.subpathStartY;
  state.hasFirstSegment = false;
  state.hasPendingSegment = false;
}

function createShapeBoundsAccumulator(): ShapeBoundsAccumulator {
  return { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity };
}

function createShapeBoundsContext(state: ShapeBoundsLaneState): ShapeBoundsContext {
  return {
    closePath: () => closeShapeBoundsPath(state),
    cubicCurveTo: (controlX1, controlY1, controlX2, controlY2, anchorX, anchorY) =>
      cubicShapeBoundsCurveTo(state, controlX1, controlY1, controlX2, controlY2, anchorX, anchorY),
    curveTo: (controlX, controlY, anchorX, anchorY) =>
      quadraticShapeBoundsCurveTo(state, controlX, controlY, anchorX, anchorY),
    drawCircle: (x, y, radius) => drawShapeBoundsCircle(state, x, y, radius),
    drawEllipse: (x, y, width, height) => drawShapeBoundsEllipse(state, x, y, width, height),
    drawRectangle: (x, y, width, height) => drawShapeBoundsRectangle(state, x, y, width, height),
    expandPoint: (x, y) => expandShapeBoundsPointForLane(state, x, y),
    flushPath: () => flushShapeBoundsPath(state),
    lineTo: (x, y) => lineShapeBoundsTo(state, x, y),
    moveTo: (x, y) => moveShapeBoundsTo(state, x, y),
    setStrokeStyle: (width, caps, joints, miterLimit) =>
      setShapeBoundsStrokeStyle(state, width, caps, joints, miterLimit),
  };
}

function createShapeBoundsLaneState(accumulator: ShapeBoundsAccumulator, writesStroke: boolean): ShapeBoundsLaneState {
  return {
    accumulator,
    firstSegment: createShapeBoundsSegment(),
    hasCurrentPoint: false,
    hasFirstSegment: false,
    hasPendingSegment: false,
    hasStroke: false,
    pendingSegment: createShapeBoundsSegment(),
    penX: 0,
    penY: 0,
    strokeCap: 'none',
    strokeJoin: 'round',
    strokeMiterLimit: 3,
    strokeWidth: DEFAULT_SHAPE_STROKE_WIDTH,
    subpathStartX: 0,
    subpathStartY: 0,
    tangentEnd: { x: 0, y: 0 },
    tangentStart: { x: 0, y: 0 },
    writesStroke,
  };
}

function createShapeBoundsSegment(): ShapeBoundsSegment {
  return {
    endTangentX: 0,
    endTangentY: 0,
    endX: 0,
    endY: 0,
    startTangentX: 0,
    startTangentY: 0,
    startX: 0,
    startY: 0,
  };
}

function createShapeCommandArgumentCursor(commands: readonly ShapeCommandToken[]): ShapeCommandArgumentCursorInternal {
  const cursor: ShapeCommandArgumentCursorInternal = {
    argumentCount: 0,
    argumentOffset: 0,
    commands,
    get length() {
      return cursor.argumentCount;
    },
    getArgument(relativeIndex) {
      if (relativeIndex < 0 || relativeIndex >= cursor.argumentCount) return undefined;
      return cursor.commands[cursor.argumentOffset + relativeIndex];
    },
  };
  return cursor;
}

function cubicShapeBoundsCurveTo(
  state: ShapeBoundsLaneState,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
): void {
  ensureShapeBoundsCurrentPoint(state);
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) {
    expandShapeBoundsCubic(
      state.accumulator,
      state.penX,
      state.penY,
      controlX1,
      controlY1,
      controlX2,
      controlY2,
      anchorX,
      anchorY,
      padding,
    );
  }
  if (state.writesStroke && state.hasStroke) {
    setShapeBoundsTangent(state.tangentStart, controlX1 - state.penX, controlY1 - state.penY);
    if (state.tangentStart.x === 0 && state.tangentStart.y === 0) {
      setShapeBoundsTangent(state.tangentStart, controlX2 - state.penX, controlY2 - state.penY);
    }
    if (state.tangentStart.x === 0 && state.tangentStart.y === 0) {
      setShapeBoundsTangent(state.tangentStart, anchorX - state.penX, anchorY - state.penY);
    }
    setShapeBoundsTangent(state.tangentEnd, anchorX - controlX2, anchorY - controlY2);
    if (state.tangentEnd.x === 0 && state.tangentEnd.y === 0) {
      setShapeBoundsTangent(state.tangentEnd, anchorX - controlX1, anchorY - controlY1);
    }
    if (state.tangentEnd.x === 0 && state.tangentEnd.y === 0) {
      setShapeBoundsTangent(state.tangentEnd, anchorX - state.penX, anchorY - state.penY);
    }
    appendShapeBoundsSegment(
      state,
      state.penX,
      state.penY,
      anchorX,
      anchorY,
      state.tangentStart.x,
      state.tangentStart.y,
      state.tangentEnd.x,
      state.tangentEnd.y,
    );
  }
  state.penX = anchorX;
  state.penY = anchorY;
}

function drawShapeBoundsCircle(state: ShapeBoundsLaneState, x: number, y: number, radius: number): void {
  finishShapeBoundsOpenSubpath(state, false);
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) {
    const magnitude = Math.abs(radius);
    expandShapeBoundsPoint(state.accumulator, x - magnitude, y - magnitude, padding);
    expandShapeBoundsPoint(state.accumulator, x + magnitude, y + magnitude, padding);
  }
  state.hasCurrentPoint = true;
  state.penX = x + radius;
  state.penY = y;
  state.subpathStartX = state.penX;
  state.subpathStartY = state.penY;
}

function drawShapeBoundsEllipse(
  state: ShapeBoundsLaneState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  finishShapeBoundsOpenSubpath(state, false);
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) {
    expandShapeBoundsPoint(state.accumulator, Math.min(x, x + width), Math.min(y, y + height), padding);
    expandShapeBoundsPoint(state.accumulator, Math.max(x, x + width), Math.max(y, y + height), padding);
  }
  state.hasCurrentPoint = true;
  state.penX = x + width;
  state.penY = y + height / 2;
  state.subpathStartX = state.penX;
  state.subpathStartY = state.penY;
}

function drawShapeBoundsRectangle(
  state: ShapeBoundsLaneState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  finishShapeBoundsOpenSubpath(state, false);
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) {
    expandShapeBoundsPoint(state.accumulator, Math.min(x, x + width), Math.min(y, y + height), padding);
    expandShapeBoundsPoint(state.accumulator, Math.max(x, x + width), Math.max(y, y + height), padding);
  }
  state.hasCurrentPoint = true;
  state.penX = x;
  state.penY = y;
  state.subpathStartX = x;
  state.subpathStartY = y;
}

function ensureShapeBoundsCurrentPoint(state: ShapeBoundsLaneState): void {
  if (state.hasCurrentPoint) return;
  state.hasCurrentPoint = true;
  state.penX = 0;
  state.penY = 0;
  state.subpathStartX = 0;
  state.subpathStartY = 0;
}

function expandShapeBoundsCubic(
  accumulator: ShapeBoundsAccumulator,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  padding: number,
): void {
  expandShapeBoundsPoint(accumulator, p0x, p0y, padding);
  expandShapeBoundsPoint(accumulator, p3x, p3y, padding);
  expandShapeBoundsCubicAxis(accumulator, p0x, p1x, p2x, p3x, p0y, p1y, p2y, p3y, padding, true);
  expandShapeBoundsCubicAxis(accumulator, p0y, p1y, p2y, p3y, p0x, p1x, p2x, p3x, padding, false);
}

function expandShapeBoundsCubicAxis(
  accumulator: ShapeBoundsAccumulator,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  q0: number,
  q1: number,
  q2: number,
  q3: number,
  padding: number,
  primaryIsX: boolean,
): void {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = -p0 + p1;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) {
        expandShapeBoundsCubicAxisPoint(accumulator, t, p0, p1, p2, p3, q0, q1, q2, q3, padding, primaryIsX);
      }
    }
    return;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return;
  const root = Math.sqrt(discriminant);
  const t1 = (-b + root) / (2 * a);
  const t2 = (-b - root) / (2 * a);
  if (t1 > 0 && t1 < 1) {
    expandShapeBoundsCubicAxisPoint(accumulator, t1, p0, p1, p2, p3, q0, q1, q2, q3, padding, primaryIsX);
  }
  if (t2 > 0 && t2 < 1) {
    expandShapeBoundsCubicAxisPoint(accumulator, t2, p0, p1, p2, p3, q0, q1, q2, q3, padding, primaryIsX);
  }
}

function expandShapeBoundsCubicAxisPoint(
  accumulator: ShapeBoundsAccumulator,
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  q0: number,
  q1: number,
  q2: number,
  q3: number,
  padding: number,
  primaryIsX: boolean,
): void {
  const primary = getShapeBoundsCubicPoint(t, p0, p1, p2, p3);
  const secondary = getShapeBoundsCubicPoint(t, q0, q1, q2, q3);
  if (primaryIsX) expandShapeBoundsPoint(accumulator, primary, secondary, padding);
  else expandShapeBoundsPoint(accumulator, secondary, primary, padding);
}

function expandShapeBoundsJoin(
  state: ShapeBoundsLaneState,
  x: number,
  y: number,
  incomingX: number,
  incomingY: number,
  outgoingX: number,
  outgoingY: number,
): void {
  if (state.strokeJoin !== 'miter') return;
  const cross = incomingX * outgoingY - incomingY * outgoingX;
  if (Math.abs(cross) < 1e-8) return;
  const halfWidth = state.strokeWidth / 2;
  const incomingNormalX = -incomingY;
  const incomingNormalY = incomingX;
  const outgoingNormalX = -outgoingY;
  const outgoingNormalY = outgoingX;
  const deltaX = (outgoingNormalX - incomingNormalX) * halfWidth;
  const deltaY = (outgoingNormalY - incomingNormalY) * halfWidth;
  const distance = (deltaX * outgoingY - deltaY * outgoingX) / cross;
  const miterX = x + incomingNormalX * halfWidth + incomingX * distance;
  const miterY = y + incomingNormalY * halfWidth + incomingY * distance;
  const length = Math.hypot(miterX - x, miterY - y);
  if (length > halfWidth * state.strokeMiterLimit) return;
  expandShapeBoundsPoint(state.accumulator, miterX, miterY, 0);
  expandShapeBoundsPoint(state.accumulator, x * 2 - miterX, y * 2 - miterY, 0);
}

function expandShapeBoundsLine(
  state: ShapeBoundsLaneState,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): void {
  const padding = getShapeBoundsLanePadding(state);
  if (padding < 0) return;
  expandShapeBoundsPoint(state.accumulator, startX, startY, padding);
  expandShapeBoundsPoint(state.accumulator, endX, endY, padding);
}

function expandShapeBoundsPoint(accumulator: ShapeBoundsAccumulator, x: number, y: number, padding: number): void {
  accumulator.minX = Math.min(accumulator.minX, x - padding);
  accumulator.minY = Math.min(accumulator.minY, y - padding);
  accumulator.maxX = Math.max(accumulator.maxX, x + padding);
  accumulator.maxY = Math.max(accumulator.maxY, y + padding);
}

function expandShapeBoundsPointForLane(state: ShapeBoundsLaneState, x: number, y: number): void {
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) expandShapeBoundsPoint(state.accumulator, x, y, padding);
}

function expandShapeBoundsQuadratic(
  accumulator: ShapeBoundsAccumulator,
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  padding: number,
): void {
  expandShapeBoundsPoint(accumulator, p0x, p0y, padding);
  expandShapeBoundsPoint(accumulator, p2x, p2y, padding);
  const denominatorX = p0x - 2 * p1x + p2x;
  if (denominatorX !== 0) {
    const t = (p0x - p1x) / denominatorX;
    if (t > 0 && t < 1) {
      expandShapeBoundsPoint(
        accumulator,
        getShapeBoundsQuadraticPoint(t, p0x, p1x, p2x),
        getShapeBoundsQuadraticPoint(t, p0y, p1y, p2y),
        padding,
      );
    }
  }
  const denominatorY = p0y - 2 * p1y + p2y;
  if (denominatorY !== 0) {
    const t = (p0y - p1y) / denominatorY;
    if (t > 0 && t < 1) {
      expandShapeBoundsPoint(
        accumulator,
        getShapeBoundsQuadraticPoint(t, p0x, p1x, p2x),
        getShapeBoundsQuadraticPoint(t, p0y, p1y, p2y),
        padding,
      );
    }
  }
}

function finishShapeBoundsOpenSubpath(state: ShapeBoundsLaneState, resetCurrentPoint: boolean): void {
  if (state.writesStroke && state.hasStroke && state.hasPendingSegment) {
    if (state.strokeCap === 'square') {
      expandShapeBoundsSquareCap(state, state.firstSegment.startX, state.firstSegment.startY, -1);
      expandShapeBoundsSquareCap(state, state.pendingSegment.endX, state.pendingSegment.endY, 1);
    }
  }
  state.hasFirstSegment = false;
  state.hasPendingSegment = false;
  if (resetCurrentPoint) state.hasCurrentPoint = false;
}

function expandShapeBoundsSquareCap(state: ShapeBoundsLaneState, x: number, y: number, direction: -1 | 1): void {
  const segment = direction < 0 ? state.firstSegment : state.pendingSegment;
  const tangentX = direction < 0 ? segment.startTangentX : segment.endTangentX;
  const tangentY = direction < 0 ? segment.startTangentY : segment.endTangentY;
  const halfWidth = state.strokeWidth / 2;
  const extensionX = tangentX * halfWidth * direction;
  const extensionY = tangentY * halfWidth * direction;
  const normalX = -tangentY * halfWidth;
  const normalY = tangentX * halfWidth;
  expandShapeBoundsPoint(state.accumulator, x + extensionX + normalX, y + extensionY + normalY, 0);
  expandShapeBoundsPoint(state.accumulator, x + extensionX - normalX, y + extensionY - normalY, 0);
}

function flushShapeBoundsPath(state: ShapeBoundsLaneState): void {
  finishShapeBoundsOpenSubpath(state, true);
}

function getShapeBoundsCubicPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function getShapeBoundsLanePadding(state: ShapeBoundsLaneState): number {
  if (!state.writesStroke) return 0;
  return state.hasStroke ? state.strokeWidth / 2 : -1;
}

function getShapeBoundsQuadraticPoint(t: number, p0: number, p1: number, p2: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

function lineShapeBoundsTo(state: ShapeBoundsLaneState, x: number, y: number): void {
  ensureShapeBoundsCurrentPoint(state);
  expandShapeBoundsLine(state, state.penX, state.penY, x, y);
  if (state.writesStroke && state.hasStroke) {
    setShapeBoundsTangent(state.tangentStart, x - state.penX, y - state.penY);
    appendShapeBoundsSegment(
      state,
      state.penX,
      state.penY,
      x,
      y,
      state.tangentStart.x,
      state.tangentStart.y,
      state.tangentStart.x,
      state.tangentStart.y,
    );
  }
  state.penX = x;
  state.penY = y;
}

function moveShapeBoundsTo(state: ShapeBoundsLaneState, x: number, y: number): void {
  finishShapeBoundsOpenSubpath(state, false);
  state.hasCurrentPoint = true;
  state.penX = x;
  state.penY = y;
  state.subpathStartX = x;
  state.subpathStartY = y;
}

function quadraticShapeBoundsCurveTo(
  state: ShapeBoundsLaneState,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  ensureShapeBoundsCurrentPoint(state);
  const padding = getShapeBoundsLanePadding(state);
  if (padding >= 0) {
    expandShapeBoundsQuadratic(
      state.accumulator,
      state.penX,
      state.penY,
      controlX,
      controlY,
      anchorX,
      anchorY,
      padding,
    );
  }
  if (state.writesStroke && state.hasStroke) {
    setShapeBoundsTangent(state.tangentStart, controlX - state.penX, controlY - state.penY);
    if (state.tangentStart.x === 0 && state.tangentStart.y === 0) {
      setShapeBoundsTangent(state.tangentStart, anchorX - state.penX, anchorY - state.penY);
    }
    setShapeBoundsTangent(state.tangentEnd, anchorX - controlX, anchorY - controlY);
    if (state.tangentEnd.x === 0 && state.tangentEnd.y === 0) {
      setShapeBoundsTangent(state.tangentEnd, anchorX - state.penX, anchorY - state.penY);
    }
    appendShapeBoundsSegment(
      state,
      state.penX,
      state.penY,
      anchorX,
      anchorY,
      state.tangentStart.x,
      state.tangentStart.y,
      state.tangentEnd.x,
      state.tangentEnd.y,
    );
  }
  state.penX = anchorX;
  state.penY = anchorY;
}

function setShapeBoundsSegment(
  out: ShapeBoundsSegment,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startTangentX: number,
  startTangentY: number,
  endTangentX: number,
  endTangentY: number,
): void {
  out.startX = startX;
  out.startY = startY;
  out.endX = endX;
  out.endY = endY;
  out.startTangentX = startTangentX;
  out.startTangentY = startTangentY;
  out.endTangentX = endTangentX;
  out.endTangentY = endTangentY;
}

function setShapeBoundsStrokeStyle(
  state: ShapeBoundsLaneState,
  width: number,
  caps: CapsStyle,
  joints: JointStyle,
  miterLimit: number,
): void {
  flushShapeBoundsPath(state);
  if (!state.writesStroke) return;
  state.strokeWidth = normalizeShapeStrokeWidth(width);
  state.hasStroke = state.strokeWidth > 0;
  state.strokeCap = caps;
  state.strokeJoin = joints;
  state.strokeMiterLimit = normalizeShapeStrokeMiterLimit(miterLimit);
}

function setShapeBoundsTangent(out: ShapeBoundsTangent, x: number, y: number): void {
  const length = Math.hypot(x, y);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = x / length;
  out.y = y / length;
}

function setShapeCommandArgumentCursor(
  cursor: ShapeCommandArgumentCursorInternal,
  argumentOffset: number,
  argumentCount: number,
): void {
  cursor.argumentOffset = argumentOffset;
  cursor.argumentCount = argumentCount;
}

function writeShapeBoundsRectangle(out: Rectangle, accumulator: Readonly<ShapeBoundsAccumulator>): void {
  if (accumulator.minX === Infinity) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return;
  }
  out.x = accumulator.minX;
  out.y = accumulator.minY;
  out.width = accumulator.maxX - accumulator.minX;
  out.height = accumulator.maxY - accumulator.minY;
}

export const defaultShapeBoundsDrawEllipse: ShapeBoundsCommandHandler = (context, command) => {
  context.drawEllipse(
    command.getArgument(0) as number,
    command.getArgument(1) as number,
    command.getArgument(2) as number,
    command.getArgument(3) as number,
  );
};

export const defaultShapeBoundsDrawPath: ShapeBoundsCommandHandler = (context, command) => {
  const pathCommands = command.getArgument(0) as readonly number[];
  const data = command.getArgument(1) as readonly number[];
  let dataIndex = 0;
  for (const pathCommand of pathCommands) {
    switch (pathCommand) {
      case 0:
        break;
      case 1:
        context.moveTo(data[dataIndex], data[dataIndex + 1]);
        dataIndex += 2;
        break;
      case 2:
        context.lineTo(data[dataIndex], data[dataIndex + 1]);
        dataIndex += 2;
        break;
      case 3:
        context.curveTo(data[dataIndex], data[dataIndex + 1], data[dataIndex + 2], data[dataIndex + 3]);
        dataIndex += 4;
        break;
      case 4:
        context.moveTo(data[dataIndex + 2], data[dataIndex + 3]);
        dataIndex += 4;
        break;
      case 5:
        context.lineTo(data[dataIndex + 2], data[dataIndex + 3]);
        dataIndex += 4;
        break;
      case 6:
        context.cubicCurveTo(
          data[dataIndex],
          data[dataIndex + 1],
          data[dataIndex + 2],
          data[dataIndex + 3],
          data[dataIndex + 4],
          data[dataIndex + 5],
        );
        dataIndex += 6;
        break;
      case 7:
        context.closePath();
        break;
    }
  }
};

export const defaultShapeBoundsDrawRectangle: ShapeBoundsCommandHandler = (context, command) => {
  context.drawRectangle(
    command.getArgument(0) as number,
    command.getArgument(1) as number,
    command.getArgument(2) as number,
    command.getArgument(3) as number,
  );
};

export const defaultShapeBoundsExpandPointPairs: ShapeBoundsCommandHandler = (context, command) => {
  const values = command.getArgument(0) as readonly number[];
  for (let i = 0; i + 1 < values.length; i += 2) context.expandPoint(values[i], values[i + 1]);
};

export const defaultShapeBoundsFlush: ShapeBoundsCommandHandler = (context) => {
  context.flushPath();
};

export const defaultShapeBoundsLineStyle: ShapeBoundsCommandHandler = (context, command) => {
  context.setStrokeStyle(
    command.getArgument(0) as number,
    command.getArgument(5) as CapsStyle,
    command.getArgument(6) as JointStyle,
    command.getArgument(7) as number,
  );
};

export const defaultShapeBoundsLineTo: ShapeBoundsCommandHandler = (context, command) => {
  context.lineTo(command.getArgument(0) as number, command.getArgument(1) as number);
};

export const defaultShapeBoundsMoveTo: ShapeBoundsCommandHandler = (context, command) => {
  context.moveTo(command.getArgument(0) as number, command.getArgument(1) as number);
};

export function explainShapeBounds(source: Readonly<Shape>, mode: ShapeBoundsMode = 'ink'): ShapeBoundsExplanation {
  const missingCommandKeys: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < source.data.commands.length) {
    const key = source.data.commands[i] as string;
    if (getShapeBoundsCommand(key) === null && !seen.has(key)) {
      seen.add(key);
      missingCommandKeys.push(key);
    }
    i += (source.data.commands[i + 1] as number) + 2;
  }
  return { complete: missingCommandKeys.length === 0, missingCommandKeys, mode };
}

export function normalizeShapeStrokeMiterLimit(miterLimit: number): number {
  return Number.isFinite(miterLimit) && miterLimit > 0 ? miterLimit : DEFAULT_SHAPE_STROKE_MITER_LIMIT;
}

export function normalizeShapeStrokeWidth(width: number): number {
  if (width === 0) return 0;
  return Number.isFinite(width) && width > 0 ? width : DEFAULT_SHAPE_STROKE_WIDTH;
}

export function setShapeBoundsGuard(guard: ShapeBoundsGuard | null): void {
  _shapeBoundsGuard = guard;
}

const DEFAULT_SHAPE_STROKE_MITER_LIMIT = 10;
const DEFAULT_SHAPE_STROKE_WIDTH = 1;
let _shapeBoundsGuard: ShapeBoundsGuard | null = null;
