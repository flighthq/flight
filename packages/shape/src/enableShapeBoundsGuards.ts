import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { Shape, ShapeBoundsMode } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setShapeBoundsGuard } from './shapeBounds.ts';

export function areShapeBoundsGuardsEnabled(): boolean {
  return _enabled;
}

export function disableShapeBoundsGuards(): void {
  setShapeBoundsGuard(null);
  _enabled = false;
}

// Installs opt-in missing-command diagnostics. The traversal and its sentinel stay logger-free; an
// application that omits this module sheds both @flighthq/log and every byte of the warning text.
// Warnings go to the caller-owned `logState`, stamped with `nowMs`, the caller's clock reading at enable.
export function enableShapeBoundsGuards(logState: LogState, nowMs: number): void {
  setShapeBoundsGuard((source, mode, missingCommandKey) =>
    warnOnMissingShapeBoundsCommand(logState, nowMs, source, mode, missingCommandKey),
  );
  _enabled = true;
}

function warnOnMissingShapeBoundsCommand(
  logState: LogState,
  nowMs: number,
  _source: Readonly<Shape>,
  mode: ShapeBoundsMode,
  missingCommandKey: string,
): void {
  logOnce(
    logState,
    nowMs,
    `shape:bounds-command-missing:${mode}:${missingCommandKey}`,
    LogLevel.Warn,
    {
      message: `Shape bounds are incomplete because command '${missingCommandKey}' has no registered bounds contribution. Register its CanvasShapeCommand with explicit fillBounds and strokeBounds, or call explainShapeBounds(shape, mode) to inspect every missing key.`,
      missingCommandKey,
      mode,
    },
    'shape',
  );
}

let _enabled = false;
