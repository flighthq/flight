import type { ShortcutEvent } from './ShortcutEvent';
import type { Signal } from './Signal';

// The opt-in global shortcut signal group, armed by enableGlobalShortcutSignals. onTrigger fires for
// every global shortcut activation, after the directly-registered handler has run.
export interface ShortcutSignals {
  onTrigger: Signal<(event: Readonly<ShortcutEvent>) => void>;
}
