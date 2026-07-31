import { logOnce } from '@flighthq/log/contract';
import type { StepPosition } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setEasingStepsGuard } from './easeSteps';

// Uninstalls the guard installed by enableEasingGuards.
export function disableEasingGuards(): void {
  setEasingStepsGuard(null);
}

// Installs the caller-facing easing guard (opt-in, dev-only). This package has one silent footgun:
// `easeSteps(count, 'jumpNone')` with `count < 2` leaves zero jumps, so the returned function divides by
// zero and hands back NaN for every input. Nothing throws and nothing logs — the NaN just propagates into
// whatever the easing drives, which is why a comment telling callers "pass count >= 2" was not enough.
//
// @flighthq/easing is a CORE package, and core may otherwise depend only on types/core. This module is the
// sanctioned exception: it is separately importable and shakeable, so a build that never imports it never
// pulls @flighthq/log, and the layer rule's actual concern — feature weight in core's always-loaded graph —
// does not arise. `packages:check` enforces that the import appears in guard modules only. Idempotent.
export function enableEasingGuards(): void {
  setEasingStepsGuard(warnOnDegenerateSteps);
}

function warnOnDegenerateSteps(count: number, position: StepPosition): void {
  logOnce(
    'easing:degenerate-steps',
    LogLevel.Warn,
    {
      message: `easeSteps(${count}, '${position}'): '${position}' has count - 1 jumps, so it needs count >= 2. With ${count} there are no jumps, the easing divides by zero, and every input returns NaN. Pass count >= 2, or use a position that jumps at an edge ('jumpEnd', 'jumpStart', 'jumpBoth') — those are defined for count >= 1.`,
    },
    'easing',
  );
}
