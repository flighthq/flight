import type { CommandHistory } from '@flighthq/types/contract';

import { createCompositeCommand } from './command';
import { getCommandBinding } from './commandBinding';
import { notifyCommandHistoryChanged } from './commandHistory';

// Transaction brackets, for operations whose full set of sub-commands is not known upfront — a gizmo drag
// that emits one command per frame, a paste that discovers what it is pasting as it goes.
//
// Commands execute normally inside the bracket; `end` folds everything pushed since `begin` into a single
// composite entry. This is why merging is suppressed inside a bracket: the fold is the coalescing.

// Unwinds and discards every command executed since the outermost `begin`. Undoes them in reverse, so a
// half-finished paste leaves the graph as it was found. Returns false when no transaction is open.
export function abortCommandTransaction(history: CommandHistory): boolean {
  if (history.transactionDepth === 0) return false;
  const start = history.transactionIndex;
  for (let i = history.entries.length - 1; i >= start; i--) {
    const command = history.entries[i];
    getCommandBinding(history, command.kind)?.undo(command);
  }
  history.entries.length = start;
  history.index = start;
  history.transactionDepth = 0;
  history.transactionLabel = null;
  notifyCommandHistoryChanged(history);
  return true;
}

// Opens a bracket. Nesting is counted rather than stacked: only the OUTERMOST bracket folds, so a helper
// that brackets its own work does not fragment a caller's larger transaction into pieces. The label of the
// outermost begin is the one the folded entry carries.
export function beginCommandTransaction(history: CommandHistory, label: string): void {
  if (history.transactionDepth === 0) {
    history.transactionIndex = history.index;
    history.transactionLabel = label;
  }
  history.transactionDepth++;
}

// Closes a bracket. On the outermost close, replaces everything pushed since `begin` with one composite
// entry carrying the transaction's label. A bracket that collected nothing leaves no entry at all — an
// empty undo step is worse than none, because it makes one undo press do nothing visible.
export function endCommandTransaction(history: CommandHistory): boolean {
  if (history.transactionDepth === 0) return false;
  history.transactionDepth--;
  if (history.transactionDepth > 0) return true;

  const start = history.transactionIndex;
  const collected = history.entries.slice(start);
  const label = history.transactionLabel ?? '';
  history.transactionLabel = null;
  if (collected.length === 0) return true;

  // A single collected command keeps its own identity rather than being wrapped: a composite of one is a
  // layer of indirection that a history panel would have to see through, and its label would replace a
  // more specific one with the bracket's generic name.
  history.entries.length = start;
  history.entries.push(collected.length === 1 ? collected[0] : createCompositeCommand(label, collected));
  history.index = start + 1;
  notifyCommandHistoryChanged(history);
  return true;
}

/** Whether a bracket is currently open. */
export function isCommandTransactionOpen(history: Readonly<CommandHistory>): boolean {
  return history.transactionDepth > 0;
}
