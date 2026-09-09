import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { Path, PathBooleanContour } from '@flighthq/types/contract';

export function writePathBooleanContours(contours: readonly PathBooleanContour[], out?: Path): Path {
  const path = out ?? createPath('nonZero');
  path.commands.length = 0;
  path.data.length = 0;
  path.winding = 'nonZero';
  for (const ring of contours) {
    if (ring.length < 6) continue;
    appendPathMoveTo(path, ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) appendPathLineTo(path, ring[i], ring[i + 1]);
    appendPathClose(path);
  }
  return path;
}
