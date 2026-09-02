import {
  createHostProbeNotificationProfileResult,
  createHostProbeProviderResults,
  getRequiredHostProbeCapabilities,
  HostProbeCapabilities,
} from './expectations';

describe('createHostProbeProviderResults', () => {
  it('passes required changes and marks unclaimed providers unsupported', () => {
    const results = createHostProbeProviderResults(
      'web',
      new Set([
        'accessibility',
        'connectivity',
        'cursor',
        'dialog',
        'glyph-rasterizer',
        'loop',
        'notification.click',
        'notification.close',
        'notification.delivery',
        'notification.dismiss',
        'notification.lifecycle',
        'notification.permission',
        'notification.received',
        'power',
        'screen',
        'share',
        'shell',
        'storage',
        'window',
      ]),
    );
    expect(results).toHaveLength(HostProbeCapabilities.length);
    expect(results.find((result) => result.id === 'provider.loop')?.status).toBe('pass');
    expect(results.find((result) => result.id === 'provider.tray')?.status).toBe('unsupported');
  });

  it('fails a required provider that did not change', () => {
    const results = createHostProbeProviderResults('electron', new Set());
    expect(results.find((result) => result.id === 'provider.window')?.status).toBe('fail');
  });

  it('fails an unexpected provider change', () => {
    const results = createHostProbeProviderResults('capacitor', new Set(['tray']));
    expect(results.find((result) => result.id === 'provider.tray')?.status).toBe('fail');
  });
});

describe('getRequiredHostProbeCapabilities', () => {
  it('keeps each host subset explicit', () => {
    const electron = getRequiredHostProbeCapabilities('electron');
    expect(electron.size).toBe(21);
    expect(electron.has('updater')).toBe(true);
    expect([...getRequiredHostProbeCapabilities('web')]).toEqual([
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
    ]);
    expect(getRequiredHostProbeCapabilities('tauri').has('updater')).toBe(false);
    expect(getRequiredHostProbeCapabilities('capacitor').has('updater')).toBe(false);
    expect(getRequiredHostProbeCapabilities('tauri').size).toBe(12);
    expect(getRequiredHostProbeCapabilities('capacitor').size).toBe(17);
  });
});

describe('createHostProbeNotificationProfileResult', () => {
  it('passes only an exact slot profile', () => {
    const notification = { delivery: {}, permission: {} };
    expect(createHostProbeNotificationProfileResult('tauri', notification, ['delivery', 'permission']).status).toBe(
      'pass',
    );
    expect(createHostProbeNotificationProfileResult('tauri', notification, ['delivery']).status).toBe('fail');
  });
});
