import { createMatrix } from '@flighthq/geometry/contract';
import {
  appendShapeBeginTextureFill,
  appendShapeBeginFill,
  appendShapeBeginGradientFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeDrawTriangles,
  appendShapeEllipse,
  appendShapeEndFill,
  appendShapeLineTextureStyle,
  appendShapeLineGradientStyle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapePath,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createShape,
} from '@flighthq/shape/contract';
import type { Shape, ShapeJsonFormatOptions, ShapeJsonParseOptions } from '@flighthq/types/contract';

// Serializes a shape's full drawing-command stream to a native JSON string that `parseShapeJson`
// restores. Every non-texture command round-trips exactly, with one exception the format cannot
// represent: JSON has no NaN or Infinity literal, so a non-finite coordinate is written as `null` and
// the document will not parse back. That is deliberate — the alternative is restoring a shape whose
// geometry silently differs from the one serialized. `beginTextureFill`/`lineTextureStyle` textures
// serialize as an ordinal `ShapeTextureReference` (see the type) rather than the live `Texture`.
export function formatShapeJson(shape: Readonly<Shape>, options?: Readonly<ShapeJsonFormatOptions>): string {
  const commands = shape.data.commands;
  const entries: SerializedShapeCommand[] = [];
  let textureOrdinal = 0;
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
      } else if (isMatrixLike(value)) {
        args.push({ a: value.a, b: value.b, c: value.c, d: value.d, tx: value.tx, ty: value.ty });
      } else if (isSerializableScalarOrArray(value)) {
        // Numbers, strings (enum keywords), booleans, and numeric arrays (colors/ratios, path
        // data/commands, triangle vertices) serialize verbatim through JSON.
        args.push(value);
      } else {
        // The only remaining object arg in the command registry is a live Texture;
        // it has no serializable id, so it becomes an ordinal reference resolved on parse.
        args.push({ texture: { index: textureOrdinal++ } });
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
// malformed argument — where malformed covers the argument *list* as well as each value: a count
// outside the command's arity, a value of the wrong positional type, or a non-finite number.
// Texture-bearing commands whose reference cannot be resolved are dropped rather than rejected, since
// an unresolved reference is a missing asset rather than a malformed document.
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

  const resolveTexture = options?.resolveTexture;
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
      const reconstructed = reconstructShapeCommandArg(raw, resolveTexture);
      if (reconstructed === MALFORMED_ARG) return null;
      if (reconstructed === DROP_COMMAND) {
        drop = true;
        break;
      }
      args.push(reconstructed);
    }
    if (drop) continue;
    if (!isValidShapeCommandArgs(key, args)) return null;
    appender(shape, ...(args as never[]));
  }
  return shape;
}

// Rebuilds a single command argument from its serialized form. Returns `MALFORMED_ARG` for an
// unrecognized object shape and `DROP_COMMAND` when a texture reference cannot be resolved.
function reconstructShapeCommandArg(value: unknown, resolveTexture: ShapeJsonParseOptions['resolveTexture']): unknown {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'number' || type === 'string' || type === 'boolean') return value;
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) return MALFORMED_ARG;
  if (isPlainObject(value.texture) && typeof value.texture.index === 'number') {
    const resolved = resolveTexture?.({ index: value.texture.index }) ?? null;
    return resolved === null ? DROP_COMMAND : resolved;
  }
  if (isMatrixValue(value)) {
    return createMatrix(value.a, value.b, value.c, value.d, value.tx, value.ty);
  }
  return MALFORMED_ARG;
}

// Checks a reconstructed argument list against the appender's declared shape. Without this the parser
// validated only that an entry *looked* like a command and then spread whatever it found: too few args
// left required parameters undefined, wrong-typed args wrote strings into numeric slots, and extra args
// were dropped without complaint — each producing a corrupt Shape rather than the documented null.
//
// Runs after reconstruction, so matrices are already Matrix values and textures already resolved, and
// after the drop check, so an unresolved texture is still a dropped command rather than a parse failure.
function isValidShapeCommandArgs(key: string, args: readonly unknown[]): boolean {
  const spec = SHAPE_COMMAND_ARG_SPECS[key];
  // Treating a missing spec as invalid is what makes the two tables self-checking: a key that gained
  // an appender without a spec would make its own command unparseable, so the full-vocabulary
  // round-trip test fails the moment they drift apart.
  if (spec === undefined) return false;
  if (args.length < spec.required || args.length > spec.types.length) return false;
  for (let i = 0; i < args.length; i++) {
    if (!isValidShapeCommandArg(args[i], spec.types[i]!)) return false;
  }
  return true;
}

