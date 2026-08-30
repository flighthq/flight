import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Dialog } from '@capacitor/dialog';
import { Filesystem } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { StatusBar } from '@capacitor/status-bar';
import { getAppName, getAppVersion } from '@flighthq/app/contract';
import { registerCapacitorBackends } from '@flighthq/host-capacitor';
import type { CapacitorApi, MobileOsProfile } from '@flighthq/types/contract';

import { captureHostProbeBackends, diffHostProbeBackends } from '#host-probe/capabilityBackends';
import type { HostProbeBackendSnapshot } from '#host-probe/capabilityBackends';
import type { HostProbeInstallResult } from '#host-probe/contract';
import { createHostProbeNotificationProfileResult } from '#host-probe/expectations';

export async function installCapacitorHostProbe(before: HostProbeBackendSnapshot): Promise<HostProbeInstallResult> {
  const capacitorApi: CapacitorApi = {
    app: App,
    clipboard: Clipboard,
    device: Device,
    dialog: Dialog,
    // Filesystem has the same enum boundary for its UTF-8 encoding option.
    filesystem: Filesystem as CapacitorApi['filesystem'],
    geolocation: Geolocation,
    // Capacitor exposes string-valued TypeScript enums, while Flight keeps the injected facade
    // dependency-free and represents those wire values as strings.
    haptics: Haptics as CapacitorApi['haptics'],
    keyboard: Keyboard,
    localNotifications: LocalNotifications,
    network: Network,
    share: Share,
    statusBar: StatusBar,
  };
  const host = registerCapacitorBackends(capacitorApi, mobileOsProfile(Capacitor.getPlatform()));
  const changedCapabilities = diffHostProbeBackends(before, captureHostProbeBackends(host));
  await waitFor(() => getAppName(host).length > 0);
  const name = getAppName(host);
  const version = getAppVersion(host);
  return {
    changedCapabilities,
    results: [
      createHostProbeNotificationProfileResult('capacitor', host.notification, [
        'action',
        'click',
        'delivery',
        'lifecycle',
        'permission',
        'scheduling',
      ]),
      {
        detail: name.length > 0 ? `${name} ${version}`.trim() : 'Capacitor app identity did not resolve',
        id: 'runtime.app-identity',
        kind: 'runtime',
        status: name.length > 0 ? 'pass' : 'fail',
      },
      {
        detail: 'Permission prompts and device-only effects require the interactive lane',
        id: 'runtime.permissions',
        kind: 'runtime',
        status: 'manual',
      },
    ],
  };
}

function mobileOsProfile(platform: string): MobileOsProfile {
  if (platform === 'android' || platform === 'ios') return platform;
  throw new Error(`Capacitor host probe requires android or ios, received ${platform}`);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 3_000;
  while (!predicate() && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
}
