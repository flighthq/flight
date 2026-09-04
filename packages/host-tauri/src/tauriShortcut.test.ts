import type { TauriApi, TauriShortcutEvent } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createTauriShortcutQueryBackend,
  createTauriShortcutTriggerBackend,
  initializeTauriShortcutQueryBackend,
  initializeTauriShortcutTriggerBackend,
} from './tauriShortcut';

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function fakeTauri() {
  const handlers = new Map<string, (event: Readonly<TauriShortcutEvent>) => void>();
  const unregisterCalls: string[] = [];
  const unregisterFailures = new Set<string>();
  const tauri = {
    globalShortcut: {
      isRegistered: async (accelerator: string) => handlers.has(accelerator),
      register: async (accelerator: string, handler: (event: Readonly<TauriShortcutEvent>) => void) => {
        handlers.set(accelerator, handler);
      },
      unregister: async (accelerator: string) => {
        unregisterCalls.push(accelerator);
        if (unregisterFailures.delete(accelerator)) throw new Error(`failed ${accelerator}`);
        handlers.delete(accelerator);
      },
      unregisterAll: async () => void handlers.clear(),
    },
  } as unknown as TauriApi;
  return { handlers, tauri, unregisterCalls, unregisterFailures };
}

describe('createTauriShortcutQueryBackend', () => {
  it('returns an Entity and awaits the plugin query', async () => {
    const fake = fakeTauri();
    fake.handlers.set('Control+K', () => {});
    const provider = createTauriShortcutQueryBackend(fake.tauri);
    expect(EntityRuntimeKey in provider).toBe(true);
    await expect(provider.isRegistered('Control+K')).resolves.toBe(true);
    await expect(provider.isRegistered('Control+J')).resolves.toBe(false);
  });
});

describe('createTauriShortcutTriggerBackend', () => {
  it('returns an Entity, awaits acquisition, filters release events, and tears down by exact token', async () => {
    const fake = fakeTauri();
    const provider = createTauriShortcutTriggerBackend(fake.tauri);
    const trigger = vi.fn();
    expect(EntityRuntimeKey in provider).toBe(true);
    const outcome = await provider.subscribe('Control+K', trigger);
    expect(outcome.reason).toBe('subscribed');
    if (outcome.reason !== 'subscribed') return;
    expect(EntityRuntimeKey in outcome.subscription).toBe(true);
    fake.handlers.get('Control+K')?.({ shortcut: 'Control+K', state: 'Released' });
    fake.handlers.get('Control+K')?.({ shortcut: 'Control+K', state: 'Pressed' });
    expect(trigger).toHaveBeenCalledTimes(1);
    await expect(provider.unsubscribe(outcome.subscription)).resolves.toEqual({ reason: 'unsubscribed' });
    expect(fake.handlers.has('Control+K')).toBe(false);
  });

  it('propagates attempted provider faults and never publishes a failed registration', async () => {
    const fake = fakeTauri();
    fake.tauri.globalShortcut.register = async () => {
      throw new Error('registration failed');
    };
    const provider = createTauriShortcutTriggerBackend(fake.tauri);
    await expect(provider.subscribe('Control+K', () => {})).rejects.toThrow('registration failed');
    await expect(provider.destroy()).resolves.toBeUndefined();
  });

  it('destroy waits for pending acquisition, attempts every obligation, and retries only failures', async () => {
    const fake = fakeTauri();
    const registration = deferred();
    fake.tauri.globalShortcut.register = async (accelerator, handler) => {
      if (accelerator === 'Control+A') await registration.promise;
      fake.handlers.set(accelerator, handler);
    };
    const provider = createTauriShortcutTriggerBackend(fake.tauri);
    const pending = provider.subscribe('Control+A', () => {});
    await provider.subscribe('Control+B', () => {});
    fake.unregisterFailures.add('Control+A');

    const destroying = provider.destroy();
    registration.resolve();
    await pending;
    await expect(destroying).rejects.toThrow('failed Control+A');
    expect([...fake.unregisterCalls].sort()).toEqual(['Control+A', 'Control+B']);
    expect(fake.handlers.has('Control+A')).toBe(true);
    expect(fake.handlers.has('Control+B')).toBe(false);

    await expect(provider.destroy()).resolves.toBeUndefined();
    expect(fake.unregisterCalls).toHaveLength(3);
    expect(fake.unregisterCalls.filter((accelerator) => accelerator === 'Control+A')).toHaveLength(2);
    expect(fake.unregisterCalls.filter((accelerator) => accelerator === 'Control+B')).toHaveLength(1);
  });
});
describe('initializeTauriShortcutQueryBackend', () => {
  it('is the construction initializer of createTauriShortcutQueryBackend', () => {
    expect(typeof initializeTauriShortcutQueryBackend).toBe('function');
  });
});

describe('initializeTauriShortcutTriggerBackend', () => {
  it('is the construction initializer of createTauriShortcutTriggerBackend', () => {
    expect(typeof initializeTauriShortcutTriggerBackend).toBe('function');
  });
});
