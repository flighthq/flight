import type { Path } from '@flighthq/types';

// Allocates a new `Path` that is a deep copy of `source`.
// Use `copyPath(source, out)` to write into an existing path without allocating.
export function clonePath(source: Readonly<Path>): Path {
  return copyPath(source);
}

// Copies all commands, data, and the winding rule from `source` into `out`. If `out` is omitted,
// allocates and returns a new `Path`. Alias-safe: if `out` is the same object as `source`, the call
// is a no-op (the path is already in place). Use `clonePath` when you always want a new allocation.
export function copyPath(source: Readonly<Path>, out?: Path): Path {
  if (out === undefined) {
    return {
      commands: source.commands.slice(),
      data: source.data.slice(),
      winding: source.winding,
    };
  }
  if (out !== source) {
    out.commands.length = 0;
    for (let i = 0; i < source.commands.length; i++) out.commands.push(source.commands[i]);
    out.data.length = 0;
    for (let i = 0; i < source.data.length; i++) out.data.push(source.data[i]);
    out.winding = source.winding;
  }
  return out;
}
