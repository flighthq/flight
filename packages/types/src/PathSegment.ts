/**
 * A single decoded segment from a `Path` command stream, yielded by `forEachPathSegment`.
 * Each variant carries only the coordinates relevant to its verb; the start point of each
 * segment is the anchor endpoint of the previous segment (or the MOVE_TO origin).
 *
 * - `moveTo`: starts a new contour at (x, y).
 * - `lineTo`: straight segment to (x, y).
 * - `curveTo`: quadratic bezier to anchor (x, y) with control point (controlX, controlY).
 * - `cubicCurveTo`: cubic bezier to anchor (x, y) with control points (control1X, control1Y) and (control2X, control2Y).
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
      readonly kind: 'curveTo';
      readonly controlX: number;
      readonly controlY: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'cubicCurveTo';
      readonly control1X: number;
      readonly control1Y: number;
      readonly control2X: number;
      readonly control2Y: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'close';
    };
