import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, Path, PathWinding } from '@flighthq/types/contract';

// Allocates a new `Path` that is a deep copy of `source`.
// Use `copyPath(out, source)` to write into an existing path without allocating.
export function clonePath(source: Readonly<Path>): Path {
  const out = allocateEntity<Path>();
  assignPathFields(out, source.commands.slice(), source.data.slice(), source.winding);
  return finishEntity(out);
}

// Copies all commands, data, and the winding rule from `source` into `out`. Alias-safe: if `out` is
// the same object as `source`, the call is a no-op (the path is already in place). Use `clonePath`
// when you want a new allocation.
export function copyPath(out: Path, source: Readonly<Path>): void {
  if (out !== source) {
    out.commands.length = 0;
    for (let i = 0; i < source.commands.length; i++) out.commands.push(source.commands[i]);
    out.data.length = 0;
    for (let i = 0; i < source.data.length; i++) out.data.push(source.data[i]);
    out.winding = source.winding;
  }
}

function assignPathFields(
  out: EntityConstruction<Path>,
  commands: number[],
  data: number[],
  winding: PathWinding,
): void {
  out.commands = commands;
  out.data = data;
  out.winding = winding;
}
