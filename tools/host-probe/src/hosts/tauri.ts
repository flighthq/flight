import { getAppName, getAppVersion } from '@flighthq/app/contract';
import { registerTauriBackends } from '@flighthq/host-tauri';
import { getPlatformName } from '@flighthq/platform/contract';
import type { DesktopOsProfile, TauriApi } from '@flighthq/types/contract';
import * as app from '@tauri-apps/api/app';
import * as menu from '@tauri-apps/api/menu';
import * as tray from '@tauri-apps/api/tray';
import * as window from '@tauri-apps/api/window';
import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
import * as dialog from '@tauri-apps/plugin-dialog';
import * as globalShortcut from '@tauri-apps/plugin-global-shortcut';
import * as notification from '@tauri-apps/plugin-notification';
import * as opener from '@tauri-apps/plugin-opener';
import * as os from '@tauri-apps/plugin-os';
import * as process from '@tauri-apps/plugin-process';
import '@wdio/tauri-plugin';

import { captureHostProbeBackends, diffHostProbeBackends } from '#host-probe/capabilityBackends';
import type { HostProbeBackendSnapshot } from '#host-probe/capabilityBackends';
import type { HostProbeInstallResult } from '#host-probe/contract';
import { createHostProbeNotificationProfileResult } from '#host-probe/expectations';

export async function installTauriHostProbe(before: HostProbeBackendSnapshot): Promise<HostProbeInstallResult> {
  const tauriApi: TauriApi = {
    app,
    clipboard,
    dialog,
    globalShortcut,
    // Tauri's Resource and DPI classes contain private/symbol members, so their structurally compatible
    // runtime modules need a boundary assertion before entering Flight's dependency-free facade.
    menu: menu as TauriApi['menu'],
    notification,
    opener,
    os,
    process,
    tray: tray as TauriApi['tray'],
    window: window as TauriApi['window'],
  };
  const host = registerTauriBackends(tauriApi, desktopOsProfile(os.platform()));
  const changedCapabilities = diffHostProbeBackends(before, captureHostProbeBackends(host));
  await waitFor(() => getAppName().length > 0);
  const name = getAppName();
  const version = getAppVersion();
  const platform = getPlatformName();
  return {
    changedCapabilities,
    results: [
      createHostProbeNotificationProfileResult('tauri', host.notification, ['delivery', 'lifecycle', 'permission']),
      {
        detail: name.length > 0 ? `${name} ${version}`.trim() : 'Tauri app identity did not resolve',
        id: 'runtime.app-identity',
        kind: 'runtime',
        status: name.length > 0 ? 'pass' : 'fail',
      },
      {
        detail: `Tauri platform is ${platform}`,
        id: 'runtime.platform',
        kind: 'runtime',
        status: platform === 'unknown' || platform === 'web' ? 'fail' : 'pass',
      },
    ],
  };
}

function desktopOsProfile(platform: string): DesktopOsProfile {
  if (platform === 'macos') return 'macos';
  if (platform === 'windows') return 'windows';
  return 'linux';
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 3_000;
  while (!predicate() && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
}
