import type { PathWinding } from './ShapeCommand';

/**
 * Verb codes for a `Path` command stream (Flash `PathCommand` values). Each verb
 * consumes a fixed number of values from the path's `data` stream:
 * MOVE_TO/LINE_TO = 2, CURVE_TO (quadratic) = 4, CUBIC_CURVE_TO = 6, WIDE_MOVE_TO/WIDE_LINE_TO = 4
 * (a dummy pair followed by the real point — present so every command can be read at a 4-wide stride).
 */
export const PathCommand = {
  NO_OP: 0,
  MOVE_TO: 1,
  LINE_TO: 2,
  CURVE_TO: 3,
  WIDE_MOVE_TO: 4,
  WIDE_LINE_TO: 5,
  CUBIC_CURVE_TO: 6,
} as const;

export type PathCommand = (typeof PathCommand)[keyof typeof PathCommand];

/**
 * An authored vector outline as plain data: a verb stream, a flat coordinate stream, and a fill rule.
 * This is the one outline representation shared across the SDK — shapes emit it (`drawPath`), clip
 * regions consume it, and `@flighthq/path` flattens/tessellates it. Not entity-backed (no runtime
 * identity); construct with `createPath` and the `appendPath*` helpers.
 */
export interface Path {
  commands: number[];
  data: number[];
  winding: PathWinding;
}
