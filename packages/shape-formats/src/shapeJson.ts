import { createMatrix } from '@flighthq/geometry';
import {
  appendShapeBeginBitmapFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeDrawTriangles,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineBitmapStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createShape,
} from '@flighthq/shape';
import type { Shape, ShapeJsonFormatOptions, ShapeJsonParseOptions } from '@flighthq/types';

// Serializes a shape's full drawing-command stream to a native JSON string that `parseShapeJson`
// restores losslessly. Every non-bitmap command round-trips exactly; `beginBitmapFill`/
// `lineBitmapStyle` resources serialize as an ordinal `ShapeBitmapReference` (see the type) rather
// than the live `ImageResource`.
export function formatShapeJson(shape: Readonly<Shape>, options?: Readonly<ShapeJsonFormatOptions>): string {
  const commands = shape.data.commands;
  const entries: SerializedShapeCommand[] = [];
  let bitmapOrdinal = 0;
  let i = 0;
  while (i < commands.length) {
    const key = commands[i] as string;
    const argCount = commands[i + 1] as number;
    const base = i + 2;
    const args: unknown[] = [];
    for (let a = 0; a < argCount; a++) {
      const value = commands[base + a];
      if (value === null) {
        // An omitted fill/line matrix, or absent triangle indices/uv data.
        args.push(null);
      } else if (isMatrixValue(value)) {
        args.push({ a: value.a, b: value.b, c: value.c, d: value.d, tx: value.tx, ty: value.ty });
      } else if (isSerializableScalarOrArray(value)) {
        // Numbers, strings (enum keywords), booleans, and numeric arrays (colors/ratios, path
        // data/commands, triangle vertices) serialize verbatim through JSON.
        args.push(value);
      } else {
        // The only remaining object arg in the command registry is a live `ImageResource` bitmap;
        // it has no serializable id, so it becomes an ordinal reference resolved on parse.
        args.push({ bitmap: { index: bitmapOrdinal++ } });
      }
    }
    entries.push({ key, args });
    i += argCount + 2;
  }
  return JSON.stringify({ shapeFormat: SHAPE_JSON_FORMAT, commands: entries }, null, options?.space);
}

// Restores a `Shape` from a `formatShapeJson` string by replaying each command through the matching
// `appendShape*` builder. Returns `null` for malformed JSON, a missing/mismatched `shapeFormat`
// version tag, a non-array `commands` field, a malformed command entry, an unknown command key, or a
// malformed argument. Bitmap-bearing commands whose reference cannot be resolved are dropped.
export function parseShapeJson(text: string, options?: Readonly<ShapeJsonParseOptions>): Shape | null {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(root)) return null;
  if (root.shapeFormat !== SHAPE_JSON_FORMAT) return null;
  const rawCommands = root.commands;
  if (!Array.isArray(rawCommands)) return null;

  const resolveBitmap = options?.resolveBitmap;
  const shape = createShape();
  for (const entry of rawCommands) {
    if (!isPlainObject(entry)) return null;
    const key = entry.key;
    const rawArgs = entry.args;
    if (typeof key !== 'string' || !Array.isArray(rawArgs)) return null;
    const appender = SHAPE_COMMAND_APPENDERS[key];
    if (appender === undefined) return null;

    const args: unknown[] = [];
    let drop = false;
    for (const raw of rawArgs) {
      const reconstructed = reconstructShapeCommandArg(raw, resolveBitmap);
      if (reconstructed === MALFORMED_ARG) return null;
      if (reconstructed === DROP_COMMAND) {
        drop = true;
        break;
      }
      args.push(reconstructed);
    }
    if (drop) continue;
    appender(shape, ...(args as never[]));
  }
  return shape;
}

// Rebuilds a single command argument from its serialized form. Returns `MALFORMED_ARG` for an
// unrecognized object shape and `DROP_COMMAND` when a bitmap reference cannot be resolved.
function reconstructShapeCommandArg(value: unknown, resolveBitmap: ShapeJsonParseOptions['resolveBitmap']): unknown {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'number' || type === 'string' || type === 'boolean') return value;
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) return MALFORMED_ARG;
  if (isPlainObject(value.bitmap) && typeof value.bitmap.index === 'number') {
    const resolved = resolveBitmap?.({ index: value.bitmap.index }) ?? null;
    return resolved === null ? DROP_COMMAND : resolved;
  }
  if (
    typeof value.a === 'number' &&
    typeof value.b === 'number' &&
    typeof value.c === 'number' &&
    typeof value.d === 'number' &&
    typeof value.tx === 'number' &&
    typeof value.ty === 'number'
  ) {
    return createMatrix(value.a, value.b, value.c, value.d, value.tx, value.ty);
  }
  return MALFORMED_ARG;
}

function isMatrixValue(
  value: unknown,
): value is { a: number; b: number; c: number; d: number; tx: number; ty: number } {
  return (
    isPlainObject(value) &&
    typeof value.a === 'number' &&
    typeof value.b === 'number' &&
    typeof value.c === 'number' &&
    typeof value.d === 'number' &&
    typeof value.tx === 'number' &&
    typeof value.ty === 'number'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSerializableScalarOrArray(value: unknown): boolean {
  const type = typeof value;
  return type === 'number' || type === 'string' || type === 'boolean' || Array.isArray(value);
}

// Maps a command-buffer key to the builder that reappends it. Heterogeneous arities are erased to a
// common shape via `never[]` so the parser can spread reconstructed args positionally; each builder
// reads them back in the same order the buffer stored them.
type ShapeCommandAppender = (shape: Shape, ...args: never[]) => void;

interface SerializedShapeCommand {
  key: string;
  args: unknown[];
}

// Sentinel returned when a command argument is structurally invalid; parse aborts to `null`.
const MALFORMED_ARG = Symbol('shapeFormats.malformedArg');

// Sentinel returned when a bitmap reference cannot be resolved; the owning command is dropped.
const DROP_COMMAND = Symbol('shapeFormats.dropCommand');

const SHAPE_JSON_FORMAT = 1;

const SHAPE_COMMAND_APPENDERS: Readonly<Record<string, ShapeCommandAppender>> = {
  beginBitmapFill: appendShapeBeginBitmapFill,
  beginFill: appendShapeBeginFill,
  beginGradientFill: appendShapeBeginGradientFill,
  cubicCurveTo: appendShapeCubicCurveTo,
  curveTo: appendShapeCurveTo,
  drawCircle: appendShapeCircle,
  drawEllipse: appendShapeEllipse,
  drawPath: appendShapePath,
  drawRectangle: appendShapeRectangle,
  drawRoundRectangle: appendShapeRoundRectangle,
  drawTriangles: appendShapeDrawTriangles,
  endFill: appendShapeEndFill,
  lineBitmapStyle: appendShapeLineBitmapStyle,
  lineGradientStyle: appendShapeLineGradientStyle,
  lineStyle: appendShapeLineStyle,
  lineTo: appendShapeLineTo,
  moveTo: appendShapeMoveTo,
};
