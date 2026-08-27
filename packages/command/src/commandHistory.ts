import { emitSignal } from '@flighthq/signals/contract';
import type { Command, CommandHistory } from '@flighthq/types/contract';

import { createCommandBindingTable, getCommandBinding } from './commandBinding';

/** Whether there is an applied entry to reverse. */
export function canRedoCommand(history: Readonly<CommandHistory>): boolean {
  return history.index < history.entries.length;
}

/** Whether there is a reversed entry ahead of the cursor to re-apply. */
export function canUndoCommand(history: Readonly<CommandHistory>): boolean {
  return history.index > 0;
}

// Drops every entry and resets the cursor. Does NOT undo anything — clearing a history forgets how to
// reverse the work, it does not reverse it. Emits only if there was something to forget.
export function clearCommandHistory(history: CommandHistory): void {
  if (history.entries.length === 0 && history.index === 0) return;
  history.entries.length = 0;
  history.index = 0;
  history.transactionDepth = 0;
  history.transactionIndex = 0;
  history.transactionLabel = null;
  notifyCommandHistoryChanged(history);
}

/** An empty history with no bindings registered. `maxSize` of `0` (the default) is unbounded. */
export function createCommandHistory(maxSize = 0): CommandHistory {
  return {
    bindings: createCommandBindingTable(),
    entries: [],
    index: 0,
    maxSize,
    onChange: null,
    transactionDepth: 0,
    transactionIndex: 0,
    transactionLabel: null,
  };
}

// Applies `command` and pushes it. Returns false and changes nothing when the command's kind has no
// registered binding — an unregistered kind is an expected lookup failure, so it takes a sentinel rather
// than a throw, and refusing to push is what stops an entry undo would silently skip from reaching the
// stack.
//
// Redoable entries ahead of the cursor are discarded: a new action after an undo forks the timeline.
// Inside a transaction no merge is attempted, because the whole bracket is about to fold into one entry
// anyway and merging first would only change which label survives.
export function executeCommand(history: CommandHistory, command: Command): boolean {
  const binding = getCommandBinding(history, command.kind);
  if (binding === null) return false;

  binding.execute(command);
  if (history.index < history.entries.length) history.entries.length = history.index;

  const previous = history.index > 0 ? history.entries[history.index - 1] : null;
  const mergeable = history.transactionDepth === 0 && previous !== null && history.index > history.transactionIndex;
  if (mergeable && binding.merge !== undefined) {
    const merged = binding.merge(previous, command);
    if (merged !== null) {
      history.entries[history.index - 1] = merged;
      notifyCommandHistoryChanged(history);
      return true;
    }
  }

  history.entries.push(command);
  history.index++;
  trimCommandHistory(history);
  notifyCommandHistoryChanged(history);
  return true;
}

/** Every entry, oldest first, including the reversed ones ahead of the cursor. */
export function getCommandHistoryEntries(history: Readonly<CommandHistory>): readonly Command[] {
  return history.entries;
}

/** The count of applied entries — entries before it are applied, entries from it on are redoable. */
export function getCommandHistoryIndex(history: Readonly<CommandHistory>): number {
  return history.index;
}

/** The label of the entry redo would re-apply, or null. */
export function getCommandHistoryRedoLabel(history: Readonly<CommandHistory>): string | null {
  return canRedoCommand(history) ? history.entries[history.index].label : null;
}

/** The label of the entry undo would reverse, or null. */
export function getCommandHistoryUndoLabel(history: Readonly<CommandHistory>): string | null {
  return canUndoCommand(history) ? history.entries[history.index - 1].label : null;
}

// Emits the opt-in change signal if a caller allocated one. Internal rather than exported: emitting a
// change nobody made is how a history panel learns to distrust the signal.
export function notifyCommandHistoryChanged(history: Readonly<CommandHistory>): void {
  if (history.onChange !== null) emitSignal(history.onChange);
}

// Re-applies the next reversed entry. Uses the registered `execute`; there is no separate `redo` hook,
// because a command whose re-application differs from its first application is two commands wearing one
// name.
export function redoCommand(history: CommandHistory): boolean {
  if (!canRedoCommand(history)) return false;
  const command = history.entries[history.index];
  const binding = getCommandBinding(history, command.kind);
  if (binding === null) return false;
  binding.execute(command);
  history.index++;
  notifyCommandHistoryChanged(history);
  return true;
}

/** Reverses the most recently applied entry. */
export function undoCommand(history: CommandHistory): boolean {
  if (!canUndoCommand(history)) return false;
  const command = history.entries[history.index - 1];
  const binding = getCommandBinding(history, command.kind);
  if (binding === null) return false;
  binding.undo(command);
  history.index--;
  notifyCommandHistoryChanged(history);
  return true;
}

// Drops from the OLDEST end so the most recent history survives, and moves the cursor with it. A composite
// counts as one entry, which is the point of folding a transaction.
function trimCommandHistory(history: CommandHistory): void {
  if (history.maxSize <= 0 || history.entries.length <= history.maxSize) return;
  const excess = history.entries.length - history.maxSize;
  history.entries.splice(0, excess);
  history.index = Math.max(0, history.index - excess);
  history.transactionIndex = Math.max(0, history.transactionIndex - excess);
}
