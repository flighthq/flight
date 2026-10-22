use flight_materials::PbrUvSet;
use flight_meshgeometry::{MeshGeometry, VertexSemantic};

pub struct MeshGeometryUvSetExplanation {
    pub available_uv_sets: Vec<PbrUvSet>,
    pub requested_uv_sets: Vec<PbrUvSet>,
    pub samples_at_origin: bool,
    pub unserved_uv_sets: Vec<PbrUvSet>,
}

pub fn explain_gl_mesh_geometry_uv_sets(
    geometry: &MeshGeometry,
    requested_uv_sets: &[PbrUvSet],
) -> MeshGeometryUvSetExplanation {
    let mut available_uv_sets: Vec<PbrUvSet> = Vec::new();
    let layout = geometry.layout.read().unwrap();
    for attribute in &layout.attributes {
        if attribute.semantic == VertexSemantic::Uv0 && !available_uv_sets.contains(&0) {
            available_uv_sets.push(0);
        }
        if attribute.semantic == VertexSemantic::Uv1 && !available_uv_sets.contains(&1) {
            available_uv_sets.push(1);
        }
    }

    let mut requested: Vec<PbrUvSet> = Vec::new();
    for &uv_set in requested_uv_sets {
        if !requested.contains(&uv_set) {
            requested.push(uv_set);
        }
    }
    requested.sort();

    let unserved_uv_sets: Vec<PbrUvSet> = requested
        .iter()
        .filter(|uv_set| !available_uv_sets.contains(uv_set))
        .copied()
        .collect();
    available_uv_sets.sort();

    return MeshGeometryUvSetExplanation {
        available_uv_sets,
        requested_uv_sets: requested,
        samples_at_origin: !unserved_uv_sets.is_empty(),
        unserved_uv_sets,
    };
}
