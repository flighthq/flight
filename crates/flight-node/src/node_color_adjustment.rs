//! The node-level pointwise color-adjustment stack (TS `nodeColorAdjustment.ts`).

use std::sync::{Arc, RwLock};

use flight_adjustments::{
    COLOR_ADJUSTMENT_CHANNEL_MIXING, create_tint_adjustment,
    resolve_color_adjustments_color_matrix, resolve_color_adjustments_color_scale_bias,
};
use flight_entity::Ref;
use flight_materials::ColorScaleBias;

use crate::revision::invalidate_node_appearance;
use crate::types::*;

/// Appends one pointwise adjustment without replacing the stack (TS `addNodeColorAdjustment`).
pub fn add_node_color_adjustment(source: &NodeRef, adjustment: AdjustmentRef) {
    {
        let mut guard = source.write().unwrap();
        let runtime = guard.node_runtime_mut();
        // The source appends into a NEW array (`[...current, adjustment]`), so a stack handle the
        // caller passed to `set_node_color_adjustments` is never mutated behind its back.
        let mut next = match &runtime.color_adjustments {
            Some(current) => current.read().unwrap().clone(),
            None => Vec::new(),
        };
        next.push(adjustment);
        runtime.color_adjustments = Some(Arc::new(RwLock::new(next)));
        resolve_node_color_adjustments(runtime);
    }
    invalidate_node_appearance(source);
}

/// The complete authored adjustment stack, or `None` for the untinted default (TS
/// `getNodeColorAdjustments`).

// flight-lint: allow(contract-vocabulary) Principal 8d88d5a0: the stack is the caller's shared array handle (TS identity), returned as stored
pub fn get_node_color_adjustments(source: &dyn Node) -> Option<Ref<Vec<AdjustmentRef>>> {
    return source.node_runtime().color_adjustments.clone();
}

/// Replaces the complete stack; `None` clears it (TS `setNodeColorAdjustments`).

fn resolve_node_color_adjustments(runtime: &mut NodeRuntime) {
    // Copy the stack's handles out of its lock, so no lock is held while adjustments resolve.
    let adjustments = runtime
        .color_adjustments
        .as_ref()
        .map(|stack| stack.read().unwrap().clone());
    let Some(adjustments) = adjustments else {
        runtime.resolved_color_scale_bias = None;
        runtime.resolved_color_matrix = None;
        runtime.color_adjustments_unsupported = false;
        return;
    };
    if adjustments.is_empty() {
        runtime.resolved_color_scale_bias = None;
        runtime.resolved_color_matrix = None;
        runtime.color_adjustments_unsupported = false;
        return;
    }
    let mut scale_bias: ColorScaleBias = match runtime.resolved_color_scale_bias.take() {
        Some(existing) => existing,
        None => flight_materials::color_scale_bias::create_color_scale_bias(),
    };
    let status = resolve_color_adjustments_color_scale_bias(Some(&adjustments), &mut scale_bias);
    runtime.resolved_color_scale_bias = Some(scale_bias);
    let matrix = if status == COLOR_ADJUSTMENT_CHANNEL_MIXING {
        resolve_color_adjustments_color_matrix(Some(&adjustments))
    } else {
        None
    };
    runtime.resolved_color_matrix = matrix;
    runtime.color_adjustments_unsupported =
        status == COLOR_ADJUSTMENT_CHANNEL_MIXING && runtime.resolved_color_matrix.is_none();
}

// flight-lint: allow(contract-vocabulary) Principal 8d88d5a0: the node retains the caller's SAME stack handle (TS identity)
pub fn set_node_color_adjustments(source: &NodeRef, value: Option<Ref<Vec<AdjustmentRef>>>) {
    {
        let mut guard = source.write().unwrap();
        let runtime = guard.node_runtime_mut();
        runtime.color_adjustments = value;
        resolve_node_color_adjustments(runtime);
    }
    invalidate_node_appearance(source);
}

/// Replaces the stack with one packed-RGBA tint adjustment (TS `setNodeColorAdjustmentsTint`).

pub fn set_node_color_adjustments_tint(source: &NodeRef, tint: u32) {
    let typed: Ref<flight_adjustments::TintAdjustment> =
        Arc::new(RwLock::new(create_tint_adjustment(tint)));
    let adjustment: AdjustmentRef = typed;
    set_node_color_adjustments(source, Some(Arc::new(RwLock::new(vec![adjustment]))));
}
