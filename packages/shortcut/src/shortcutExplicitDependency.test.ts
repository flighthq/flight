import { connectSignal } from '@flighthq/signals/contract';
import type { AcceleratorParseError, Entity, Signal } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as shortcutExports from './shortcutExplicitDependency';
import { initializeGlobalShortcut } from './shortcutExplicitDependency';

interface GlobalShortcutLike extends Entity {
  readonly accelerator: string;
  readonly onTrigger: Signal<() => void>;
}

interface ShortcutSubscriptionLike extends Entity {}

interface TriggerProviderLike extends Entity {
  destroy(): Promise<void>;
  subscribe(
    accelerator: string,
    trigger: () => void,
  ): Promise<
    Readonly<{ reason: 'refused' }> | Readonly<{ reason: 'subscribed'; subscription: ShortcutSubscriptionLike }>
  >;
  unsubscribe(
    subscription: ShortcutSubscriptionLike,
  ): Promise<Readonly<{ reason: 'unsubscribed' | 'unknown-subscription' }>>;
}

interface QueryProviderLike extends Entity {
  isRegistered(accelerator: string): Promise<boolean>;
}

interface ShortcutApi {
  attachGlobalShortcut(
    host: { readonly shortcut: { readonly trigger: TriggerProviderLike } },
    shortcut: GlobalShortcutLike,
  ): Promise<Readonly<{ reason: string }>>;
  createGlobalShortcut(
    accelerator: string,
  ):
    | Readonly<{ parseError: AcceleratorParseError; reason: 'unparseable' }>
    | Readonly<{ reason: 'created'; shortcut: GlobalShortcutLike }>;
  destroyShortcutTrigger(host: { readonly shortcut: { readonly trigger: TriggerProviderLike } }): Promise<void>;
  detachGlobalShortcut(
    host: { readonly shortcut: { readonly trigger: TriggerProviderLike } },
    shortcut: GlobalShortcutLike,
  ): Promise<Readonly<{ reason: string }>>;
  disposeGlobalShortcut(
    host: { readonly shortcut: { readonly trigger: TriggerProviderLike } },
    shortcut: GlobalShortcutLike,
  ): Promise<Readonly<{ reason: string }>>;
  queryGlobalShortcutConflict(
    host: { readonly shortcut: { readonly query: QueryProviderLike } },
    accelerator: string,
  ): Promise<Readonly<{ reason: string }>>;
  queryGlobalShortcutRegistration(
    host: { readonly shortcut: { readonly query: QueryProviderLike } },
    accelerator: string,
  ): Promise<Readonly<{ parseError?: AcceleratorParseError; reason: string }>>;
}

interface Deferred<Type> {
  readonly promise: Promise<Type>;
  readonly resolve: (value: Type) => void;
}

