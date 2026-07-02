import type { Path } from '@flighthq/types';
import { PathCommand } from '@flighthq/types';

import { flattenPath } from './flattenPath';

// Splits `source` into dashed sub-paths according to the given dash pattern and offset. Each
// dash-on segment becomes an open sub-path (MOVE_TO + LINE_TOs) in `out`. The dash pattern is
// a repeating [on, off, on, off, ...] length sequence; `dashOffset` shifts the pattern start.
//
// An empty or all-zero dash array copies the source unchanged (solid stroke). Alias-safe.
export function dashPath(
  source: Readonly<Path>,
  dash: Readonly<number[]>,
  dashOffset: number,
  out: Path,
  tolerance = 0.25,
): void {
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;

  const totalDashLength = dashTotal(dash);
  if (totalDashLength <= 0) {
    copyCommands(source, out);
    return;
  }

  const contours = flattenPath(source, tolerance);
  for (const contour of contours) {
    applyDashToContour(contour, dash, dashOffset, totalDashLength, out);
  }
}

function applyDashToContour(
  pts: Readonly<number[]>,
  dash: Readonly<number[]>,
  dashOffset: number,
  totalDashLength: number,
  out: Path,
): void {
  const n = pts.length >> 1;
  if (n < 2) return;

  const offset = ((dashOffset % totalDashLength) + totalDashLength) % totalDashLength;
  let dashIndex = 0;
  let remaining = 0;
  let isOn = true;
  {
    let acc = 0;
    for (let i = 0; i < dash.length; i++) {
      if (acc + dash[i] > offset) {
        dashIndex = i;
        remaining = dash[i] - (offset - acc);
        isOn = i % 2 === 0;
        break;
      }
      acc += dash[i];
    }
  }

  let segStarted = false;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2];
    const y1 = pts[(i + 1) * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (isOn && !segStarted) {
      out.commands.push(PathCommand.MOVE_TO);
      out.data.push(x0, y0);
      segStarted = true;
    }

    let consumed = 0;
    while (consumed < segLen) {
      const step = Math.min(remaining, segLen - consumed);
      const t = segLen > 0 ? (consumed + step) / segLen : 0;
      const ix = x0 + t * dx;
      const iy = y0 + t * dy;

      if (isOn) {
        if (!segStarted) {
          const tStart = segLen > 0 ? consumed / segLen : 0;
          out.commands.push(PathCommand.MOVE_TO);
          out.data.push(x0 + tStart * dx, y0 + tStart * dy);
          segStarted = true;
        }
        out.commands.push(PathCommand.LINE_TO);
        out.data.push(ix, iy);
      }

      consumed += step;
      remaining -= step;
      if (remaining <= 1e-10) {
        dashIndex = (dashIndex + 1) % dash.length;
        remaining = dash[dashIndex];
        const wasOn = isOn;
        isOn = dashIndex % 2 === 0;
        if (wasOn && !isOn) {
          segStarted = false;
        }
        if (!wasOn && isOn) {
          out.commands.push(PathCommand.MOVE_TO);
          out.data.push(ix, iy);
          segStarted = true;
        }
      }
    }
  }
}

function copyCommands(source: Readonly<Path>, out: Path): void {
  for (let i = 0; i < source.commands.length; i++) {
    out.commands.push(source.commands[i]);
  }
  for (let i = 0; i < source.data.length; i++) {
    out.data.push(source.data[i]);
  }
}

function dashTotal(dash: Readonly<number[]>): number {
  let total = 0;
  for (let i = 0; i < dash.length; i++) total += dash[i];
  return total;
}
