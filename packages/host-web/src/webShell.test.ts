import { EntityRuntimeKey } from '@flighthq/types/contract';

import { webShellExternalBackend } from './webShell';

afterEach(() => vi.unstubAllGlobals());

describe('webShellExternalBackend', () => {
  it('is a stable Entity', () => {
    expect(EntityRuntimeKey in webShellExternalBackend).toBe(true);
  });

  it('reports popup blocking when window.open returns null', async () => {
    vi.stubGlobal('window', { open: () => null });
    await expect(webShellExternalBackend.open('https://example.test')).resolves.toEqual({
      reason: 'popup-blocked',
    });
  });

  it('reports success only when window.open returns a window', async () => {
    vi.stubGlobal('window', { open: () => ({}) });
    await expect(webShellExternalBackend.open('https://example.test')).resolves.toEqual({ reason: 'ok' });
  });

  it('reports operation failure when the browser API throws', async () => {
    vi.stubGlobal('window', {
      open() {
        throw new Error('denied');
      },
    });
    await expect(webShellExternalBackend.open('https://example.test')).resolves.toEqual({
      reason: 'operation-failed',
    });
  });
});
