import type { ElectronApi } from './electronModule';
import { createElectronShellBackend } from './shell';

function fakeElectron(shell: Partial<ElectronApi['shell']>): ElectronApi {
  return { shell } as unknown as ElectronApi;
}

describe('createElectronShellBackend', () => {
  it('openExternal returns true on success and false on throw', async () => {
    const ok = createElectronShellBackend(fakeElectron({ openExternal: async () => {} }));
    expect(await ok.openExternal('https://example.test')).toBe(true);
    const bad = createElectronShellBackend(
      fakeElectron({
        openExternal: async () => {
          throw new Error('no');
        },
      }),
    );
    expect(await bad.openExternal('https://example.test')).toBe(false);
  });

  it('openPath maps the empty-string success convention to true', async () => {
    const ok = createElectronShellBackend(fakeElectron({ openPath: async () => '' }));
    expect(await ok.openPath('/a')).toBe(true);
    const err = createElectronShellBackend(fakeElectron({ openPath: async () => 'no such file' }));
    expect(await err.openPath('/a')).toBe(false);
  });

  it('showItemInFolder returns true after revealing the path', async () => {
    let revealed = '';
    const backend = createElectronShellBackend(
      fakeElectron({
        showItemInFolder: (path: string) => {
          revealed = path;
        },
      }),
    );
    expect(await backend.showItemInFolder('/a/b')).toBe(true);
    expect(revealed).toBe('/a/b');
  });

  it('moveToTrash returns true on success and false on throw', async () => {
    const ok = createElectronShellBackend(fakeElectron({ trashItem: async () => {} }));
    expect(await ok.moveToTrash('/a')).toBe(true);
    const bad = createElectronShellBackend(
      fakeElectron({
        trashItem: async () => {
          throw new Error('no');
        },
      }),
    );
    expect(await bad.moveToTrash('/a')).toBe(false);
  });

  it('beep delegates to the shell', () => {
    let beeped = false;
    const backend = createElectronShellBackend(
      fakeElectron({
        beep: () => {
          beeped = true;
        },
      }),
    );
    backend.beep();
    expect(beeped).toBe(true);
  });
});
