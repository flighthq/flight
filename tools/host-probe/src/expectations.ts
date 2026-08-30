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
  'notification',
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
    'notification',
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
    'notification',
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
    'notification',
    'platform',
    'shell',
    'shortcut',
    'tray',
    'window',
  ]),
  web: new Set([
    'accessibility',
    'connectivity',
    'cursor',
    'dialog',
    'glyph-rasterizer',
    'loop',
    'screen',
    'share',
    'window',
  ]),
};

export function createHostProbeProviderResults(
  host: HostProbeHost,
  changedCapabilities: ReadonlySet<string>,
): HostProbeResult[] {
  const required = requiredCapabilities[host];
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

export function getRequiredHostProbeCapabilities(host: HostProbeHost): ReadonlySet<HostProbeCapability> {
  return requiredCapabilities[host];
}