function deferred<Type>(): Deferred<Type> {
  let resolve!: (value: Type) => void;
  const promise = new Promise<Type>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function api(): ShortcutApi {
  return shortcutExports as unknown as ShortcutApi;
}

function createShortcut(accelerator: string): GlobalShortcutLike {
  const outcome = api().createGlobalShortcut(accelerator);
  if (outcome.reason !== 'created') throw new Error(`Expected '${accelerator}' to parse`);
  return outcome.shortcut;
}

function subscription(): ShortcutSubscriptionLike {
  return { [EntityRuntimeKey]: undefined };
}

function triggerProvider(
  overrides: Partial<Pick<TriggerProviderLike, 'destroy' | 'subscribe' | 'unsubscribe'>> = {},
): TriggerProviderLike {
  return {
    [EntityRuntimeKey]: undefined,
    destroy: async () => {},
    subscribe: async () => ({ reason: 'subscribed', subscription: subscription() }),
    unsubscribe: async () => ({ reason: 'unsubscribed' }),
    ...overrides,
  };
}

function triggerHost(provider: TriggerProviderLike) {
  return { shortcut: { trigger: provider } };
}

function queryHost(provider: QueryProviderLike) {
  return { shortcut: { query: provider } };
}

describe('attachGlobalShortcut', () => {
  it('maps a native refusal to a method-tight outcome', async () => {
    const provider = triggerProvider({ subscribe: async () => ({ reason: 'refused' }) });
    await expect(api().attachGlobalShortcut(triggerHost(provider), createShortcut('Control+K'))).resolves.toEqual({
      reason: 'native-refused',
    });
  });

  it('maps an attempted provider fault without inventing provider absence', async () => {
    const provider = triggerProvider({
      subscribe: async () => {
        throw new Error('provider failed');
      },
    });
    await expect(api().attachGlobalShortcut(triggerHost(provider), createShortcut('Control+J'))).resolves.toEqual({
      reason: 'trigger-provider-failed',
    });
  });

  it('reports an in-progress same-chord acquisition without invoking the provider twice', async () => {
    const pending = deferred<Readonly<{ reason: 'subscribed'; subscription: ShortcutSubscriptionLike }>>();
    const subscribe = vi.fn(() => pending.promise);
    const host = triggerHost(triggerProvider({ subscribe }));
    const first = api().attachGlobalShortcut(host, createShortcut('Control+P'));

    await expect(api().attachGlobalShortcut(host, createShortcut('ctrl+p'))).resolves.toEqual({
      reason: 'registration-in-progress',
    });
    expect(subscribe).toHaveBeenCalledTimes(1);
    pending.resolve({ reason: 'subscribed', subscription: subscription() });
    await expect(first).resolves.toEqual({ reason: 'attached' });
  });

  it('does not overwrite the first live same-chord registration', async () => {
    const host = triggerHost(triggerProvider());
    await expect(api().attachGlobalShortcut(host, createShortcut('Control+B'))).resolves.toEqual({
      reason: 'attached',
    });
    await expect(api().attachGlobalShortcut(host, createShortcut('ctrl+b'))).resolves.toEqual({
      reason: 'already-registered',
    });
  });
});

describe('createGlobalShortcut', () => {
  it('returns an Entity carrying the normalized accelerator and its own trigger signal', () => {
    const outcome = api().createGlobalShortcut('shift+ctrl+k');
    expect(outcome.reason).toBe('created');
    if (outcome.reason !== 'created') return;
    expect(EntityRuntimeKey in outcome.shortcut).toBe(true);
    expect(outcome.shortcut.accelerator).toBe('Control+Shift+K');
    expect(outcome.shortcut.onTrigger).toBeDefined();
  });

  it('returns a parse-specific outcome before any provider can be involved', () => {
    expect(api().createGlobalShortcut('Control+NotAKey')).toEqual({
      parseError: { reason: 'unknown-key', token: 'NotAKey' },
      reason: 'unparseable',
    });
  });
});

describe('destroyShortcutTrigger', () => {
  it('awaits the exact trigger provider destroy boundary', async () => {
    const destroy = vi.fn(async () => {});
    await api().destroyShortcutTrigger(triggerHost(triggerProvider({ destroy })));
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('detachGlobalShortcut', () => {
  it('uses the creator-pinned provider after Host replacement', async () => {
    const originUnsubscribe = vi.fn(async () => ({ reason: 'unsubscribed' as const }));
    const replacementUnsubscribe = vi.fn(async () => ({ reason: 'unsubscribed' as const }));
    const origin = triggerHost(triggerProvider({ unsubscribe: originUnsubscribe }));
    const replacement = triggerHost(triggerProvider({ unsubscribe: replacementUnsubscribe }));
    const shortcut = createShortcut('Control+D');
    await api().attachGlobalShortcut(origin, shortcut);

    await expect(api().detachGlobalShortcut(replacement, shortcut)).resolves.toEqual({ reason: 'detached' });
    expect(originUnsubscribe).toHaveBeenCalledTimes(1);
    expect(replacementUnsubscribe).not.toHaveBeenCalled();
  });

  it('retains a failed release for an exact retry', async () => {
    const unsubscribe = vi
      .fn<TriggerProviderLike['unsubscribe']>()
      .mockRejectedValueOnce(new Error('first release failed'))
      .mockResolvedValueOnce({ reason: 'unsubscribed' });
    const host = triggerHost(triggerProvider({ unsubscribe }));
    const shortcut = createShortcut('Control+R');
    await api().attachGlobalShortcut(host, shortcut);

    await expect(api().detachGlobalShortcut(host, shortcut)).resolves.toEqual({ reason: 'trigger-provider-failed' });
    await expect(api().detachGlobalShortcut(host, shortcut)).resolves.toEqual({ reason: 'detached' });
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});

describe('disposeGlobalShortcut', () => {
  it('clears listeners even when detach fails and preserves the failed release for retry', async () => {
    let providerTrigger: (() => void) | undefined;
    const unsubscribe = vi
      .fn<TriggerProviderLike['unsubscribe']>()
      .mockRejectedValueOnce(new Error('release failed'))
      .mockResolvedValueOnce({ reason: 'unsubscribed' });
    const subscribe = vi.fn(async (_accelerator: string, trigger: () => void) => {
      providerTrigger = trigger;
      return { reason: 'subscribed' as const, subscription: subscription() };
    });
    const host = triggerHost(triggerProvider({ subscribe, unsubscribe }));
    const shortcut = createShortcut('Control+X');
    const listener = vi.fn();
    connectSignal(shortcut.onTrigger, listener);
    await api().attachGlobalShortcut(host, shortcut);

    await expect(api().disposeGlobalShortcut(host, shortcut)).resolves.toEqual({ reason: 'trigger-provider-failed' });
    providerTrigger?.();
    expect(listener).not.toHaveBeenCalled();
    await expect(api().detachGlobalShortcut(host, shortcut)).resolves.toEqual({ reason: 'detached' });
  });
});

describe('initializeGlobalShortcut', () => {
  it('is the construction initializer of createGlobalShortcut', () => {
    expect(typeof initializeGlobalShortcut).toBe('function');
  });
});

describe('queryGlobalShortcutConflict', () => {
  it('uses the exact query witness and preserves its method-tight outcome', async () => {
    const host = queryHost({ [EntityRuntimeKey]: undefined, isRegistered: async () => true });
    await expect(api().queryGlobalShortcutConflict(host, 'Control+Q')).resolves.toEqual({ reason: 'registered' });
  });
});
describe('queryGlobalShortcutRegistration', () => {
  it('parses before querying and returns the exact parse error without calling the provider', async () => {
    const isRegistered = vi.fn(async () => false);
    const host = queryHost({ [EntityRuntimeKey]: undefined, isRegistered });
    await expect(api().queryGlobalShortcutRegistration(host, 'Control+NotAKey')).resolves.toEqual({
      parseError: { reason: 'unknown-key', token: 'NotAKey' },
      reason: 'unparseable',
    });
    expect(isRegistered).not.toHaveBeenCalled();
  });

  it('distinguishes registered, not registered, and an attempted query-provider fault', async () => {
    const yes = queryHost({ [EntityRuntimeKey]: undefined, isRegistered: async () => true });
    const no = queryHost({ [EntityRuntimeKey]: undefined, isRegistered: async () => false });
    const failed = queryHost({
      [EntityRuntimeKey]: undefined,
      isRegistered: async () => {
        throw new Error('query failed');
      },
    });
    await expect(api().queryGlobalShortcutRegistration(yes, 'Control+Q')).resolves.toEqual({ reason: 'registered' });
    await expect(api().queryGlobalShortcutRegistration(no, 'Control+Q')).resolves.toEqual({ reason: 'not-registered' });
    await expect(api().queryGlobalShortcutRegistration(failed, 'Control+Q')).resolves.toEqual({
      reason: 'query-provider-failed',
    });
  });
});
