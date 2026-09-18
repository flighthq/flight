import type {
  HostPlatformCapabilities,
  HostPlatformCapability,
  PlatformName,
  TauriApi,
} from '@flighthq/types/contract';

export function tauriHostPlatform(tauri: TauriApi): HostPlatformCapability {
  const out = {} as HostPlatformCapability;
  const os = tauri.os;
  let cachedLocale = '';
  os.locale()
    .then((locale) => {
      cachedLocale = locale ?? '';
    })
    .catch(() => {
      /* leave '' */
    });
  out.getInfo = (out) => {
    out.name = toPlatformName(os.platform());
    out.kind = 'desktop';
    out.version = os.version();
    out.arch = os.arch();
    out.locale = cachedLocale;
    out.isTouch = false;
    out.runtime = 'tauri';
    return out;
  };
  return out;
}

export function tauriHostPlatformGroup(tauri: TauriApi): Required<Pick<HostPlatformCapabilities, 'info'>> {
  return { info: tauriHostPlatform(tauri) };
}

function toPlatformName(platform: string): PlatformName {
  if (platform === 'windows') return 'windows';
  if (platform === 'macos') return 'macos';
  if (platform === 'linux') return 'linux';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'unknown';
}
