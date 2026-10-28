import { appendPathClose, appendPathLineTo, appendPathMoveTo } from '@flighthq/path/contract';
import type { Path, PathBooleanContour } from '@flighthq/types/contract';

export function writePathBooleanContours(out: Path, contours: readonly PathBooleanContour[]): void {
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = 'nonZero';
  for (const ring of contours) {
    if (ring.length < 6) continue;
    appendPathMoveTo(out, ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) appendPathLineTo(out, ring[i], ring[i + 1]);
    appendPathClose(out);
  }
}
