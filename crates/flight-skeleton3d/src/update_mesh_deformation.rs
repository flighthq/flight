use crate::update_mesh_skin;
use crate::update_mesh_skin::mesh_ref;
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;
// flight-lint: allow(conform-params) D5 caller-owned canonical node transform revision source; D16 original NodeRef permits hierarchy-safe palette resolution after releasing the mesh borrow
pub fn update_mesh_deformation(mesh: &NodeRef, revisions: &mut NodeRevisionState) {
    {
        let node = mesh.read().unwrap();
        if let Some(mesh) = mesh_ref(&*node) {
            flight_scene3d::update_mesh_morph(mesh);
        }
    }
    update_mesh_skin(mesh, revisions);
}
