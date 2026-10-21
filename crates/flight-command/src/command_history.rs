//! The undo/redo stack and its bindings (TS `commandHistory.ts`).
//!
//! `index` counts APPLIED entries: everything before it is applied, everything from it on is
//! redoable. Executing a new command discards the redo branch, which is the standard
//! fork-the-timeline behaviour. The package reads no clock and keeps no global state.

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::emit_signal;

use crate::command_binding::command_kind;
use crate::command_binding::{create_command_binding_table, get_command_binding};
use crate::types::*;

/// An empty history with no bindings registered; `max_size` of 0 is unbounded (TS
/// `createCommandHistory`).
pub fn create_command_history(max_size: Option<i32>) -> Ref<CommandHistory> {
    let mut out: CommandHistory = allocate_entity();
    initialize_command_history(&mut out, max_size);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_command_history` (TS `initializeCommandHistory`).
pub fn initialize_command_history(out: &mut CommandHistory, max_size: Option<i32>) {
    out.bindings = create_command_binding_table();
    out.entries = Vec::new();
    out.index = 0;
    out.max_size = max_size.unwrap_or(0);
    out.on_change = None;
    out.transaction_depth = 0;
    out.transaction_index = 0;
    out.transaction_label = None;
}

/// Whether there is a reversed entry ahead of the cursor to re-apply (TS `canRedoCommand`).
pub fn can_redo_command(history: &Ref<CommandHistory>) -> bool {
    let guard = history.read().unwrap();
    return guard.index < guard.entries.len();
}

/// Whether there is an applied entry to reverse (TS `canUndoCommand`).
pub fn can_undo_command(history: &Ref<CommandHistory>) -> bool {
    return history.read().unwrap().index > 0;
}

/// Drops every entry and resets the cursor without undoing anything (TS `clearCommandHistory`).
/// Emits only when there was something to forget.
pub fn clear_command_history(history: &Ref<CommandHistory>) {
    {
        let mut guard = history.write().unwrap();
        if guard.entries.is_empty() && guard.index == 0 {
            return;
        }
        guard.entries.clear();
        guard.index = 0;
        guard.transaction_depth = 0;
        guard.transaction_index = 0;
        guard.transaction_label = None;
    }
    notify_command_history_changed(history);
}

/// Applies `command` and pushes it, or returns false and changes nothing when no binding exists (TS
/// `executeCommand`).
pub fn execute_command(history: &Ref<CommandHistory>, command: &CommandRef) -> bool {
    let Some(binding) = get_command_binding(history, &command_kind(command)) else {
        return false;
    };
    {
        let borrowed = command.read().unwrap();
        (binding.execute)(&*borrowed);
    }

    let (previous, mergeable) = {
        let guard = history.read().unwrap();
        let previous = if guard.index > 0 {
            Some(guard.entries[guard.index - 1].clone())
        } else {
            None
        };
        let mergeable = guard.transaction_depth == 0
            && previous.is_some()
            && guard.index > guard.transaction_index;
        (previous, mergeable)
    };

    if mergeable && binding.merge.is_some() {
        let (previous_command, next_command) = (previous.unwrap(), command.clone());
        let merged = {
            let merge = binding.merge.as_ref().unwrap();
            let previous_borrow = previous_command.read().unwrap();
            let next_borrow = next_command.read().unwrap();
            merge(&*previous_borrow, &*next_borrow)
        };
        if let Some(merged) = merged {
            let mut guard = history.write().unwrap();
            let index = guard.index;
            if index < guard.entries.len() {
                guard.entries.truncate(index);
            }
            if index > 0 {
                guard.entries[index - 1] = merged;
            }
            drop(guard);
            notify_command_history_changed(history);
            return true;
        }
    }

    {
        let mut guard = history.write().unwrap();
        let index = guard.index;
        if index < guard.entries.len() {
            guard.entries.truncate(index);
        }
        guard.entries.push(command.clone());
        guard.index = index + 1;
        trim_command_history(&mut guard);
    }
    notify_command_history_changed(history);
    return true;
}

/// Every entry, oldest first, including the reversed ones ahead of the cursor (TS
/// `getCommandHistoryEntries`).
pub fn get_command_history_entries(history: &Ref<CommandHistory>) -> Vec<CommandRef> {
    return history.read().unwrap().entries.clone();
}

/// The count of applied entries (TS `getCommandHistoryIndex`).
pub fn get_command_history_index(history: &Ref<CommandHistory>) -> usize {
    return history.read().unwrap().index;
}

/// The label redo would re-apply, or `None` (TS `getCommandHistoryRedoLabel`).
pub fn get_command_history_redo_label(history: &Ref<CommandHistory>) -> Option<String> {
    let guard = history.read().unwrap();
    if guard.index >= guard.entries.len() {
        return None;
    }
    let label = guard.entries[guard.index]
        .read()
        .unwrap()
        .command_fields()
        .label
        .clone();
    return Some(label);
}

/// The label undo would reverse, or `None` (TS `getCommandHistoryUndoLabel`).
pub fn get_command_history_undo_label(history: &Ref<CommandHistory>) -> Option<String> {
    let guard = history.read().unwrap();
    if guard.index == 0 {
        return None;
    }
    let label = guard.entries[guard.index - 1]
        .read()
        .unwrap()
        .command_fields()
        .label
        .clone();
    return Some(label);
}

/// Emits the opt-in change signal if a caller allocated one (TS `notifyCommandHistoryChanged`).
pub fn notify_command_history_changed(history: &Ref<CommandHistory>) {
    let signal = {
        let guard = history.read().unwrap();
        guard.on_change.clone()
    };
    if let Some(signal) = signal {
        emit_signal(&signal, &());
    }
}

/// Re-applies the next reversed entry through its registered `execute` (TS `redoCommand`).
pub fn redo_command(history: &Ref<CommandHistory>) -> bool {
    let command = {
        let guard = history.read().unwrap();
        if guard.index >= guard.entries.len() {
            return false;
        }
        guard.entries[guard.index].clone()
    };
    let Some(binding) = get_command_binding(history, &command_kind(&command)) else {
        return false;
    };
    {
        let borrowed = command.read().unwrap();
        (binding.execute)(&*borrowed);
    }
    {
        let mut guard = history.write().unwrap();
        guard.index += 1;
    }
    notify_command_history_changed(history);
    return true;
}

/// Drops from the OLDEST end so the most recent history survives, moving the cursor with it. A
/// composite counts as one entry, which is the point of folding a transaction.
fn trim_command_history(history: &mut CommandHistory) {
    let max_size = history.max_size;
    if max_size <= 0 || history.entries.len() <= max_size as usize {
        return;
    }
    let excess = history.entries.len() - max_size as usize;
    history.entries.drain(0..excess);
    history.index = history.index.saturating_sub(excess);
    history.transaction_index = history.transaction_index.saturating_sub(excess);
}

/// Reverses the most recently applied entry (TS `undoCommand`).
pub fn undo_command(history: &Ref<CommandHistory>) -> bool {
    let command = {
        let guard = history.read().unwrap();
        if guard.index == 0 {
            return false;
        }
        guard.entries[guard.index - 1].clone()
    };
    let Some(binding) = get_command_binding(history, &command_kind(&command)) else {
        return false;
    };
    {
        let borrowed = command.read().unwrap();
        (binding.undo)(&*borrowed);
    }
    {
        let mut guard = history.write().unwrap();
        guard.index -= 1;
    }
    notify_command_history_changed(history);
    return true;
}
