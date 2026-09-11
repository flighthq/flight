import type { ElectronApi, ElectronIpcRenderer, ElectronIpcTarget, Entity } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  electronHostIpc,
  electronHostIpcHandle,
  electronHostIpcInvoke,
  electronHostIpcMessage,
  electronHostIpcSend,
  electronHostIpcTargetedSend,
  populateElectronHostIpcHandle,
  populateElectronHostIpcInvoke,
  populateElectronHostIpcMessage,
  populateElectronHostIpcSend,
  populateElectronHostIpcTargetedSend,
} from './electronIpc';

function fakeElectron(): {
  channels: Map<string, Set<(event: unknown, ...args: unknown[]) => void>>;
  electron: ElectronApi;
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
} {
  const channels = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const electron = {
    ipcMain: {
      handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, listener);
      },
      on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel)?.add(listener);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
      removeListener: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => {
        channels.get(channel)?.delete(listener);
      },
    },
  } as unknown as ElectronApi;
  return { channels, electron, handlers };
}

function fakeRenderer(): {
  invocations: Array<{ readonly args: readonly unknown[]; readonly channel: string }>;
  renderer: ElectronIpcRenderer;
  sent: Array<{ readonly args: readonly unknown[]; readonly channel: string }>;
} {
  const invocations: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
  const sent: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
  return {
    invocations,
    renderer: {
      invoke(channel, ...args) {
        invocations.push({ args, channel });
        return Promise.resolve({ args, channel });
      },
      send(channel, ...args) {
        sent.push({ args, channel });
      },
    },
    sent,
  };
}

describe('electronHostIpc', () => {
  it('constructs the exact Entity-backed main-process IPC group', () => {
    const ipc = electronHostIpc(fakeElectron().electron);
    expect(Object.keys(ipc).sort()).toEqual(['handle', 'message', 'targetedSend']);
    for (const provider of Object.values(ipc)) expect(EntityRuntimeKey in provider).toBe(true);
  });
});

describe('electronHostIpcHandle', () => {
  it('registers a main-process handler, drops the event, and releases it idempotently', async () => {
    const { electron, handlers } = fakeElectron();
    const backend = electronHostIpcHandle(electron);
    const stop = backend.handle('double', (value) => (value as number) * 2);

    expect(await handlers.get('double')?.({ sender: 1 }, 4)).toBe(8);

    stop();
    stop();
    expect(handlers.has('double')).toBe(false);
  });

  it('returns an Entity', () => {
    const backend: Entity = electronHostIpcHandle(fakeElectron().electron);
    expect(EntityRuntimeKey in backend).toBe(true);
  });
});

describe('electronHostIpcInvoke', () => {
  it('invokes from the renderer with spread arguments and returns the response', async () => {
    const { invocations, renderer } = fakeRenderer();
    const backend = electronHostIpcInvoke(renderer);

    await expect(backend.invoke('compute', [1, 2])).resolves.toEqual({ args: [1, 2], channel: 'compute' });
    expect(invocations).toEqual([{ args: [1, 2], channel: 'compute' }]);
  });

  it('returns an Entity', () => {
    const backend: Entity = electronHostIpcInvoke(fakeRenderer().renderer);
    expect(EntityRuntimeKey in backend).toBe(true);
  });
});

describe('electronHostIpcMessage', () => {
  it('returns an Entity in both runtime and type', () => {
    const backend: Entity = electronHostIpcMessage(fakeElectron().electron);
    expect(EntityRuntimeKey in backend).toBe(true);
  });

  it('delivers a renderer message with its arguments, dropping the event object', () => {
    const { electron, channels } = fakeElectron();
    const backend = electronHostIpcMessage(electron);
    const seen: readonly unknown[][] = [];
    backend.subscribe('ping', (args) => (seen as unknown[][]).push([...args]));
    for (const listener of channels.get('ping') ?? []) listener({ sender: 1 }, 'a', 2);
    expect(seen).toEqual([['a', 2]]);
  });

  // The per-subscription cleanup owns everything subscribe acquired, which is why this slot declares no
  // provider-level destroy: ipcMain is the caller's to tear down, not this backend's.
  it('removes exactly its own ipcMain listener on unsubscribe', () => {
    const { electron, channels } = fakeElectron();
    const backend = electronHostIpcMessage(electron);
    const stopFirst = backend.subscribe('ping', () => {});
    backend.subscribe('ping', () => {});
    expect(channels.get('ping')?.size).toBe(2);
    stopFirst();
    expect(channels.get('ping')?.size).toBe(1);
  });

  it('remains independent from the other IPC capabilities', () => {
    const backend = electronHostIpcMessage(fakeElectron().electron);
    expect(Object.keys(backend).filter((key) => key !== 'constructor')).toEqual(['subscribe']);
    expect('send' in backend).toBe(false);
    expect('invoke' in backend).toBe(false);
    expect('handle' in backend).toBe(false);
    expect('sendTo' in backend).toBe(false);
    expect('destroy' in backend).toBe(false);
  });
});

describe('electronHostIpcSend', () => {
  it('sends from the renderer with spread arguments', () => {
    const { renderer, sent } = fakeRenderer();
    const backend = electronHostIpcSend(renderer);

    backend.send('log', ['hello', 7]);

    expect(sent).toEqual([{ args: ['hello', 7], channel: 'log' }]);
  });

  it('returns an Entity', () => {
    const backend: Entity = electronHostIpcSend(fakeRenderer().renderer);
    expect(EntityRuntimeKey in backend).toBe(true);
  });
});

describe('electronHostIpcTargetedSend', () => {
  it('keeps the target generic and delegates to its Electron send seam', () => {
    const sent: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
    const target: ElectronIpcTarget & { readonly label: string } = {
      label: 'preview',
      send(channel, ...args) {
        sent.push({ args, channel });
      },
    };
    const backend = electronHostIpcTargetedSend<typeof target>();

    backend.send(target, 'refresh', [1, 2]);

    expect(sent).toEqual([{ args: [1, 2], channel: 'refresh' }]);
  });

  it('returns an Entity', () => {
    const backend: Entity = electronHostIpcTargetedSend<ElectronIpcTarget>();
    expect(EntityRuntimeKey in backend).toBe(true);
  });
});
describe('populateElectronHostIpcHandle', () => {
  it('is the construction initializer of electronHostIpcHandle', () => {
    expect(typeof populateElectronHostIpcHandle).toBe('function');
  });
});

describe('populateElectronHostIpcInvoke', () => {
  it('is the construction initializer of electronHostIpcInvoke', () => {
    expect(typeof populateElectronHostIpcInvoke).toBe('function');
  });
});

describe('populateElectronHostIpcMessage', () => {
  it('is the construction initializer of electronHostIpcMessage', () => {
    expect(typeof populateElectronHostIpcMessage).toBe('function');
  });
});

describe('populateElectronHostIpcSend', () => {
  it('is the construction initializer of electronHostIpcSend', () => {
    expect(typeof populateElectronHostIpcSend).toBe('function');
  });
});

describe('populateElectronHostIpcTargetedSend', () => {
  it('is the construction initializer of electronHostIpcTargetedSend', () => {
    expect(typeof populateElectronHostIpcTargetedSend).toBe('function');
  });
});
