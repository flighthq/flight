import { logOnce } from '@flighthq/log/contract';
import type { TrayIcon } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTrayAnimationGuard } from './tray';

/** Uninstalls the guard installed by `enableTrayGuards`. */
export function disableTrayGuards(): void {
  setTrayAnimationGuard(null);
}

/**
 * Installs the caller-facing tray guard (opt-in, dev-only). It warns once — through `@flighthq/log` —
 * when `startTrayIconAnimation` is given a non-positive interval.
 *
 * A `setInterval` of zero or less does not fail; it schedules as fast as the host will run it, writing
 * the tray icon every tick. The animation "works", the app burns a core and hammers the platform's tray
 * API, and nothing points at the call that asked for it. That is caller misuse rather than an expected
 * failure, so it warns rather than throwing or returning a sentinel — the animation still starts, and
 * the developer gets told why their machine is busy.
 *
 * Not importing this module costs production nothing: the message and the `@flighthq/log` dependency
 * live only here.
 */
export function enableTrayGuards(): void {
  setTrayAnimationGuard(warnOnUnboundedTrayAnimation);
}

function warnOnUnboundedTrayAnimation(_tray: TrayIcon, _frameCount: number, intervalMs: number): void {
  if (intervalMs > 0) return;
  logOnce(
    'tray:non-positive-animation-interval',
    LogLevel.Warn,
    {
      message:
        `startTrayIconAnimation: intervalMs is ${intervalMs}, so the icon will be rewritten as fast as the ` +
        'host schedules timers rather than on a frame interval. Pass a positive millisecond interval.',
    },
    'tray',
  );
}
