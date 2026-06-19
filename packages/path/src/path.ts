import type { Path, PathWinding } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

export function appendPathCubicCurveTo(
  path: Path,
  control1X: number,
  control1Y: number,
  control2X: number,
  control2Y: number,
  anchorX: number,
  anchorY: number,
): void {
  path.commands.push(PathCommand.CUBIC_CURVE_TO);
  path.data.push(control1X, control1Y, control2X, control2Y, anchorX, anchorY);
}

export function appendPathCurveTo(
  path: Path,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  path.commands.push(PathCommand.CURVE_TO);
  path.data.push(controlX, controlY, anchorX, anchorY);
}

export function appendPathLineTo(path: Path, x: number, y: number): void {
  path.commands.push(PathCommand.LINE_TO);
  path.data.push(x, y);
}

export function appendPathMoveTo(path: Path, x: number, y: number): void {
  path.commands.push(PathCommand.MOVE_TO);
  path.data.push(x, y);
}

// Allocates an empty path. Winding defaults to nonZero: same-wound subpaths union (the common clip
// case) and counter-wound subpaths cut holes. Pass 'evenOdd' for parity fills.
export function createPath(winding: PathWinding = 'nonZero'): Path {
  return { commands: [], data: [], winding };
}
