// Generated from crates/flight-path/src/copy_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import type { PathRaw } from './path.ts';

/**
 * Allocates a new `Path` that is a deep copy of `source`.
 */
export function clonePath(source: Readonly<PathRaw>): PathRaw {
  let out: PathRaw = Object.assign(allocateEntity<PathRaw>(), { commands: [], data: [] });
  copyPath(out, source);
  return out;
}

/**
 * Copies commands, data, and winding into the caller's path, retaining its field storage.
 */
export function copyPath(out: PathRaw, source: Readonly<PathRaw>): void {
  const commands: number[] = source.commands.slice();
  const data: number[] = source.data.slice();
  const winding = source.winding;
  out.commands.length = 0;
  for (let i = 0; i < commands.length; i += 1) {
    out.commands.push(commands[i]);
  }
  out.data.length = 0;
  for (let i = 0; i < data.length; i += 1) {
    out.data.push(data[i]);
  }
  out.winding = winding;
}
