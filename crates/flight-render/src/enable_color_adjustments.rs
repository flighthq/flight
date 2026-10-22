use flight_adjustments::multiply_color_matrix;
use flight_materials::ColorScaleBias;
use flight_materials::color_scale_bias::{concat_color_scale_bias, create_color_scale_bias};

use crate::{RenderProxy, RenderState};

pub fn are_color_adjustments_enabled<S: RenderState>(state: &S) -> bool {
    return state.render_registries().color_adjustments.is_some();
}

fn color_scale_bias_matrix(value: &ColorScaleBias) -> [f32; 20] {
    return [
        value.red_scale,
        0.0,
        0.0,
        0.0,
        value.red_bias,
        0.0,
        value.green_scale,
        0.0,
        0.0,
        value.green_bias,
        0.0,
        0.0,
        value.blue_scale,
        0.0,
        value.blue_bias,
        0.0,
        0.0,
        0.0,
        value.alpha_scale,
        value.alpha_bias,
    ];
}

pub fn enable_color_adjustments<S: RenderState>(state: &mut S) {
    let expected: crate::ColorAdjustmentResolver<S> = update_render_proxy_color_scale_bias::<S>;
    if state
        .render_registries()
        .color_adjustments
        .is_some_and(|current| std::ptr::fn_addr_eq(current, expected))
    {
        return;
    }
    state.render_registries_mut().color_adjustments = Some(expected);
}

fn resolve_inherited_color_matrix(
    parent_matrix: Option<&[f32; 20]>,
    parent_scale_bias: Option<&ColorScaleBias>,
    local_matrix: Option<&[f32; 20]>,
    local_scale_bias: Option<&ColorScaleBias>,
) -> [f32; 20] {
    if parent_matrix.is_none() && parent_scale_bias.is_none() {
        return *local_matrix.unwrap();
    }
    if local_matrix.is_none() && local_scale_bias.is_none() {
        return *parent_matrix.unwrap();
    }
    let parent_storage;
    let parent = match parent_matrix {
        Some(value) => value,
        None => {
            parent_storage = color_scale_bias_matrix(parent_scale_bias.unwrap());
            &parent_storage
        }
    };
    let local_storage;
    let local = match local_matrix {
        Some(value) => value,
        None => {
            local_storage = color_scale_bias_matrix(local_scale_bias.unwrap());
            &local_storage
        }
    };
    let mut out = [0.0; 20];
    multiply_color_matrix(&mut out, parent, local);
    return out;
}

fn resolve_inherited_color_scale_bias(
    parent: Option<&ColorScaleBias>,
    local: Option<&ColorScaleBias>,
) -> Option<ColorScaleBias> {
    match (parent, local) {
        (None, None) => None,
        (Some(parent), None) => Some(parent.clone()),
        (None, Some(local)) => Some(local.clone()),
        (Some(parent), Some(local)) => {
            let mut out = create_color_scale_bias();
            concat_color_scale_bias(&mut out, parent, local);
            Some(out)
        }
    }
}

fn update_render_proxy_color_scale_bias<S: RenderState>(
    state: &mut S,
    data: &mut RenderProxy<S>,
    parent_data: Option<&RenderProxy<S>>,
) {
    let (local_scale_bias, local_matrix, unsupported) = {
        let source = data.source.read().unwrap();
        let runtime = source.node_runtime();
        (
            runtime.resolved_color_scale_bias.clone(),
            runtime.resolved_color_matrix,
            runtime.color_adjustments_unsupported,
        )
    };
    let parent_scale_bias = parent_data.and_then(|parent| parent.color_scale_bias.as_ref());
    let parent_matrix = parent_data.and_then(|parent| parent.color_matrix.as_ref());

    if local_matrix.is_some() || parent_matrix.is_some() {
        data.color_matrix = Some(resolve_inherited_color_matrix(
            parent_matrix,
            parent_scale_bias,
            local_matrix.as_ref(),
            local_scale_bias.as_ref(),
        ));
        data.color_scale_bias = None;
    } else {
        data.color_matrix = None;
        data.color_scale_bias =
            resolve_inherited_color_scale_bias(parent_scale_bias, local_scale_bias.as_ref());
    }
    if unsupported && let Some(guard) = state.render_registries().color_adjustment_unsupported_guard
    {
        let source = data.source.clone();
        guard(state, &source);
    }
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
