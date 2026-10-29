import { StatechartComparison } from './types.ts';
import type { StatechartInputKind } from './types.ts';

export function isStatechartComparison(value: StatechartComparison): boolean {
  return (
    value === StatechartComparison.Equal ||
    value === StatechartComparison.GreaterThan ||
    value === StatechartComparison.GreaterThanOrEqual ||
    value === StatechartComparison.LessThan ||
    value === StatechartComparison.LessThanOrEqual ||
    value === StatechartComparison.NotEqual
  );
}

export function isStatechartInteger(value: number): boolean {
  return Number.isInteger(value);
}

export function isStatechartString(value: string): boolean {
  return typeof value === 'string';
}

export function throwStatechartInputKindTypeError(
  inputIndex: number,
  kind: StatechartInputKind,
  expectedKind: StatechartInputKind,
): never {
  throw new TypeError(`Statechart input ${inputIndex} is ${String(kind)}, not ${String(expectedKind)}`);
}

export function throwStatechartTypeError(message: string): never {
  throw new TypeError(message);
}

export function throwStatechartUnknownInputKindTypeError(inputIndex: number, kind: StatechartInputKind): never {
  throw new TypeError(`Statechart input ${inputIndex} has unknown kind ${String(kind)}`);
}
