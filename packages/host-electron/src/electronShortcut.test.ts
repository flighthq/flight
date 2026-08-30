import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createElectronShortcutQueryBackend, createElectronShortcutTriggerBackend } from './electronShortcut';

function fakeElectron() {
  const callbacks = new Map<string, () => void>();
  const unregisterCalls: string[] = [];
  const unregisterFailures = new Set<string>();
  const electron = {
    globalShortcut: {
      isRegistered: (accelerator: string) => callbacks.has(accelerator),
      register: (accelerator: string, callback: () => void) => {
        if (callbacks.has(accelerator)) return false;
        callbacks.set(accelerator, callback);
        return true;
      },
      unregister: (accelerator: string) => {
        unregisterCalls.push(accelerator);
        if (unregisterFailures.delete(accelerator)) throw new Error(`failed ${accelerator}`);
        callbacks.delete(accelerator);
      },
      unregisterAll: () => void callbacks.clear(),
    },
  } as unknown as ElectronApi;
  return { callbacks, electron, unregisterCalls, unregisterFailures };
}

describe('createElectronShortcutQueryBackend', () => {
  it('returns an Entity and lifts the native query into the awaited contract', async () => {
    const fake = fakeElectron();
    fake.callbacks.set('Control+K', () => {});
    const provider = createElectronShortcutQueryBackend(fake.electron);
    expect(EntityRuntimeKey in provider).toBe(true);
    await expect(provider.isRegistered('Control+K')).resolves.toBe(true);
    await expect(provider.isRegistered('Control+J')).resolves.toBe(false);
  });
});

describe('createElectronShortcutTriggerBackend', () => {
  it('returns an Entity, subscribes by exact token, and delivers native triggers', async () => {
    const fake = fakeElectron();
    const provider = createElectronShortcutTriggerBackend(fake.electron);
    const trigger = vi.fn();
    expect(EntityRuntimeKey in provider).toBe(true);
    const outcome = await provider.subscribe('Control+K', trigger);
    expect(outcome.reason).toBe('subscribed');
    if (outcome.reason !== 'subscribed') return;
    expect(EntityRuntimeKey in outcome.subscription).toBe(true);
    fake.callbacks.get('Control+K')?.();
    expect(trigger).toHaveBeenCalledTimes(1);
    await expect(provider.unsubscribe(outcome.subscription)).resolves.toEqual({ reason: 'unsubscribed' });
    expect(fake.callbacks.has('Control+K')).toBe(false);
    await expect(provider.unsubscribe(outcome.subscription)).resolves.toEqual({ reason: 'unknown-subscription' });
  });

  it('reports native collision/refusal without minting a token', async () => {
    const fake = fakeElectron();
    fake.callbacks.set('Control+K', () => {});
    const provider = createElectronShortcutTriggerBackend(fake.electron);
    await expect(provider.subscribe('Control+K', () => {})).resolves.toEqual({ reason: 'refused' });
  });

  it('destroy attempts every distinct obligation and retries only failed releases', async () => {
    const fake = fakeElectron();
    const provider = createElectronShortcutTriggerBackend(fake.electron);
    await provider.subscribe('Control+A', () => {});
    await provider.subscribe('Control+B', () => {});
    fake.unregisterFailures.add('Control+A');

    await expect(provider.destroy()).rejects.toThrow('failed Control+A');
    expect(fake.unregisterCalls).toEqual(['Control+A', 'Control+B']);
    expect(fake.callbacks.has('Control+A')).toBe(true);
    expect(fake.callbacks.has('Control+B')).toBe(false);

    await expect(provider.destroy()).resolves.toBeUndefined();
    expect(fake.unregisterCalls).toEqual(['Control+A', 'Control+B', 'Control+A']);
  });
});
