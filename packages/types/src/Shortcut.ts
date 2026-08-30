import type { Accelerator } from './Accelerator';
import type { AcceleratorParseError } from './AcceleratorParseError';
import type { Entity } from './Entity';
import type { Signal } from './Signal';

// One caller-owned global-hotkey registration. The normalized accelerator is durable value data; the
// signal, native subscription token, provider origin, and attachment state are runtime-only.
export interface GlobalShortcut extends Entity {
  readonly accelerator: Accelerator;
  readonly onTrigger: Signal<() => void>;
}

// Opaque handle returned by the native trigger provider after registration succeeds. Providers keep
// their native accelerator/callback identity out of band and accept only the exact token at teardown.
export interface ShortcutTriggerSubscription extends Entity {}

export type CreateGlobalShortcutOutcome =
  | Readonly<{ reason: 'created'; shortcut: GlobalShortcut }>
  | Readonly<{ parseError: AcceleratorParseError; reason: 'unparseable' }>;

export type GlobalShortcutAttachOutcome = Readonly<{
  reason:
    | 'already-attached'
    | 'already-registered'
    | 'attached'
    | 'native-refused'
    | 'registration-in-progress'
    | 'trigger-provider-failed';
}>;

export type GlobalShortcutDetachOutcome = Readonly<{
  reason: 'detached' | 'not-attached' | 'trigger-provider-failed';
}>;

export type GlobalShortcutQueryOutcome =
  | Readonly<{ reason: 'not-registered' | 'query-provider-failed' | 'registered' }>
  | Readonly<{ parseError: AcceleratorParseError; reason: 'unparseable' }>;

export type ShortcutTriggerSubscribeOutcome =
  | Readonly<{ reason: 'refused' }>
  | Readonly<{ reason: 'subscribed'; subscription: ShortcutTriggerSubscription }>;

export interface ShortcutTriggerUnsubscribeOutcome {
  readonly reason: 'unknown-subscription' | 'unsubscribed';
}

// Native registration is the trigger event subscription. It is awaited uniformly: Electron lifts its
// synchronous boolean into this shape, while Tauri awaits the plugin Promise. destroy owns any native
// registrations whose exact tokens have not yet been successfully unsubscribed.
export interface ShortcutTriggerBackend extends Entity {
  destroy(): Promise<void>;
  subscribe(accelerator: Accelerator, trigger: () => void): Promise<ShortcutTriggerSubscribeOutcome>;
  unsubscribe(subscription: ShortcutTriggerSubscription): Promise<ShortcutTriggerUnsubscribeOutcome>;
}

// Kept separate from trigger despite identical E/T coverage because a query is a command/result shape,
// not an event subscription. Provider absence is represented only by an omitted Host slot.
export interface ShortcutQueryBackend extends Entity {
  isRegistered(accelerator: Accelerator): Promise<boolean>;
}
