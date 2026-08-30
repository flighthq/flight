import type { ElectronApi, Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createElectronIpcMessageBackend } from './electronIpc';

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

describe('createElectronIpcMessageBackend', () => {
  it('returns an Entity in both runtime and type', () => {
    const backend: Entity = createElectronIpcMessageBackend(fakeElectron().electron);
    expect(EntityRuntimeKey in backend).toBe(true);
  });

  it('delivers a renderer message with its arguments, dropping the event object', () => {
    const { electron, channels } = fakeElectron();
    const backend = createElectronIpcMessageBackend(electron);
    const seen: readonly unknown[][] = [];
    backend.subscribe('ping', (args) => (seen as unknown[][]).push([...args]));
    for (const listener of channels.get('ping') ?? []) listener({ sender: 1 }, 'a', 2);
    expect(seen).toEqual([['a', 2]]);
  });

  // The per-subscription cleanup owns everything subscribe acquired, which is why this slot declares no
  // provider-level destroy: ipcMain is the caller's to tear down, not this backend's.
  it('removes exactly its own ipcMain listener on unsubscribe', () => {
    const { electron, channels } = fakeElectron();
    const backend = createElectronIpcMessageBackend(electron);
    const stopFirst = backend.subscribe('ping', () => {});
    backend.subscribe('ping', () => {});
    expect(channels.get('ping')?.size).toBe(2);
    stopFirst();
    expect(channels.get('ping')?.size).toBe(1);
  });

  // ★ The deleted operations must not come back as members. Electron genuinely supports main-to-renderer
  // send, targeted send, invoke and handle — but none is built, and declaring them here would offer
  // operations no provider performs, which is what the old backend did with a no-op send and an
  // undefined-resolving invoke.
  it('exposes subscribe alone, with no unbuilt operations', () => {
    const backend = createElectronIpcMessageBackend(fakeElectron().electron);
    expect(Object.keys(backend).filter((k) => k !== 'constructor')).toEqual(['subscribe']);
    expect('send' in backend).toBe(false);
    expect('invoke' in backend).toBe(false);
    expect('handle' in backend).toBe(false);
    expect('sendTo' in backend).toBe(false);
    expect('destroy' in backend).toBe(false);
  });
});
