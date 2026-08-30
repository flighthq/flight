import { createEntity } from '@flighthq/entity/contract';
import type {
  Accelerator,
  ShortcutQueryBackend,
  ShortcutTriggerBackend,
  ShortcutTriggerSubscription,
  TauriApi,
} from '@flighthq/types/contract';

export function createTauriShortcutQueryBackend(tauri: TauriApi): ShortcutQueryBackend {
  const provider = createEntity({
    async isRegistered(accelerator: Accelerator) {
      return await tauri.globalShortcut.isRegistered(accelerator);
    },
  });
  return provider;
}

// Tauri's plugin is async at every boundary. Registrations enter the owned ledger only after native
// acquisition settles; failed unregisters remain there so destroy or an exact-token retry can release them.
export function createTauriShortcutTriggerBackend(tauri: TauriApi): ShortcutTriggerBackend {
  const globalShortcut = tauri.globalShortcut;
  const registrations = new Map<ShortcutTriggerSubscription, Accelerator>();
  const pending = new Set<Promise<void>>();

  async function releaseAccelerator(accelerator: Accelerator): Promise<void> {
    await globalShortcut.unregister(accelerator);
    for (const [subscription, registered] of registrations) {
      if (registered === accelerator) registrations.delete(subscription);
    }
  }

  const provider = createEntity({
    async destroy() {
      await Promise.allSettled([...pending]);
      let firstError: unknown;
      const accelerators = new Set(registrations.values());
      for (const accelerator of accelerators) {
        try {
          await releaseAccelerator(accelerator);
        } catch (error) {
          if (firstError === undefined) firstError = error;
        }
      }
      if (firstError !== undefined) throw firstError;
    },
    async subscribe(accelerator: Accelerator, trigger: () => void) {
      const subscription = createEntity();
      const registration = globalShortcut.register(accelerator, (event) => {
        if (event.state === 'Pressed' && registrations.has(subscription)) trigger();
      });
      pending.add(registration);
      try {
        await registration;
        registrations.set(subscription, accelerator);
        return { reason: 'subscribed' as const, subscription };
      } finally {
        pending.delete(registration);
      }
    },
    async unsubscribe(subscription: ShortcutTriggerSubscription) {
      const accelerator = registrations.get(subscription);
      if (accelerator === undefined) return { reason: 'unknown-subscription' as const };
      await releaseAccelerator(accelerator);
      return { reason: 'unsubscribed' as const };
    },
  });
  return provider;
}
