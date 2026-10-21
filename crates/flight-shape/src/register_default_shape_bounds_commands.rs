//! Installs the standard shape geometry into a caller-owned bounds registry (TS
//! `registerDefaultShapeBoundsCommands.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use crate::shape_bounds::default_shape_bounds_commands;
use crate::shape_bounds_registry::register_shape_bounds_command;
use crate::types::*;

/// Registers every default bounds contribution; explicit so importing the crate has no side effect
/// (TS `registerDefaultShapeBoundsCommands`).
// flight-lint: allow(conform-params) D5: the caller-owned registry is an explicit parameter
pub fn register_default_shape_bounds_commands(state: &ShapeBoundsStateRef) {
    for command in default_shape_bounds_commands() {
        register_shape_bounds_command(state, command);
    }
}
