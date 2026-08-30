import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Accelerator,
  CreateGlobalShortcutOutcome,
  GlobalShortcut,
  GlobalShortcutAttachOutcome,
  GlobalShortcutDetachOutcome,
  GlobalShortcutQueryOutcome,
  HasShortcutQuery,
  HasShortcutTrigger,
  ParsedAccelerator,
  ShortcutTriggerBackend,
  ShortcutTriggerSubscription,
} from '@flighthq/types/contract';

import { makeParsedAccelerator, parseAcceleratorDetailed } from './shortcut';

interface GlobalShortcutAttachment {
  readonly provider: ShortcutTriggerBackend;
  readonly subscription: ShortcutTriggerSubscription;
}

const ALREADY_ATTACHED = Object.freeze({ reason: 'already-attached' }) as GlobalShortcutAttachOutcome;
const ALREADY_REGISTERED = Object.freeze({ reason: 'already-registered' }) as GlobalShortcutAttachOutcome;
const ATTACHED = Object.freeze({ reason: 'attached' }) as GlobalShortcutAttachOutcome;
const DETACHED = Object.freeze({ reason: 'detached' }) as GlobalShortcutDetachOutcome;
const NATIVE_REFUSED = Object.freeze({ reason: 'native-refused' }) as GlobalShortcutAttachOutcome;
const NOT_ATTACHED = Object.freeze({ reason: 'not-attached' }) as GlobalShortcutDetachOutcome;
const NOT_REGISTERED = Object.freeze({ reason: 'not-registered' }) as GlobalShortcutQueryOutcome;
const QUERY_PROVIDER_FAILED = Object.freeze({ reason: 'query-provider-failed' }) as GlobalShortcutQueryOutcome;
const REGISTERED = Object.freeze({ reason: 'registered' }) as GlobalShortcutQueryOutcome;
const REGISTRATION_IN_PROGRESS = Object.freeze({
  reason: 'registration-in-progress',
}) as GlobalShortcutAttachOutcome;
const TRIGGER_ATTACH_FAILED = Object.freeze({ reason: 'trigger-provider-failed' }) as GlobalShortcutAttachOutcome;
const TRIGGER_DETACH_FAILED = Object.freeze({ reason: 'trigger-provider-failed' }) as GlobalShortcutDetachOutcome;

const _attachments = new WeakMap<GlobalShortcut, GlobalShortcutAttachment>();
const _attachedByAccelerator = new Map<Accelerator, GlobalShortcut>();
const _pendingAccelerators = new Set<Accelerator>();

export async function attachGlobalShortcut(
  host: HasShortcutTrigger,
  shortcut: GlobalShortcut,
): Promise<GlobalShortcutAttachOutcome> {
  if (_attachments.has(shortcut)) return ALREADY_ATTACHED;
  if (_attachedByAccelerator.has(shortcut.accelerator)) return ALREADY_REGISTERED;
  if (_pendingAccelerators.has(shortcut.accelerator)) return REGISTRATION_IN_PROGRESS;

  const provider = host.shortcut.trigger;
  _pendingAccelerators.add(shortcut.accelerator);
  try {
    const outcome = await provider.subscribe(shortcut.accelerator, () => emitSignal(shortcut.onTrigger));
    if (outcome.reason === 'refused') return NATIVE_REFUSED;

    const attachment = { provider, subscription: outcome.subscription };
    try {
      _attachments.set(shortcut, attachment);
      _attachedByAccelerator.set(shortcut.accelerator, shortcut);
    } catch {
      try {
        await provider.unsubscribe(outcome.subscription);
      } catch {
        // The provider retains failed native releases for destroy/retry.
      }
      return TRIGGER_ATTACH_FAILED;
    }
    return ATTACHED;
  } catch {
    return TRIGGER_ATTACH_FAILED;
  } finally {
    _pendingAccelerators.delete(shortcut.accelerator);
  }
}

// Creates the consumer Entity only after parsing and normalization succeed. Malformed input is a core
// value error and cannot reach a provider.
export function createGlobalShortcut(accelerator: string): CreateGlobalShortcutOutcome {
  const parsed = makeParsedAccelerator();
  const outcome = parseAcceleratorDetailed(accelerator, parsed);
  if ('reason' in outcome) return { parseError: outcome, reason: 'unparseable' };
  return {
    reason: 'created',
    shortcut: createEntity({ accelerator: formatParsedAccelerator(outcome), onTrigger: createSignal() }),
  };
}

export function destroyShortcutTrigger(host: HasShortcutTrigger): Promise<void> {
  return host.shortcut.trigger.destroy();
}

// The Host argument keeps the exact dependency visible, while the stored origin prevents a replacement
// Host from redirecting a release. Failed releases remain attached and can be retried exactly.
export async function detachGlobalShortcut(
  host: HasShortcutTrigger,
  shortcut: GlobalShortcut,
): Promise<GlobalShortcutDetachOutcome> {
  const attachment = _attachments.get(shortcut);
  if (attachment === undefined) return NOT_ATTACHED;
  const selected = host.shortcut.trigger;
  const provider = selected === attachment.provider ? selected : attachment.provider;
  try {
    const outcome = await provider.unsubscribe(attachment.subscription);
    if (outcome.reason !== 'unsubscribed') return TRIGGER_DETACH_FAILED;
  } catch {
    return TRIGGER_DETACH_FAILED;
  }
  _attachments.delete(shortcut);
  if (_attachedByAccelerator.get(shortcut.accelerator) === shortcut) {
    _attachedByAccelerator.delete(shortcut.accelerator);
  }
  return DETACHED;
}

// Disposal always clears consumer listeners, including when native teardown fails. A failed native
// release remains attached so detachGlobalShortcut can retry it later.
export async function disposeGlobalShortcut(
  host: HasShortcutTrigger,
  shortcut: GlobalShortcut,
): Promise<GlobalShortcutDetachOutcome> {
  try {
    return await detachGlobalShortcut(host, shortcut);
  } finally {
    clearSignal(shortcut.onTrigger);
  }
}

export async function queryGlobalShortcutConflict(
  host: HasShortcutQuery,
  accelerator: string,
): Promise<GlobalShortcutQueryOutcome> {
  return queryGlobalShortcutRegistration(host, accelerator);
}

export async function queryGlobalShortcutRegistration(
  host: HasShortcutQuery,
  accelerator: string,
): Promise<GlobalShortcutQueryOutcome> {
  const parsed = makeParsedAccelerator();
  const outcome = parseAcceleratorDetailed(accelerator, parsed);
  if ('reason' in outcome) return { parseError: outcome, reason: 'unparseable' };
  try {
    return (await host.shortcut.query.isRegistered(formatParsedAccelerator(outcome))) ? REGISTERED : NOT_REGISTERED;
  } catch {
    return QUERY_PROVIDER_FAILED;
  }
}

function formatParsedAccelerator(parsed: Readonly<ParsedAccelerator>): Accelerator {
  if (parsed.modifiers.length === 0) return parsed.key;
  return [...parsed.modifiers, parsed.key].join('+');
}
