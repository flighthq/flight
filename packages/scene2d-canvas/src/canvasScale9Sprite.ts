import type { RectangleLike } from '@flighthq/types/contract';

// Nine-slice blit geometry for a textured node, written as flat numbers rather than returned as objects
// so a per-frame draw allocates nothing and the layout ports directly to a C array. Each slice occupies
// SLICE_STRIDE entries: sourceX, sourceY, sourceWidth, sourceHeight, destinationX, destinationY,
// destinationWidth, destinationHeight — the argument order drawImage takes them in.
export const CANVAS_SCALE9_SPRITE_SLICE_STRIDE = 8;

// Fills `out` with the nine blits that draw a texture at `targetWidth` x `targetHeight` under `grid`,
// and returns how many slices were written. `out.length` is set to exactly what was written, so a reused
// scratch array never leaks a previous frame's tail.
//
// The grid divides the SOURCE texture into three columns and three rows; the destination divides the
// node's scaled box the same way, corners kept at source size and only edges and centre stretched. This
// is the sprite counterpart of canvasScale9Mapper's command remapping: a shape is remapped coordinate by
// coordinate because its geometry is authored, while a texture has no coordinates to remap and is
// instead blitted in pieces.
//
// A slice whose source extent is zero is omitted rather than drawn empty — drawImage with a zero-width
// source rectangle is a no-op on some canvas implementations and throws on others, and omitting it is
// the same picture. So the count is nine only for a grid with three non-empty bands on both axes.
//
// Returns 0 when the grid cannot be applied, which the caller must treat as "draw it unsliced" rather
// than "draw nothing" — the same contract buildScale9Mapper has when it returns null.
export function writeCanvasScale9SpriteSlices(
  out: number[],
  sourceWidth: number,
  sourceHeight: number,
  grid: Readonly<RectangleLike>,
  targetWidth: number,
  targetHeight: number,
): number {
  out.length = 0;
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return 0;

  const columnCount = writeAxisBands(_columns, sourceWidth, grid.x, grid.width, targetWidth);
  const rowCount = writeAxisBands(_rows, sourceHeight, grid.y, grid.height, targetHeight);
  if (columnCount === 0 || rowCount === 0) return 0;

  for (let row = 0; row < rowCount; row++) {
    const r = row * BAND_STRIDE;
    for (let column = 0; column < columnCount; column++) {
      const c = column * BAND_STRIDE;
      out.push(
        _columns[c],
        _rows[r],
        _columns[c + 1],
        _rows[r + 1],
        _columns[c + 2],
        _rows[r + 2],
        _columns[c + 3],
        _rows[r + 3],
      );
    }
  }
  return columnCount * rowCount;
}

// One axis band: sourceStart, sourceSize, destinationStart, destinationSize.
const BAND_STRIDE = 4;

const _columns: number[] = [];
const _rows: number[] = [];

// The centre absorbs the whole size difference. When the target is smaller than the two fixed ends the
// centre would go negative, so the ends are scaled down proportionally and the centre collapses to zero.
// That degradation matches toScale9Position's `center < 0` branch in canvasScale9Mapper, so a sprite and
// a shape shrink the same way rather than one clamping while the other inverts.
function writeAxisBands(
  out: number[],
  sourceSize: number,
  gridStart: number,
  gridSize: number,
  targetSize: number,
): number {
  out.length = 0;
  if (gridSize < 0 || gridStart < 0 || gridStart + gridSize > sourceSize) return 0;

  const startSize = gridStart;
  const endSize = sourceSize - gridStart - gridSize;
  const fixed = startSize + endSize;
  const centre = targetSize - fixed;

  let destinationStartSize = startSize;
  let destinationEndSize = endSize;
  let destinationCentreSize = centre;
  if (centre < 0) {
    const shrink = fixed > 0 ? targetSize / fixed : 0;
    destinationStartSize = startSize * shrink;
    destinationEndSize = endSize * shrink;
    destinationCentreSize = 0;
  }

  let destinationStart = 0;
  let count = 0;
  const push = (sourceStart: number, size: number, destinationSize: number): void => {
    if (size > 0) {
      out.push(sourceStart, size, destinationStart, destinationSize);
      count++;
    }
    destinationStart += destinationSize;
  };
  push(0, startSize, destinationStartSize);
  push(gridStart, gridSize, destinationCentreSize);
  push(gridStart + gridSize, endSize, destinationEndSize);
  return count;
}
