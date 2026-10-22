use flight_geometry::{copy_matrix, multiply_matrix};
use flight_node::{get_node_local_matrix, get_node_local_transform_revision};

use crate::{RenderProxy2D, RenderState, Scene3DGraphSyncPolicy};

fn recalculate_render_transform_2d<S: RenderState>(
    state: &S,
    data: &mut RenderProxy2D<S>,
    parent_data: Option<&RenderProxy2D<S>>,
) {
    let transform = get_node_local_matrix(&data.source);
    if let Some(parent) = parent_data {
        multiply_matrix(&mut data.transform_2d, &parent.transform_2d, &transform);
    } else {
        copy_matrix(&mut data.transform_2d, &transform);
    }
    data.transform_frame_id = state.render_runtime().current_frame_id as i64;
}

pub fn update_render_proxy_2d_transform<S: RenderState>(
    state: &S,
    data: &mut RenderProxy2D<S>,
    parent_data: Option<&RenderProxy2D<S>>,
) -> bool {
    let local_transform_id = {
        let source = data.source.read().unwrap();
        get_node_local_transform_revision(&*source)
    };
    let parent_dirty = parent_data.is_some_and(|parent| {
        parent.transform_frame_id == state.render_runtime().current_frame_id as i64
    });
    let local_dirty = state.render_state().scene_graph_sync_policy
        == Scene3DGraphSyncPolicy::RefreshDerivedState
        || data.last_local_transform_id != local_transform_id as i64;
    if parent_dirty || local_dirty {
        recalculate_render_transform_2d(state, data, parent_data);
        data.last_local_transform_id = local_transform_id as i64;
        return true;
    }
    return false;
}
// flight-lint: allow-file(contract-vocabulary) D12/D17 approved generic RenderState and backend-typed callback families are IR dispatch contracts
