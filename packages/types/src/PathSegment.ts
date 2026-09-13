/**
 * A single decoded segment from a `Path` command stream, yielded by `forEachPathSegment`.
 * Each variant carries only the coordinates relevant to its verb; the start point of each
 * segment is the endpoint of the previous segment (or the MOVE_TO origin).
 *
 * - `moveTo`: starts a new contour at (x, y).
 * - `lineTo`: straight segment to (x, y).
 * - `quadraticCurveTo`: quadratic bezier to (x, y) with control point (controlX, controlY).
 * - `cubicCurveTo`: cubic bezier to (x, y) with control points (controlX1, controlY1) and (controlX2, controlY2).
 * - `close`: closes the current contour back to the most recent moveTo origin.
 */
export type PathSegment =
  | {
      readonly kind: 'moveTo';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'lineTo';
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'quadraticCurveTo';
      readonly controlX: number;
      readonly controlY: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'cubicCurveTo';
      readonly controlX1: number;
      readonly controlY1: number;
      readonly controlX2: number;
      readonly controlY2: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'close';
    };
