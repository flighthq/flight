import { allocateEntity, finishEntity } from '@flighthq/entity/contract';

import type { PathRaw } from './path.ts';

/**
 * Allocates a new `Path` that is a deep copy of `source`.
 */
export function clonePath(source: Readonly<PathRaw>): PathRaw {
  let out: PathRaw = Object.assign(allocateEntity<PathRaw>(), { commands: [], data: [], winding: 'nonZero' });
  copyPath(out, source);
  return finishEntity(out);
}

/**
 * Copies commands, data, and winding into the caller's path, retaining its field storage.
 */
export function copyPath(out: PathRaw, source: Readonly<PathRaw>): void {
  const commands: number[] = source.commands.slice();
  const data: number[] = source.data.slice();
  const winding = source.winding;
  const outCommands: number[] = out.commands;
  outCommands.length = 0;
  for (let i = 0; i < commands.length; i += 1) {
    outCommands.push(commands[i]);
  }
  const outData: number[] = out.data;
  outData.length = 0;
  for (let i = 0; i < data.length; i += 1) {
    outData.push(data[i]);
  }
  out.winding = winding;
}
