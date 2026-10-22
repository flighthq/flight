use flight_node::get_node_appearance_revision;

use crate::{RenderProxy, RenderState};

fn recalculate_appearance<S: RenderState>(
    state: &S,
    data: &mut RenderProxy<S>,
    parent_data: Option<&RenderProxy<S>>,
) {
    let (visible, alpha, blend_mode) = {
        let source = data.source.read().unwrap();
        let appearance = source.as_appearance_node();
        let visible = appearance
            .as_ref()
            .map(|value| *value.appearance().visible)
            .unwrap_or(true);
        let alpha = appearance
            .as_ref()
            .map(|value| *value.appearance().alpha)
            .unwrap_or(1.0);
        let blend_mode = flight_scene2d::as_node2d_ref(&data.source)
            .map(|value| value.read().unwrap().node2d_fields().blend_mode.clone())
            .unwrap_or(None);
        (visible, alpha, blend_mode)
    };

    if let Some(parent) = parent_data {
        data.visible = visible && parent.visible;
        if !data.visible {
            return;
        }
        data.alpha = alpha * parent.alpha;
        if data.alpha <= 0.0 {
            return;
        }
        data.blend_mode = blend_mode;
    } else {
        data.visible = visible;
        if !data.visible {
            return;
        }
        data.alpha = alpha * state.render_state().render_alpha;
        if data.alpha <= 0.0 {
            return;
        }
        data.blend_mode = state
            .render_state()
            .render_blend_mode
            .clone()
            .or(blend_mode);
    }
    data.appearance_frame_id = state.render_runtime().current_frame_id as i64;
}

pub fn update_render_proxy_appearance<S: RenderState>(
    state: &S,
    data: &mut RenderProxy<S>,
    parent_data: Option<&RenderProxy<S>>,
) -> bool {
    let appearance_id = {
        let source = data.source.read().unwrap();
        get_node_appearance_revision(&*source)
    };
    let parent_dirty = parent_data.is_some_and(|parent| {
        parent.appearance_frame_id == state.render_runtime().current_frame_id as i64
    });
    if parent_dirty || data.last_appearance_id != appearance_id as i64 {
        recalculate_appearance(state, data, parent_data);
        data.last_appearance_id = appearance_id as i64;
        return true;
    }
    return false;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
