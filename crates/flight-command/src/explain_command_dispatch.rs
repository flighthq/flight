//! The shakeable query that says WHICH kind a dispatch would fail to resolve (TS
//! `explainCommandDispatch.ts`).

use flight_entity::{Kind, Ref};

use crate::command_binding::get_command_binding;
use crate::types::*;

/// Why `execute_command` would refuse, as plain data (TS `explainCommandDispatch`). Descends into
/// composites, because a composite whose child kind is unregistered would otherwise dispatch into a
/// no-op that looks like a successful undo step.
pub fn explain_command_dispatch(
    history: &Ref<CommandHistory>,
    command: &CommandRef,
) -> CommandDispatchExplanation {
    let missing_kind = find_missing_command_kind(history, command);
    return CommandDispatchExplanation {
        resolved: missing_kind.is_none(),
        missing_kind,
    };
}

fn find_missing_command_kind(history: &Ref<CommandHistory>, command: &CommandRef) -> Option<Kind> {
    let kind = command.read().unwrap().command_fields().kind.clone();
    if get_command_binding(history, &kind).is_none() {
        return Some(kind);
    }
    let children = {
        let borrowed = command.read().unwrap();
        match borrowed.as_composite() {
            Some(composite) => composite.children.clone(),
            None => return None,
        }
    };
    for child in &children {
        let missing = find_missing_command_kind(history, child);
        if missing.is_some() {
            return missing;
        }
    }
    return None;
}
