import type { ShapeCommand, ShapeCommandHitTest, ShapeCommandKey } from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hitTests = new Map<string, (x: number, y: number, ...args: any[]) => boolean>();

export function registerShapeCommandHitTest<K extends ShapeCommandKey>(key: K, fn: ShapeCommandHitTest<K>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hitTests.set(key, fn as (x: number, y: number, ...args: any[]) => boolean);
}

export function hitTestCommand(cmd: ShapeCommand, x: number, y: number): boolean | null {
  const handler = hitTests.get(cmd.key);
  if (handler === undefined) return null;
  return handler(x, y, ...(cmd.args as readonly unknown[]));
}
