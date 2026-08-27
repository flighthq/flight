import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type {
  KeyedTable,
  ShapeCommandKey,
  ShapeCommandSchema,
  ShapeCommandSchemaArgument,
} from '@flighthq/types/contract';

function createDefaultShapeCommandSchemas(): KeyedTable<ShapeCommandSchema> {
  let table = createKeyedTable<ShapeCommandSchema>('ShapeCommandSchema', 'Unregistered');
  for (const key of Object.keys(SHAPE_COMMAND_SCHEMA_ARGUMENTS) as ShapeCommandKey[]) {
    const schema = SHAPE_COMMAND_SCHEMA_ARGUMENTS[key];
    table = withRegistryTableEntry(table, key, {
      arguments: schema.arguments,
      key,
      requiredArgumentCount: schema.requiredArgumentCount,
    });
  }
  return table;
}

interface ShapeCommandSchemaDefinition {
  readonly arguments: readonly ShapeCommandSchemaArgument[];
  readonly requiredArgumentCount: number;
}

const gradientArguments: readonly ShapeCommandSchemaArgument[] = [
  argument('gradientType', 'string'),
  argument('colors', 'numbers'),
  argument('alphas', 'numbers'),
  argument('ratios', 'numbers'),
  argument('matrix', 'matrixOrNull'),
  argument('spreadMethod', 'string'),
  argument('interpolationMethod', 'string'),
  argument('focalPointRatio', 'number'),
];

const textureArguments: readonly ShapeCommandSchemaArgument[] = [
  argument('texture', 'texture'),
  argument('matrix', 'matrixOrNull'),
];

const SHAPE_COMMAND_SCHEMA_ARGUMENTS = {
  beginTextureFill: definition(1, textureArguments),
  beginFill: definition(0, [argument('color', 'number'), argument('alpha', 'number')]),
  beginGradientFill: definition(4, gradientArguments),
  cubicCurveTo: definition(6, [
    argument('controlX1', 'number'),
    argument('controlY1', 'number'),
    argument('controlX2', 'number'),
    argument('controlY2', 'number'),
    argument('anchorX', 'number'),
    argument('anchorY', 'number'),
  ]),
  curveTo: definition(4, [
    argument('controlX', 'number'),
    argument('controlY', 'number'),
    argument('anchorX', 'number'),
    argument('anchorY', 'number'),
  ]),
  drawCircle: definition(3, [argument('x', 'number'), argument('y', 'number'), argument('radius', 'number')]),
  drawEllipse: definition(4, [
    argument('x', 'number'),
    argument('y', 'number'),
    argument('width', 'number'),
    argument('height', 'number'),
  ]),
  drawPath: definition(2, [
    argument('commands', 'numbers'),
    argument('data', 'numbers'),
    argument('winding', 'string'),
  ]),
  drawRectangle: definition(4, [
    argument('x', 'number'),
    argument('y', 'number'),
    argument('width', 'number'),
    argument('height', 'number'),
  ]),
  drawRoundRectangle: definition(6, [
    argument('x', 'number'),
    argument('y', 'number'),
    argument('width', 'number'),
    argument('height', 'number'),
    argument('ellipseWidth', 'number'),
    argument('ellipseHeight', 'number'),
  ]),
  drawTriangles: definition(1, [
    argument('vertices', 'numbers'),
    argument('indices', 'numbersOrNull'),
    argument('uvtData', 'numbersOrNull'),
    argument('culling', 'string'),
  ]),
  endFill: definition(0, []),
  lineTextureStyle: definition(1, textureArguments),
  lineGradientStyle: definition(4, gradientArguments),
  lineStyle: definition(0, [
    argument('thickness', 'number'),
    argument('color', 'number'),
    argument('alpha', 'number'),
    argument('pixelHinting', 'boolean'),
    argument('scaleMode', 'string'),
    argument('caps', 'string'),
    argument('joints', 'string'),
    argument('miterLimit', 'number'),
  ]),
  lineTo: definition(2, [argument('x', 'number'), argument('y', 'number')]),
  moveTo: definition(2, [argument('x', 'number'), argument('y', 'number')]),
} satisfies Readonly<Record<ShapeCommandKey, ShapeCommandSchemaDefinition>>;

// The one runtime schema table for the built-in retained-shape vocabulary. Native shape JSON uses
// its positional types and arity; scene-document text uses the same entries' argument names. Custom
// commands belong in a caller-owned table assembled with the same KeyedTable vocabulary.
export const defaultShapeCommandSchemas: KeyedTable<ShapeCommandSchema> = createDefaultShapeCommandSchemas();

function argument(name: string, type: ShapeCommandSchemaArgument['type']): ShapeCommandSchemaArgument {
  return { name, type };
}

function definition(
  requiredArgumentCount: number,
  arguments_: readonly ShapeCommandSchemaArgument[],
): ShapeCommandSchemaDefinition {
  return { arguments: arguments_, requiredArgumentCount };
}
