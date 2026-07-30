import { logOnce } from '@flighthq/log/contract';
import type { ShortcutDrop } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setShortcutDropGuard } from './shortcut';

// Uninstalls the guard installed by enableShortcutGuards.
export function disableShortcutGuards(): void {
  setShortcutDropGuard(null);
}

// Installs the caller-facing shortcut guard (opt-in, dev-only). Every global-shortcut command answers
// a bad call with the same `false` a legitimate miss returns, so the two footguns this package has are
// both silent: an accelerator string the parser rejects, and a whole application wired up against the
// default web backend, which has no OS registry to act on. The guard warns once per cause through
// @flighthq/log. Not importing this module costs production nothing — the message text and the
// @flighthq/log dependency live only here, and the command path sees a null slot. Idempotent.
export function enableShortcutGuards(): void {
  setShortcutDropGuard(warnOnShortcutDrop);
}

function warnOnShortcutDrop(drop: Readonly<ShortcutDrop>): void {
  if (drop.reason === 'no-native-backend') {
    logOnce(
      'shortcut:no-native-backend',
      LogLevel.Warn,
      {
        message: `${drop.operation}: no native shortcut backend is installed, so the default web backend handled this call — a browser cannot register OS-level global hotkeys. Call setShortcutBackend(...) from a native host (Electron/Tauri), and gate the feature on hasNativeShortcutBackend().`,
      },
      'shortcut',
    );
    return;
  }

  const parseError = drop.parseError;
  const detail =
    parseError === null
      ? 'it did not parse'
      : `${parseError.reason}${parseError.token === '' ? '' : ` at '${parseError.token}'`}`;
  logOnce(
    'shortcut:unparseable-accelerator',
    LogLevel.Warn,
    {
      message: `${drop.operation}('${drop.accelerator}'): the accelerator was dropped because ${detail}. Check the spelling against parseAcceleratorDetailed, or explainGlobalShortcutRegistration for the whole picture.`,
    },
    'shortcut',
  );
}