function isValidShapeCommandArg(value: unknown, type: ShapeCommandArgType): boolean {
  switch (type) {
    // Non-finite values are rejected here rather than passed through: JSON has no NaN or Infinity
    // literal, so a NaN in a shape serializes as `null` and an out-of-range literal like 1e999 parses
    // back as Infinity. Either one silently changes the geometry it describes.
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'numbers':
      return isFiniteNumberArray(value);
    case 'numbersOrNull':
      return value === null || isFiniteNumberArray(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'matrixOrNull':
      return value === null || isMatrixValue(value);
    // Already resolved by resolveTexture, which returns either a Texture or null; a null resolution
    // dropped the command before reaching here, so anything left is the caller's own object.
    case 'texture':
      return typeof value === 'object' && value !== null;
  }
}

function isFiniteNumberArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return false;
  }
  return true;
}

function isMatrixValue(
  value: unknown,
): value is { a: number; b: number; c: number; d: number; tx: number; ty: number } {
  return (
    isMatrixLike(value) &&
    Number.isFinite(value.a) &&
    Number.isFinite(value.b) &&
    Number.isFinite(value.c) &&
    Number.isFinite(value.d) &&
    Number.isFinite(value.tx) &&
    Number.isFinite(value.ty)
  );
}

function isMatrixLike(value: unknown): value is { a: number; b: number; c: number; d: number; tx: number; ty: number } {
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

// Sentinel returned when a texture reference cannot be resolved; the owning command is dropped.
const DROP_COMMAND = Symbol('shapeFormats.dropCommand');

const SHAPE_JSON_FORMAT = 2;

type ShapeCommandArgType = 'boolean' | 'matrixOrNull' | 'number' | 'numbers' | 'numbersOrNull' | 'string' | 'texture';

// The positional shape of each command's arguments, mirroring the appendShape* signatures one-for-one.
// `required` is the count of leading parameters with no default, so a hand-written document may omit
// trailing optional args and let the appender's own defaults apply; `types` bounds the maximum. The
// serializer always writes the full stored arity, so a round-tripped document uses the upper bound.
interface ShapeCommandArgSpec {
  required: number;
  types: readonly ShapeCommandArgType[];
}

const GRADIENT_ARG_SPEC: ShapeCommandArgSpec = {
  required: 4,
  types: ['string', 'numbers', 'numbers', 'numbers', 'matrixOrNull', 'string', 'string', 'number'],
};

const TEXTURE_ARG_SPEC: ShapeCommandArgSpec = { required: 1, types: ['texture', 'matrixOrNull'] };

const SHAPE_COMMAND_ARG_SPECS: Readonly<Record<string, ShapeCommandArgSpec>> = {
  beginTextureFill: TEXTURE_ARG_SPEC,
  beginFill: { required: 0, types: ['number', 'number'] },
  beginGradientFill: GRADIENT_ARG_SPEC,
  cubicCurveTo: { required: 6, types: ['number', 'number', 'number', 'number', 'number', 'number'] },
  curveTo: { required: 4, types: ['number', 'number', 'number', 'number'] },
  drawCircle: { required: 3, types: ['number', 'number', 'number'] },
  drawEllipse: { required: 4, types: ['number', 'number', 'number', 'number'] },
  drawPath: { required: 2, types: ['numbers', 'numbers', 'string'] },
  drawRectangle: { required: 4, types: ['number', 'number', 'number', 'number'] },
  drawRoundRectangle: {
    required: 6,
    types: ['number', 'number', 'number', 'number', 'number', 'number'],
  },
  drawTriangles: { required: 1, types: ['numbers', 'numbersOrNull', 'numbersOrNull', 'string'] },
  endFill: { required: 0, types: [] },
  lineTextureStyle: TEXTURE_ARG_SPEC,
  lineGradientStyle: GRADIENT_ARG_SPEC,
  lineStyle: {
    required: 0,
    types: ['number', 'number', 'number', 'boolean', 'string', 'string', 'string', 'number'],
  },
  lineTo: { required: 2, types: ['number', 'number'] },
  moveTo: { required: 2, types: ['number', 'number'] },
};

const SHAPE_COMMAND_APPENDERS: Readonly<Record<string, ShapeCommandAppender>> = {
  beginTextureFill: appendShapeBeginTextureFill,
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
  lineTextureStyle: appendShapeLineTextureStyle,
  lineGradientStyle: appendShapeLineGradientStyle,
  lineStyle: appendShapeLineStyle,
  lineTo: appendShapeLineTo,
  moveTo: appendShapeMoveTo,
};
