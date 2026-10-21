use crate::Mesh;
use flight_meshgeometry::update_mesh_geometry_morph;

pub fn update_mesh_morph(mesh: &Mesh) {
    if let Some(morph) = &mesh.morph {
        update_mesh_geometry_morph(&mut mesh.geometry.write().unwrap(), &morph.read().unwrap());
    }
}
