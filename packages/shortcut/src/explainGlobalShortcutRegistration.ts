import type { GlobalShortcutBlockReason, GlobalShortcutExplanation } from '@flighthq/types/contract';

import {
  createParsedAccelerator,
  hasNativeShortcutBackend,
  isGlobalShortcutRegistered,
  parseAcceleratorDetailed,
} from './shortcut';

// Recomputes why registerGlobalShortcut(`accelerator`, …) would or would not take, and returns it as
// plain data. Pure: it re-runs the parser and reads the active backend's registry, mutates nothing,
// registers nothing, never throws on malformed input, and retains no reference to the backend. Import
// it to debug a hotkey that silently never fires; it sheds from production when unimported.
//
// This is the pull half of the diagnostics convention, and it duplicates the register path's drop
// conditions by design — the maintenance seam is that a new gate on registerGlobalShortcut must gain
// a matching check here or this query silently goes stale.
export function explainGlobalShortcutRegistration(accelerator: string): GlobalShortcutExplanation {
  const parsed = parseAcceleratorDetailed(accelerator, createParsedAccelerator());
  const failed = 'reason' in parsed;
  const parseError = failed ? parsed : null;
  const normalized = failed ? null : _joinNormalized(parsed.modifiers, parsed.key);

  const hasBackend = hasNativeShortcutBackend();
  const registered = normalized !== null && isGlobalShortcutRegistered(normalized);

  let reason: GlobalShortcutBlockReason;
  if (failed) reason = 'unparseable';
  else if (!hasBackend) reason = 'no-native-backend';
  else if (registered) reason = 'already-registered';
  else reason = 'ok';

  return { accelerator, hasNativeBackend: hasBackend, normalized, parseError, registered, reason };
}

// Rebuilds the canonical string from an already-parsed chord. Local rather than a call back into
// normalizeAccelerator so the explanation costs one parse, not two.
function _joinNormalized(modifiers: readonly string[], key: string): string {
  if (modifiers.length === 0) return key;
  return [...modifiers, key].join('+');
}
