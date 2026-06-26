//! Appearance update step for the render walk.
//!
//! Propagates `alpha`, `visible`, and `blend_mode` from the source node into
//! the `RenderProxy`, multiplying alpha down the hierarchy.

use flighthq_types::{BlendMode, RenderProxy, RenderState};

use crate::render_state::{RenderStateId, RenderStateStore, get_render_state_runtime};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Updates the appearance fields (`alpha`, `visible`, `blend_mode`) on `data`
/// by composing them with the parent's resolved values.
///
/// Returns `true` if the appearance was recalculated, `false` if the cached
/// values were still current.
pub fn update_render_proxy_appearance(
    store: &RenderStateStore,
    id: RenderStateId,
    state: &RenderState,
    data: &mut RenderProxy,
    parent_data: Option<&RenderProxy>,
    source_alpha: f32,
    source_visible: bool,
    source_blend_mode: Option<BlendMode>,
    source_appearance_id: u32,
) -> bool {
    let appearance_id = source_appearance_id as u64;
    let current_frame_id = get_render_state_runtime(store, id).current_frame_id;
    let parent_dirty = parent_data
        .map(|p| p.appearance_frame_id == current_frame_id)
        .unwrap_or(false);
    if parent_dirty || data.last_appearance_id != appearance_id {
        recalculate_appearance(
            state,
            data,
            parent_data,
            source_alpha,
            source_visible,
            source_blend_mode,
            current_frame_id,
        );
        data.last_appearance_id = appearance_id;
        return true;
    }
    false
}

#[allow(clippy::too_many_arguments)]
fn recalculate_appearance(
    state: &RenderState,
    data: &mut RenderProxy,
    parent_data: Option<&RenderProxy>,
    source_alpha: f32,
    source_visible: bool,
    source_blend_mode: Option<BlendMode>,
    current_frame_id: u64,
) {
    if let Some(parent) = parent_data {
        data.visible = source_visible && parent.visible;
        if !data.visible {
            return;
        }
        data.alpha = source_alpha * parent.alpha;
        if data.alpha <= 0.0 {
            return;
        }
        data.blend_mode = source_blend_mode;
    } else {
        data.visible = source_visible;
        if !data.visible {
            return;
        }
        data.alpha = source_alpha * state.render_alpha;
        if data.alpha <= 0.0 {
            return;
        }
        data.blend_mode = match state.render_blend_mode {
            Some(mode) => Some(mode),
            None => source_blend_mode,
        };
    }
    data.appearance_frame_id = current_frame_id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render_state::{RenderStateStore, create_render_state};

    // update_render_proxy_appearance

    #[test]
    fn update_render_proxy_appearance_sets_visible_from_source() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let mut proxy = RenderProxy::default();
        // A freshly created proxy starts with the sentinel appearance id, so the first update is
        // always dirty and recalculates (create_render_proxy sets u64::MAX, not the Default 0).
        proxy.last_appearance_id = u64::MAX;
        update_render_proxy_appearance(&store, id, &state, &mut proxy, None, 1.0, true, None, 0);
        assert!(proxy.visible);
    }

    #[test]
    fn update_render_proxy_appearance_multiplies_alpha_with_parent() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let mut parent = RenderProxy::default();
        parent.alpha = 0.5;
        parent.visible = true;
        let mut proxy = RenderProxy::default();
        update_render_proxy_appearance(
            &store,
            id,
            &state,
            &mut proxy,
            Some(&parent),
            0.5,
            true,
            None,
            0,
        );
        // 0.5 (source) * 0.5 (parent) = 0.25
        assert!((proxy.alpha - 0.25).abs() < 1e-6);
    }

    #[test]
    fn update_render_proxy_appearance_hidden_parent_hides_child() {
        let mut store = RenderStateStore::new();
        let id = create_render_state(&mut store, None);
        let state = RenderState::default();
        let mut parent = RenderProxy::default();
        parent.visible = false;
        let mut proxy = RenderProxy::default();
        update_render_proxy_appearance(
            &store,
            id,
            &state,
            &mut proxy,
            Some(&parent),
            1.0,
            true,
            None,
            0,
        );
        assert!(!proxy.visible);
    }
}
