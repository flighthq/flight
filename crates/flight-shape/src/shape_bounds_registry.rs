//! The caller-owned shape bounds command registry (TS `shapeBoundsRegistry.ts`, module state
//! replaced by explicit D5 state).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::Arc;

use crate::types::*;

/// Allocates an empty caller-owned bounds registry and guard state (Rust-only D5 constructor).
// flight-lint: allow(conform-extra) D5: caller-owned registry state replaces the TS module globals
pub fn create_shape_bounds_state() -> ShapeBoundsStateRef {
    return Arc::new(std::sync::RwLock::new(ShapeBoundsState::default()));
}

/// Clears every registered bounds contribution (TS `clearShapeBoundsCommands`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn clear_shape_bounds_commands(state: &ShapeBoundsStateRef) {
    let mut guard = state.write().unwrap();
    guard.commands.clear();
    guard.revision = guard.revision.wrapping_add(1);
}

/// The contribution registered for `key`, or `None` when nobody registered it (TS
/// `getShapeBoundsCommand`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn get_shape_bounds_command(
    state: &ShapeBoundsStateRef,
    key: &str,
) -> Option<ShapeBoundsCommand> {
    let guard = state.read().unwrap();
    return guard
        .commands
        .iter()
        .find(|(entry, _)| entry == key)
        .map(|(_, command)| command.clone());
}

/// The registry revision (TS `getShapeBoundsCommandRegistryRevision`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn get_shape_bounds_command_registry_revision(state: &ShapeBoundsStateRef) -> u32 {
    return state.read().unwrap().revision;
}

/// Registers a contribution; the same callbacks again are not a semantic change (TS
/// `registerShapeBoundsCommand`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn register_shape_bounds_command(state: &ShapeBoundsStateRef, command: ShapeBoundsCommand) {
    let mut guard = state.write().unwrap();
    let position = guard
        .commands
        .iter()
        .position(|(entry, _)| *entry == command.key);
    let previous = position.map(|index| guard.commands[index].1.clone());
    match position {
        Some(index) => guard.commands[index].1 = command.clone(),
        None => guard.commands.push((command.key.clone(), command.clone())),
    }
    if let Some(previous) = previous {
        if same_handler(previous.fill_bounds.as_ref(), command.fill_bounds.as_ref())
            && same_handler(
                previous.stroke_bounds.as_ref(),
                command.stroke_bounds.as_ref(),
            )
        {
            return;
        }
    }
    guard.revision = guard.revision.wrapping_add(1);
}

fn same_handler(
    left: Option<&ShapeBoundsCommandHandler>,
    right: Option<&ShapeBoundsCommandHandler>,
) -> bool {
    return match (left, right) {
        (None, None) => true,
        (Some(left), Some(right)) => Arc::ptr_eq(left, right),
        _ => false,
    };
}

/// Installs or clears the missing-command guard (TS `setShapeBoundsGuard`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn set_shape_bounds_guard(state: &ShapeBoundsStateRef, guard: Option<ShapeBoundsGuard>) {
    state.write().unwrap().guard = guard;
}

/// Removes a registered contribution (TS `unregisterShapeBoundsCommand`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn unregister_shape_bounds_command(state: &ShapeBoundsStateRef, key: &str) {
    let mut guard = state.write().unwrap();
    let position = guard.commands.iter().position(|(entry, _)| entry == key);
    let Some(position) = position else {
        return;
    };
    guard.commands.remove(position);
    guard.revision = guard.revision.wrapping_add(1);
}
