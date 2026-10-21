use crate::update_mesh_skin;
use crate::update_mesh_skin::mesh_inputs;
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;
// flight-lint: allow(conform-params) D5 caller-owned canonical node transform revision source; D16 original NodeRef permits hierarchy-safe palette resolution after releasing the mesh borrow
pub fn update_mesh_deformation(mesh: &NodeRef, revisions: &mut NodeRevisionState) {
    if let Some(input) = mesh_inputs(mesh) {
        if let Some(morph) = input.morph {
            flight_meshgeometry::update_mesh_geometry_morph(
                &mut input.geometry.write().unwrap(),
                &morph.read().unwrap(),
            );
        }
    }
    update_mesh_skin(mesh, revisions);
}
