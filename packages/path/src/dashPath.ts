// Generated from crates/flight-path/src/dash_path.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { flattenPath } from './flattenPath.ts';
import type { PathRaw } from './path.ts';
import { PathCommand } from './path.ts';

function applyDashToContour(
  pts: Readonly<number[]>,
  dash: ArrayLike<number>,
  dashOffset: number,
  totalDashLength: number,
  out: PathRaw,
): void {
  const n = Math.trunc(pts.length / 2);
  if (n < 2) {
    return;
  }
  const offset = ((dashOffset % totalDashLength) + totalDashLength) % totalDashLength;
  let dashIndex: number = 0;
  let remaining: number = 0.0;
  let isOn = true;
  let skipped: number = 0.0;
  for (let i = 0; i < dash.length; i += 1) {
    if (skipped + dash[i] > offset) {
      dashIndex = i;
      remaining = dash[i] - (offset - skipped);
      isOn = i % 2 === 0;
      break;
    }
    skipped += dash[i];
  }
  let segStarted = false;
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2];
    const y1 = pts[(i + 1) * 2 + 1];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (isOn && !segStarted) {
      out.commands.push(PathCommand.MOVE_TO);
      out.data.push(x0);
      out.data.push(y0);
      segStarted = true;
    }
    let consumed: number = 0.0;
    while (consumed < segLen) {
      const step = Math.min(remaining, segLen - consumed);
      const t = segLen > 0.0 ? (consumed + step) / segLen : 0.0;
      const ix = x0 + t * dx;
      const iy = y0 + t * dy;
      if (isOn) {
        if (!segStarted) {
          const tStart = segLen > 0.0 ? consumed / segLen : 0.0;
          out.commands.push(PathCommand.MOVE_TO);
          out.data.push(x0 + tStart * dx);
          out.data.push(y0 + tStart * dy);
          segStarted = true;
        }
        out.commands.push(PathCommand.LINE_TO);
        out.data.push(ix);
        out.data.push(iy);
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
          out.data.push(ix);
          out.data.push(iy);
          segStarted = true;
        }
      }
    }
  }
}

function copyCommands(source: Readonly<PathRaw>, out: PathRaw): void {
  const commands = source.commands.slice();
  const data = source.data.slice();
  const winding = source.winding;
  out.commands = commands;
  out.data = data;
  out.winding = winding;
}

/**
 * Splits `source` into dashed sub-paths according to the given dash pattern and offset.
 * An empty or all-zero dash array copies the source unchanged (solid stroke). Alias-safe.
 */
export function dashPath(
  source: Readonly<PathRaw>,
  dash: ArrayLike<number>,
  dashOffset: number,
  out: PathRaw,
  tolerance?: number,
): void {
  tolerance = tolerance ?? 0.25;
  const totalDashLength = dashTotal(dash);
  if (totalDashLength <= 0.0) {
    copyCommands(source, out);
    return;
  }
  const contours = flattenPath(source, tolerance);
  out.commands.length = 0;
  out.data.length = 0;
  out.winding = source.winding;
  for (const contour of contours) {
    applyDashToContour(contour, dash, dashOffset, totalDashLength, out);
  }
}

function dashTotal(dash: ArrayLike<number>): number {
  let total: number = 0.0;
  for (let i = 0; i < dash.length; i += 1) {
    total += dash[i];
  }
  return total;
}
