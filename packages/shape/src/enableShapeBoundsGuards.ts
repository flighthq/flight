import { logOnce } from '@flighthq/log/contract';
import type { Shape, ShapeBoundsMode } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setShapeBoundsGuard } from './shapeBounds';

export function areShapeBoundsGuardsEnabled(): boolean {
  return _enabled;
}

export function disableShapeBoundsGuards(): void {
  setShapeBoundsGuard(null);
  _enabled = false;
}

// Installs opt-in missing-command diagnostics. The traversal and its sentinel stay logger-free; an
// application that omits this module sheds both @flighthq/log and every byte of the warning text.
export function enableShapeBoundsGuards(): void {
  setShapeBoundsGuard(warnOnMissingShapeBoundsCommand);
  _enabled = true;
}

function warnOnMissingShapeBoundsCommand(
  _source: Readonly<Shape>,
  mode: ShapeBoundsMode,
  missingCommandKey: string,
): void {
  logOnce(
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
