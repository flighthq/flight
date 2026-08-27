import type { ShapeCommandKey } from './ShapeCommand';

// Runtime counterpart to ShapeCommandRegistry's compile-time labeled tuples. Argument names are
// authoring-format field names, while types and requiredArgumentCount are the positional validation
// contract shared by every command codec. Keeping all three together prevents a text codec and a
// positional codec from growing independent tables that can drift.
export interface ShapeCommandSchema<K extends ShapeCommandKey = ShapeCommandKey> {
  readonly arguments: readonly ShapeCommandSchemaArgument[];
  readonly key: K;
  readonly requiredArgumentCount: number;
}

export interface ShapeCommandSchemaArgument {
  readonly name: string;
  readonly type: ShapeCommandSchemaArgumentType;
}

export type ShapeCommandSchemaArgumentType =
  | 'boolean'
  | 'matrixOrNull'
  | 'number'
  | 'numbers'
  | 'numbersOrNull'
  | 'string'
  | 'texture';
