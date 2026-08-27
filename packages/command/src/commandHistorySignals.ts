import { createSignal } from '@flighthq/signals/contract';
import type { CommandHistory, Signal } from '@flighthq/types/contract';

// Opts the history into its onChange signal, allocating it on first call and returning it (idempotent — a
// second call returns the same signal). onChange emits after any execute, undo, redo, clear, or transaction
// fold that changed state, which is what a history panel and undo/redo toolbar buttons listen to. A history
// that never calls this keeps onChange null and pays no signal allocation or dispatch cost.
export function enableCommandHistorySignals(history: CommandHistory): Signal<() => void> {
  if (history.onChange === null) history.onChange = createSignal<() => void>();
  return history.onChange;
}

/** The change signal if one was enabled, else null. Never allocates. */
export function getCommandHistorySignals(history: Readonly<CommandHistory>): Signal<() => void> | null {
  return history.onChange;
}
