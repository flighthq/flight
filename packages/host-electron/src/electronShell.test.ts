import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  electronHostShell,
  electronHostShellBeep,
  electronHostShellExternal,
  electronHostShellPathOpen,
  electronHostShellPathReveal,
  electronHostShellShortcutLink,
  electronHostShellTrash,
  populateElectronHostShellBeep,
  populateElectronHostShellExternal,
  populateElectronHostShellPathOpen,
  populateElectronHostShellPathReveal,
  populateElectronHostShellShortcutLink,
  populateElectronHostShellTrash,
} from './electronShell';

function fakeElectron(shell: Partial<ElectronApi['shell']>): ElectronApi {
  return { shell } as unknown as ElectronApi;
}

function shellLeaf(factory: () => object): () => void {
  return () => {
    it('constructs an Entity-backed shell provider', () => {
      expect(EntityRuntimeKey in factory()).toBe(true);
    });
  };
}

describe('electronHostShell', () => {
  it('constructs every Windows provider as an Entity', () => {
    const capabilities = electronHostShell(fakeElectron({}), 'windows');
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
    expect(Object.keys(electronHostShell(fakeElectron({}), 'linux')).sort()).toEqual([
      'beep',
      'external',
      'pathOpen',
      'pathReveal',
      'trash',
    ]);
  });

  it('maps awaited external completion and rejection', async () => {
    const ok = electronHostShell(fakeElectron({ openExternal: async () => {} }), 'linux');
    await expect(ok.external?.open('https://example.test')).resolves.toEqual({ reason: 'ok' });
    const failed = electronHostShell(
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
    const success = electronHostShell(fakeElectron({ openPath: async () => '' }), 'linux');
    await expect(success.pathOpen?.open('/a')).resolves.toEqual({ reason: 'ok' });
    const failed = electronHostShell(fakeElectron({ openPath: async () => 'no such file' }), 'linux');
    await expect(failed.pathOpen?.open('/a')).resolves.toEqual({
      message: 'no such file',
      reason: 'operation-failed',
    });
  });

  it('does not turn an empty rejected path open into success', async () => {
    const capabilities = electronHostShell(
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
    const capabilities = electronHostShell(
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
    const capabilities = electronHostShell(
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
    electronHostShell(fakeElectron({ beep }), 'linux').beep?.beep();
    expect(beep).toHaveBeenCalledOnce();
  });
});
const shellBeep = shellLeaf(() => electronHostShellBeep(fakeElectron({})));
const shellExternal = shellLeaf(() => electronHostShellExternal(fakeElectron({})));
const shellPathOpen = shellLeaf(() => electronHostShellPathOpen(fakeElectron({})));
const shellPathReveal = shellLeaf(() => electronHostShellPathReveal(fakeElectron({})));
const shellShortcutLink = shellLeaf(() => electronHostShellShortcutLink(fakeElectron({})));
const shellTrash = shellLeaf(() => electronHostShellTrash(fakeElectron({})));

describe('electronHostShellBeep', shellBeep);
describe('electronHostShellExternal', shellExternal);
describe('electronHostShellPathOpen', shellPathOpen);
describe('electronHostShellPathReveal', shellPathReveal);
describe('electronHostShellShortcutLink', shellShortcutLink);
describe('electronHostShellTrash', shellTrash);
describe('populateElectronHostShellBeep', () => {
  it('is the construction initializer of electronHostShellBeep', () => {
    expect(typeof populateElectronHostShellBeep).toBe('function');
  });
});

describe('populateElectronHostShellExternal', () => {
  it('is the construction initializer of electronHostShellExternal', () => {
    expect(typeof populateElectronHostShellExternal).toBe('function');
  });
});

describe('populateElectronHostShellPathOpen', () => {
  it('is the construction initializer of electronHostShellPathOpen', () => {
    expect(typeof populateElectronHostShellPathOpen).toBe('function');
  });
});

describe('populateElectronHostShellPathReveal', () => {
  it('is the construction initializer of electronHostShellPathReveal', () => {
    expect(typeof populateElectronHostShellPathReveal).toBe('function');
  });
});

describe('populateElectronHostShellShortcutLink', () => {
  it('is the construction initializer of electronHostShellShortcutLink', () => {
    expect(typeof populateElectronHostShellShortcutLink).toBe('function');
  });
});

describe('populateElectronHostShellTrash', () => {
  it('is the construction initializer of electronHostShellTrash', () => {
    expect(typeof populateElectronHostShellTrash).toBe('function');
  });
});
