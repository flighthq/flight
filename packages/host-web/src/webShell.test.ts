import { EntityRuntimeKey } from '@flighthq/types/contract';

import { initializeWebShellExternalBackend, webHostShellExternal } from './webShell';

afterEach(() => vi.unstubAllGlobals());

describe('initializeWebShellExternalBackend', () => {
  it('is the construction initializer of createWebShellExternalBackend', () => {
    expect(typeof initializeWebShellExternalBackend).toBe('function');
  });
});
describe('webHostShellExternal', () => {
  it('is a stable Entity', () => {
    expect(EntityRuntimeKey in webHostShellExternal).toBe(true);
  });

  it('reports popup blocking when window.open returns null', async () => {
    vi.stubGlobal('window', { open: () => null });
    await expect(webHostShellExternal.open('https://example.test')).resolves.toEqual({
      reason: 'popup-blocked',
    });
  });

  it('reports success only when window.open returns a window', async () => {
    vi.stubGlobal('window', { open: () => ({}) });
    await expect(webHostShellExternal.open('https://example.test')).resolves.toEqual({ reason: 'ok' });
  });

  it('reports operation failure when the browser API throws', async () => {
    vi.stubGlobal('window', {
      open() {
        throw new Error('denied');
      },
    });
    await expect(webHostShellExternal.open('https://example.test')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });
});
