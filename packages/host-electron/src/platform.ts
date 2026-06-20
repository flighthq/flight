import type { PlatformBackend, PlatformInfo, PlatformName } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's PlatformBackend onto the Node `process` running the Electron main process, with the
// locale sourced from Electron's `app`. `process` is accessed defensively (it may be absent and is not
// typed without @types/node) and falls back to '' / 'unknown' sentinels. Writes into caller-owned
// `out` so callers control allocation.
export function createElectronPlatformBackend(electron: ElectronApi): PlatformBackend {
  return {
    getInfo(out) {
      const proc =
        typeof process !== 'undefined'
          ? (process as { platform?: string; arch?: string; getSystemVersion?: () => string })
          : null;
      out.name = toPlatformName(proc?.platform);
      out.kind = 'desktop';
      out.version = proc?.getSystemVersion?.() ?? '';
      out.arch = proc?.arch ?? '';
      out.locale = electron.app.getLocale();
      out.isTouch = false;
      return out;
    },
  };
}

function toPlatformName(platform: string | undefined): PlatformName {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}
