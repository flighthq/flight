import type {
  ElectronApi,
  HostPlatformCapabilities,
  HostPlatformCapability,
  PlatformName,
} from '@flighthq/types/contract';

export function electronHostPlatform(electron: ElectronApi): HostPlatformCapability {
  const out = {} as HostPlatformCapability;
  populateElectronHostPlatform(out, electron);
  return out;
}

export function electronHostPlatformGroup(electron: ElectronApi): Required<Pick<HostPlatformCapabilities, 'info'>> {
  return { info: electronHostPlatform(electron) };
}

// Maps Flight's HostPlatformCapability onto the Node `process` running the Electron main process, with the
// locale sourced from Electron's `app`. `process` is accessed defensively (it may be absent and is not
// typed without @types/node) and falls back to '' / 'unknown' sentinels. Writes into caller-owned
// `out` so callers control allocation.
export function populateElectronHostPlatform(out: HostPlatformCapability, electron: ElectronApi): void {
  out.getInfo = (out) => {
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
  };
}

function toPlatformName(platform: string | undefined): PlatformName {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unknown';
}
