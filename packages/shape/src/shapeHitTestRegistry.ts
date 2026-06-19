import type { ShapeCommandKey, ShapeHitTestCommand } from '@flighthq/types';

type AnyHitTestFn = (x: number, y: number, buf: unknown[], i: number) => boolean;

const hitTests = new Map<string, AnyHitTestFn>();

// Tests the command at position i in buf. Args begin at i+2 (after key and argCount).
export function hitTestShapeCommandPoint(buf: unknown[], i: number, x: number, y: number): boolean | null {
  const key = buf[i] as string;
  const fn = hitTests.get(key);
  if (fn === undefined) return null;
  return fn(x, y, buf, i + 2);
}

export function registerShapeHitTestCommand<K extends ShapeCommandKey>(command: ShapeHitTestCommand<K>): void {
  hitTests.set(command.key, command.hitTest as AnyHitTestFn);
}
