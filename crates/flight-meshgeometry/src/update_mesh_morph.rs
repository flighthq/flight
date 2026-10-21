use crate::{Mesh, update_mesh_geometry_morph};

pub fn update_mesh_morph(mesh: &mut Mesh) {
    if let Some(morph) = &mesh.morph {
        update_mesh_geometry_morph(&mut mesh.geometry, morph);
    }
}
