import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/types/contract';

export function flattenClipPath(out: number[][], path: Readonly<Path>, tolerance?: number): void {
  out.push(...flattenPath(path, tolerance));
}
