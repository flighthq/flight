import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { makeElectronShellCapabilities } from './electronShell';

function fakeElectron(shell: Partial<ElectronApi['shell']>): ElectronApi {
  return { shell } as unknown as ElectronApi;
}

describe('makeElectronShellCapabilities', () => {
  it('constructs every Windows provider as an Entity', () => {
    const capabilities = makeElectronShellCapabilities(fakeElectron({}), 'windows');
    expect(Object.keys(capabilities).sort()).toEqual([
      'beep',
      'external',
      'pathOpen',
      'pathReveal',
      'shortcutLink',
      'trash',
    ]);
    for (const provider of Object.values(capabilities)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('omits shortcutLink on an injected non-Windows platform', () => {
    expect(Object.keys(makeElectronShellCapabilities(fakeElectron({}), 'linux')).sort()).toEqual([
      'beep',
      'external',
      'pathOpen',
      'pathReveal',
      'trash',
    ]);
  });

  it('maps awaited external completion and rejection', async () => {
    const ok = makeElectronShellCapabilities(fakeElectron({ openExternal: async () => {} }), 'linux');
    await expect(ok.external?.open('https://example.test')).resolves.toEqual({ reason: 'ok' });
    const failed = makeElectronShellCapabilities(
      fakeElectron({
        openExternal: async () => {
          throw new Error('denied');
        },
      }),
      'linux',
    );
    await expect(failed.external?.open('https://example.test')).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('preserves an Electron path error string', async () => {
    const success = makeElectronShellCapabilities(fakeElectron({ openPath: async () => '' }), 'linux');
    await expect(success.pathOpen?.open('/a')).resolves.toEqual({ reason: 'ok' });
    const failed = makeElectronShellCapabilities(fakeElectron({ openPath: async () => 'no such file' }), 'linux');
    await expect(failed.pathOpen?.open('/a')).resolves.toEqual({
      message: 'no such file',
      reason: 'operation-failed',
    });
  });

  it('does not turn an empty rejected path open into success', async () => {
    const capabilities = makeElectronShellCapabilities(
      fakeElectron({
        openPath: async () => {
          throw new Error('');
        },
      }),
      'linux',
    );
    await expect(capabilities.pathOpen?.open('/a')).resolves.toEqual({ message: '', reason: 'operation-failed' });
  });

  it('maps path reveal and trash outcomes', async () => {
    let revealed = '';
    const capabilities = makeElectronShellCapabilities(
      fakeElectron({
        showItemInFolder(path) {
          revealed = path;
        },
        trashItem: async () => {},
      }),
      'linux',
    );
    await expect(capabilities.pathReveal?.reveal('/a/b')).resolves.toEqual({ reason: 'ok' });
    await expect(capabilities.trash?.moveToTrash('/a/b')).resolves.toEqual({ reason: 'ok' });
    expect(revealed).toBe('/a/b');
  });

  it('keeps shortcut read and write outcomes method-tight', async () => {
    const capabilities = makeElectronShellCapabilities(
      fakeElectron({
        readShortcutLink: () => ({ target: '/target' }),
        writeShortcutLink: () => false,
      }),
      'windows',
    );
    await expect(capabilities.shortcutLink?.read('/app.lnk')).resolves.toEqual({
      link: { target: '/target' },
      reason: 'ok',
    });
    await expect(capabilities.shortcutLink?.write('/app.lnk', { target: '/target' }, 'replace')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });

  it('dispatches beep synchronously', () => {
    const beep = vi.fn();
    makeElectronShellCapabilities(fakeElectron({ beep }), 'linux').beep?.beep();
    expect(beep).toHaveBeenCalledOnce();
  });
});
