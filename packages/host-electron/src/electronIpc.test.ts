import { createElectronIpcBackend } from './electronIpc';
import type { ElectronApi } from './electronModule';

function fakeElectron(): {
  electron: ElectronApi;
  channels: Map<string, Set<(event: unknown, ...args: unknown[]) => void>>;
} {
  const channels = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const electron = {
    ipcMain: {
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel)?.add(listener);
      },
      removeListener: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        channels.get(channel)?.delete(listener);
      },
    },
  } as unknown as ElectronApi;
  return { electron, channels };
}

describe('createElectronIpcBackend', () => {
  it('send no-ops without a webContents target', () => {
    const { electron } = fakeElectron();
    const backend = createElectronIpcBackend(electron);
    expect(() => backend.send('channel', [1, 2])).not.toThrow();
  });

  it('invoke resolves to undefined on the main side', async () => {
    const { electron } = fakeElectron();
    const backend = createElectronIpcBackend(electron);
    expect(await backend.invoke('channel', [])).toBeUndefined();
  });

  it('subscribe receives renderer args and unsubscribes the same handler', () => {
    const { electron, channels } = fakeElectron();
    const backend = createElectronIpcBackend(electron);
    let received: readonly unknown[] | undefined;
    const unsubscribe = backend.subscribe('chat', (args) => (received = args));
    expect(channels.get('chat')?.size).toBe(1);
    for (const listener of channels.get('chat') ?? []) listener({ sender: 1 }, 'hello', 42);
    expect(received).toEqual(['hello', 42]);
    unsubscribe();
    expect(channels.get('chat')?.size).toBe(0);
  });
});
