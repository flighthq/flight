//! Transaction brackets for operations whose sub-commands are not known upfront (TS
//! `commandTransaction.ts`).
//!
//! Commands execute normally inside the bracket; the outermost `end` folds everything pushed since
//! `begin` into one composite entry. Merging is suppressed inside a bracket because the fold is the
//! coalescing.

use flight_entity::Ref;

use crate::command::create_composite_command;
use crate::command_binding::command_kind;
use crate::command_binding::get_command_binding;
use crate::command_history::notify_command_history_changed;
use crate::types::*;

/// Unwinds and discards every command executed since the outermost `begin`, in reverse (TS
/// `abortCommandTransaction`). Returns false when no transaction is open.
pub fn abort_command_transaction(history: &Ref<CommandHistory>) -> bool {
    let start = {
        let guard = history.read().unwrap();
        if guard.transaction_depth == 0 {
            return false;
        }
        guard.transaction_index
    };
    let commands = {
        let guard = history.read().unwrap();
        guard.entries[start..].to_vec()
    };
    for command in commands.iter().rev() {
        let Some(binding) = get_command_binding(history, &command_kind(command)) else {
            continue;
        };
        let borrowed = command.read().unwrap();
        (binding.undo)(&*borrowed);
    }
    {
        let mut guard = history.write().unwrap();
        guard.entries.truncate(start);
        guard.index = start;
        guard.transaction_depth = 0;
        guard.transaction_label = None;
    }
    notify_command_history_changed(history);
    return true;
}

/// Opens a bracket. Nesting is counted rather than stacked: only the OUTERMOST bracket folds, and its
/// label is the one the folded entry carries (TS `beginCommandTransaction`).
pub fn begin_command_transaction(history: &Ref<CommandHistory>, label: &str) {
    let mut guard = history.write().unwrap();
    if guard.transaction_depth == 0 {
        guard.transaction_index = guard.index;
        guard.transaction_label = Some(String::from(label));
    }
    guard.transaction_depth += 1;
}

/// Closes a bracket. On the outermost close, replaces everything pushed since `begin` with one
/// composite entry carrying the transaction's label; a single collected command keeps its own
/// identity, and an empty bracket records nothing (TS `endCommandTransaction`).
pub fn end_command_transaction(history: &Ref<CommandHistory>) -> bool {
    let start = {
        let mut guard = history.write().unwrap();
        if guard.transaction_depth == 0 {
            return false;
        }
        guard.transaction_depth -= 1;
        if guard.transaction_depth > 0 {
            return true;
        }
        guard.transaction_index
    };

    let (collected, label) = {
        let mut guard = history.write().unwrap();
        let collected = guard.entries[start..].to_vec();
        let label = guard.transaction_label.take().unwrap_or_default();
        (collected, label)
    };
    if collected.is_empty() {
        return true;
    }
    let entry = if collected.len() == 1 {
        collected[0].clone()
    } else {
        let composite = create_composite_command(&label, &collected);
        let erased: CommandRef = composite;
        erased
    };
    {
        let mut guard = history.write().unwrap();
        guard.entries.truncate(start);
        guard.entries.push(entry);
        guard.index = start + 1;
    }
    notify_command_history_changed(history);
    return true;
}

/// Whether a bracket is currently open (TS `isCommandTransactionOpen`).
pub fn is_command_transaction_open(history: &Ref<CommandHistory>) -> bool {
    return history.read().unwrap().transaction_depth > 0;
}
