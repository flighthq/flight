use flight_materials::PbrUvSet;
use flight_meshgeometry::{MeshGeometry, VertexSemantic};

use crate::types::MeshGeometryUvSetExplanation;

// Explains whether a geometry's vertex layout can serve the UV sets a material's maps ask for. Pure;
// retains and mutates nothing.
//
// UV1 is a vertex-layout fact, not a shader feature: the PBR vertex stage declares `a_uv1` at a fixed
// lane and the upload binds it whenever the layout carries `uv1`. A material whose map names UV set 1
// over a geometry with no `uv1` draws successfully with the attribute unbound, and GL reads an unbound
// float attribute as zero, so every texel of that map samples the map's origin texel. Nothing throws;
// the picture is just flat. So the diagnosis lives here rather than in a guard on the draw path.
pub fn explain_gl_mesh_geometry_uv_sets(
    geometry: &MeshGeometry,
    requested_uv_sets: &[PbrUvSet],
) -> MeshGeometryUvSetExplanation {
    let mut available_uv_sets: Vec<PbrUvSet> = Vec::new();
    for attribute in &geometry.layout.read().unwrap().attributes {
        if attribute.semantic == VertexSemantic::Uv0 && !available_uv_sets.contains(&0) {
            available_uv_sets.push(0);
        }
        if attribute.semantic == VertexSemantic::Uv1 && !available_uv_sets.contains(&1) {
            available_uv_sets.push(1);
        }
    }

    let mut requested: Vec<PbrUvSet> = Vec::new();
    for uv_set in requested_uv_sets {
        if !requested.contains(uv_set) {
            requested.push(*uv_set);
        }
    }
    requested.sort();

    let unserved_uv_sets: Vec<PbrUvSet> = requested
        .iter()
        .copied()
        .filter(|uv_set| !available_uv_sets.contains(uv_set))
        .collect();
    available_uv_sets.sort();
    return MeshGeometryUvSetExplanation {
        available_uv_sets,
        requested_uv_sets: requested,
        samples_at_origin: !unserved_uv_sets.is_empty(),
        unserved_uv_sets,
    };
}
