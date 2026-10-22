use std::sync::Arc;

use flight_entity::Kind;
use flight_node::{NodeRef, RendererDataRef};

use crate::{NodeRenderer, RenderState};

pub fn copy_all_renderers_from_render_state<S: RenderState>(target: &mut S, source: &S) {
    copy_renderers_from_render_state(target, source);
    if let Some(hooks) = source.render_registries().clip_hooks {
        target.render_registries_mut().clip_hooks = Some(hooks);
    }
}

pub fn copy_render_state_registrations<S: RenderState>(target: &mut S, source: &S) {
    let source_registries = source.render_registries();
    let canvas_shape_commands = source_registries.canvas_shape_commands.clone();
    let color_adjustments = source_registries.color_adjustments;
    let color_adjustment_unsupported_guard = source_registries.color_adjustment_unsupported_guard;
    let effect_padding_resolvers = source_registries.effect_padding_resolvers.clone();
    let render_root_guard = source_registries.render_root_guard;
    let stroke_tessellator = source_registries.stroke_tessellator;
    let target_registries = target.render_registries_mut();
    target_registries.canvas_shape_commands = canvas_shape_commands;
    target_registries.color_adjustments = color_adjustments;
    target_registries.color_adjustment_unsupported_guard = color_adjustment_unsupported_guard;
    target_registries.effect_padding_resolvers = effect_padding_resolvers;
    target_registries.render_root_guard = render_root_guard;
    target_registries.stroke_tessellator = stroke_tessellator;
}

pub fn copy_renderers_from_render_state<S: RenderState>(target: &mut S, source: &S) {
    let source_table = source.render_registries().node_renderers.clone();
    if target.render_registries().node_renderers.entries.is_empty() {
        if source_table.entries.is_empty() {
            return;
        }
        let count = source_table.entries.len() as u32;
        target.render_registries_mut().node_renderers = source_table;
        target.render_runtime_mut().renderer_map_id =
            target.render_runtime().renderer_map_id.wrapping_add(count);
        return;
    }

    for kind in &source_table.key_order {
        let Some(renderer) = source_table.entries.get(kind) else {
            continue;
        };
        register_node_renderer(target, kind.clone(), *renderer);
    }
}

pub fn noop_renderer_data<S: RenderState>(
    _state: &mut S,
    _source: &NodeRef,
) -> Option<RendererDataRef> {
    return None;
}

pub fn register_node_renderer<S: RenderState>(
    state: &mut S,
    kind: Kind,
    renderer: &'static NodeRenderer<S>,
) {
    if state
        .render_registries()
        .node_renderers
        .entries
        .get(&kind)
        .is_some_and(|current| std::ptr::eq(*current, renderer))
    {
        return;
    }
    let table = Arc::make_mut(&mut state.render_registries_mut().node_renderers);
    if !table.entries.contains_key(&kind) {
        table.key_order.push(kind.clone());
    }
    table.entries.insert(kind, renderer);
    state.render_runtime_mut().renderer_map_id =
        state.render_runtime().renderer_map_id.wrapping_add(1);
}

pub fn register_node_renderers<S: RenderState>(
    state: &mut S,
    entries: &[(Kind, &'static NodeRenderer<S>)],
) {
    for (kind, renderer) in entries {
        register_node_renderer(state, kind.clone(), *renderer);
    }
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
