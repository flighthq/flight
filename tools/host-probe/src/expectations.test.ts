import {
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
    expect(electron.size).toBe(16);
    expect(electron.has('updater')).toBe(true);
    expect(getRequiredHostProbeCapabilities('web').has('updater')).toBe(false);
    expect(getRequiredHostProbeCapabilities('tauri').has('updater')).toBe(false);
    expect(getRequiredHostProbeCapabilities('capacitor').has('updater')).toBe(false);
    expect(getRequiredHostProbeCapabilities('tauri').size).toBe(10);
    expect(getRequiredHostProbeCapabilities('capacitor').size).toBe(12);
    expect(getRequiredHostProbeCapabilities('web').size).toBe(12);
  });
});
