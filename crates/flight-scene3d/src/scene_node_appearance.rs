// flight-lint: allow-file(conform-params) D5 explicit caller-owned appearance revision source replaces the TS module counter
use crate::scene_node::{as_node3d, as_node3d_mut};
use flight_node::{NodeRef, invalidate_node_appearance};

#[derive(Clone, Copy, Default, Debug)]
pub struct Scene3DAppearanceState {
    pub world_appearance_revision: u32,
}

pub fn ensure_node3d_world_alpha(source: &NodeRef, state: &mut Scene3DAppearanceState) {
    let parent = source
        .read()
        .unwrap()
        .node_runtime()
        .parent
        .as_ref()
        .and_then(|p| p.upgrade());
    let (alpha, parent_id) = if let Some(parent) = parent {
        ensure_node3d_world_alpha(&parent, state);
        let p = parent.read().unwrap();
        let r = &as_node3d(&*p)
            .expect("Node3D parent")
            .node3d_fields()
            .node3d_runtime()
            .appearance;
        (r.world_alpha.unwrap_or(1.0), r.world_appearance_id)
    } else {
        (1.0, 0)
    };
    let mut guard = source.write().unwrap();
    let source = as_node3d_mut(&mut *guard).expect("Node3D source");
    let id = source.node_runtime().appearance_id as i32;
    let own = source.node3d_fields().alpha;
    let runtime = &mut source.node3d_fields_mut().node3d_runtime_mut().appearance;
    if runtime.world_alpha.is_none()
        || runtime.world_alpha_using_appearance_id != id
        || runtime.world_alpha_using_parent_appearance_id != parent_id as i32
    {
        runtime.world_alpha = Some(alpha * own);
        runtime.world_alpha_using_appearance_id = id;
        runtime.world_alpha_using_parent_appearance_id = parent_id as i32;
        state.world_appearance_revision = state.world_appearance_revision.wrapping_add(1);
        if state.world_appearance_revision == 0 {
            state.world_appearance_revision = 1;
        }
        runtime.world_appearance_id = state.world_appearance_revision;
    }
}
pub fn get_node3d_world_alpha(source: &NodeRef, state: &mut Scene3DAppearanceState) -> f32 {
    ensure_node3d_world_alpha(source, state);
    return as_node3d(&*source.read().unwrap())
        .expect("Node3D source")
        .node3d_fields()
        .node3d_runtime()
        .appearance
        .world_alpha
        .unwrap_or(1.0);
}
pub fn set_node3d_alpha(source: &NodeRef, alpha: f32) {
    as_node3d_mut(&mut *source.write().unwrap())
        .expect("Node3D source")
        .node3d_fields_mut()
        .alpha = alpha;
    invalidate_node_appearance(source);
}
