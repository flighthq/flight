import type { AcceleratorParseError } from './AcceleratorParseError';

// The push half of the shortcut diagnostics convention: the record handed to a ShortcutDropGuard when
// a global-shortcut command returns its false/null sentinel for a reason the caller almost certainly
// did not intend. Only the two knowable causes are reported — a string that cannot parse, and a
// command that reached the web default backend, which has no registry to act on. A native backend
// returning false is a legitimate answer (the chord was not registered) and is not a drop.
export interface ShortcutDrop {
  // The command that dropped, spelled as the exported function the caller wrote, so a report can
  // name the call site without a lookup table.
  readonly operation: ShortcutOperation;
  // The raw input string as the caller spelled it.
  readonly accelerator: string;
  readonly reason: ShortcutDropReason;
  // Why the parse failed, or null when the drop was not a parse failure.
  readonly parseError: AcceleratorParseError | null;
}

// Installed by enableShortcutGuards and consulted at each drop site. Null uninstalls it, and null is
// the production default — the message text and the @flighthq/log dependency live only in the
// separately-imported guard module, so not enabling guards costs a null check.
export type ShortcutDropGuard = (drop: Readonly<ShortcutDrop>) => void;

export type ShortcutDropReason = 'no-native-backend' | 'unparseable';

export type ShortcutOperation =
  | 'disableGlobalShortcut'
  | 'enableGlobalShortcut'
  | 'registerGlobalShortcut'
  | 'resumeAllGlobalShortcuts'
  | 'suspendAllGlobalShortcuts'
  | 'unregisterAllGlobalShortcuts'
  | 'unregisterGlobalShortcut';
