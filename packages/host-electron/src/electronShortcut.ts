import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Accelerator,
  ElectronApi,
  Entity,
  HostShortcutCapabilities,
  HostShortcutQueryProvider,
  HostShortcutTriggerProvider,
  ShortcutTriggerSubscription,
  EntityConstruction,
} from '@flighthq/types/contract';

export function electronHostShortcut(
  electron: ElectronApi,
): Required<Pick<HostShortcutCapabilities, 'query' | 'trigger'>> {
  return {
    query: electronHostShortcutQuery(electron),
    trigger: electronHostShortcutTrigger(electron),
  };
}

export function electronHostShortcutQuery(electron: ElectronApi): HostShortcutQueryProvider {
  const provider = allocateEntity<HostShortcutQueryProvider>();
  populateElectronHostShortcutQuery(provider, electron);
  return finishEntity(provider);
}

// Electron registration is synchronous, but the provider lifts it into the same awaited subscription
// contract as Tauri. Exact opaque tokens keep native accelerator identity private and creator-pinned.
export function electronHostShortcutTrigger(electron: ElectronApi): HostShortcutTriggerProvider {
  const globalShortcut = electron.globalShortcut;
  const registrations = new Map<ShortcutTriggerSubscription, Accelerator>();

  async function releaseAccelerator(accelerator: Accelerator): Promise<void> {
    globalShortcut.unregister(accelerator);
    for (const [subscription, registered] of registrations) {
      if (registered === accelerator) registrations.delete(subscription);
    }
  }

  const provider = (() => {
    const out = allocateEntity<HostShortcutTriggerProvider>();
    out.destroy = async () => {
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
    };
    out.subscribe = async (accelerator: Accelerator, trigger: () => void) => {
      const subscription = finishEntity(allocateEntity<Entity>());
      const registered = globalShortcut.register(accelerator, trigger);
      if (!registered) return { reason: 'refused' as const };
      registrations.set(subscription, accelerator);
      return { reason: 'subscribed' as const, subscription };
    };
    out.unsubscribe = async (subscription: ShortcutTriggerSubscription) => {
      const accelerator = registrations.get(subscription);
      if (accelerator === undefined) return { reason: 'unknown-subscription' as const };
      await releaseAccelerator(accelerator);
      return { reason: 'unsubscribed' as const };
    };
    return finishEntity(out);
  })();
  return provider;
}

export function populateElectronHostShortcutQuery(
  provider: EntityConstruction<HostShortcutQueryProvider>,
  electron: ElectronApi,
): void {
  provider.isRegistered = async (accelerator: Accelerator) => {
    return electron.globalShortcut.isRegistered(accelerator);
  };
}
