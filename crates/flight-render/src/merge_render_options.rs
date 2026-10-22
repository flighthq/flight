use flight_registry::concat_kind_map;

use crate::{RenderState, RenderStateOptions};

pub fn merge_render_options<S: RenderState>(
    options: &[&RenderStateOptions<S>],
) -> RenderStateOptions<S> {
    let mut merged = RenderStateOptions::default();
    for fragment in options {
        if let Some(value) = &fragment.canvas_shape_commands {
            merged.canvas_shape_commands = Some(match &merged.canvas_shape_commands {
                Some(previous) => concat_kind_map(previous, value),
                None => value.clone(),
            });
        }
        if fragment.clip_hooks.is_some() {
            merged.clip_hooks = fragment.clip_hooks;
        }
        if fragment.color_adjustments.is_some() {
            merged.color_adjustments = fragment.color_adjustments;
        }
        if fragment.color_adjustment_unsupported_guard.is_some() {
            merged.color_adjustment_unsupported_guard = fragment.color_adjustment_unsupported_guard;
        }
        if let Some(value) = &fragment.effect_padding_resolvers {
            merged.effect_padding_resolvers = Some(match &merged.effect_padding_resolvers {
                Some(previous) => concat_kind_map(previous, value),
                None => value.clone(),
            });
        }
        if let Some(value) = &fragment.node_renderers {
            merged.node_renderers = Some(match &merged.node_renderers {
                Some(previous) => concat_kind_map(previous, value),
                None => value.clone(),
            });
        }
        if fragment.render_root_guard.is_some() {
            merged.render_root_guard = fragment.render_root_guard;
        }
        if fragment.stroke_tessellator.is_some() {
            merged.stroke_tessellator = fragment.stroke_tessellator;
        }
    }
    return merged;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
