use crate::update_mesh_skin::{mesh_ref, update_mesh_skin_with_refresh};
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;
// flight-lint: allow(conform-params) D5 caller-owned canonical node transform revision source; D16 original NodeRef permits hierarchy-safe palette resolution after releasing the mesh borrow
pub fn update_mesh_deformation(mesh: &NodeRef, revisions: &mut NodeRevisionState) {
    // Principal2c370eca: fix the pinned TS composition defect. An unchanged morph
    // leaves last frame's CPU-skinned vertices in geometry, so they are not fresh skin input.
    let morph_wrote = {
        let node = mesh.read().unwrap();
        if let Some(mesh) = mesh_ref(&*node) {
            let before = mesh.geometry.read().unwrap().version;
            flight_scene3d::update_mesh_morph(mesh);
            let after = mesh.geometry.read().unwrap().version;
            before != after
        } else {
            false
        }
    };
    update_mesh_skin_with_refresh(mesh, revisions, morph_wrote);
}
