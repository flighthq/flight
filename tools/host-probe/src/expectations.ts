import type { HostNotificationCapabilities } from '@flighthq/types/contract';

import type { HostProbeHost, HostProbeResult } from './contract';

export const HostProbeCapabilities = [
  'accessibility',
  'app',
  'clipboard',
  'connectivity',
  'cursor',
  'device',
  'dialog',
  'filesystem',
  'geolocation',
  'glyph-rasterizer',
  'haptics',
  'ipc',
  'loop',
  'menu',
  'notification.action',
  'notification.activeList',
  'notification.click',
  'notification.close',
  'notification.delivery',
  'notification.dismiss',
  'notification.lifecycle',
  'notification.permission',
  'notification.received',
  'notification.reply',
  'notification.scheduling',
  'platform',
  'power',
  'protocol',
  'screen',
  'share',
  'shell',
  'shortcut',
  'soft-keyboard',
  'statusbar',
  'storage',
  'tray',
  'updater',
  'window',
] as const;

export type HostProbeCapability = (typeof HostProbeCapabilities)[number];

const requiredCapabilities: Readonly<Record<HostProbeHost, ReadonlySet<HostProbeCapability>>> = {
  capacitor: new Set([
    'app',
    'clipboard',
    'connectivity',
    'device',
    'dialog',
    'filesystem',
    'geolocation',
    'haptics',
    'notification.action',
    'notification.click',
    'notification.delivery',
    'notification.lifecycle',
    'notification.permission',
    'notification.scheduling',
    'protocol',
    'share',
    'soft-keyboard',
    'statusbar',
  ]),
  electron: new Set([
    'app',
    'clipboard',
    'dialog',
    'ipc',
    'menu',
    'notification.click',
    'notification.close',
    'notification.delivery',
    'notification.dismiss',
    'notification.lifecycle',
    'notification.received',
    'platform',
    'power',
    'protocol',
    'screen',
    'shell',
    'shortcut',
    'storage',
    'tray',
    'updater',
    'window',
  ]),
  tauri: new Set([
    'app',
    'clipboard',
    'dialog',
    'menu',
    'notification.delivery',
    'notification.lifecycle',
    'notification.permission',
    'platform',
    'shell',
    'shortcut',
    'tray',
    'window',
  ]),
  web: new Set([
    'accessibility',
    'app',
    'clipboard',
    'connectivity',
    'cursor',
    'device',
    'dialog',
    'filesystem',
    'glyph-rasterizer',
    'haptics',
    'loop',
    'menu',
    'notification.click',
    'notification.close',
    'notification.delivery',
    'notification.dismiss',
    'notification.lifecycle',
    'notification.permission',
    'notification.received',
    'platform',
    'power',
    'protocol',
    'screen',
    'share',
    'shell',
    'soft-keyboard',
    'statusbar',
    'storage',
    'window',
  ]),
};

const optionalCapabilities: Readonly<Partial<Record<HostProbeHost, ReadonlySet<HostProbeCapability>>>> = {
  electron: new Set(['notification.action', 'notification.reply']),
};

export function createHostProbeProviderResults(
  host: HostProbeHost,
  changedCapabilities: ReadonlySet<string>,
): HostProbeResult[] {
  const required = requiredCapabilities[host];
  const optional = optionalCapabilities[host] ?? new Set<HostProbeCapability>();
  return HostProbeCapabilities.map((capability): HostProbeResult => {
    const changed = changedCapabilities.has(capability);
    const expected = required.has(capability);
    if (expected && changed) {
      return {
        detail: `${host} installed a distinct ${capability} provider`,
        id: `provider.${capability}`,
        kind: 'provider',
        status: 'pass',
      };
    }
    if (expected) {
      return {
        detail: `${host} did not replace the ${capability} provider`,
        id: `provider.${capability}`,
        kind: 'provider',
        status: 'fail',
      };
    }
    if (optional.has(capability) && changed) {
      return {
        detail: `${host} installed an optional ${capability} provider`,
        id: `provider.${capability}`,
        kind: 'provider',
        status: 'pass',
      };
    }
    if (changed) {
      return {
        detail: `${host} unexpectedly replaced the unsupported ${capability} provider`,
        id: `provider.${capability}`,
        kind: 'provider',
        status: 'fail',
      };
    }
    return {
      detail: `${host} does not claim a ${capability} provider`,
      id: `provider.${capability}`,
      kind: 'provider',
      status: 'unsupported',
    };
  });
}

export function createHostProbeNotificationProfileResult(
  host: HostProbeHost,
  notification: Readonly<Partial<Record<keyof HostNotificationCapabilities, unknown>>>,
  expected: readonly (keyof HostNotificationCapabilities)[],
): HostProbeResult {
  const actual = Object.keys(notification).sort();
  const sortedExpected = [...expected].sort();
  const exact =
    actual.length === sortedExpected.length && actual.every((value, index) => value === sortedExpected[index]);
  return {
    detail: exact
      ? `${host} notification profile is exactly ${actual.join(', ')}`
      : `${host} notification profile is ${actual.join(', ')}; expected ${sortedExpected.join(', ')}`,
    id: 'runtime.notification-profile',
    kind: 'runtime',
    status: exact ? 'pass' : 'fail',
  };
}

export function getRequiredHostProbeCapabilities(host: HostProbeHost): ReadonlySet<HostProbeCapability> {
  return requiredCapabilities[host];
}
