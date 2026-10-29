import { createPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

export function appendLassoClose(path: Path): void {
  path.commands.push(7);
}

export function appendLassoLineTo(path: Path, x: number, y: number): void {
  path.commands.push(2);
  path.data.push(x, y);
}

export function appendLassoMoveTo(path: Path, x: number, y: number): void {
  path.commands.push(1);
  path.data.push(x, y);
}

export function createLassoPath(): Path {
  return createPath('evenOdd');
}
