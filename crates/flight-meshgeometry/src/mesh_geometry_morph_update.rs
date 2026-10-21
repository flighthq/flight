use crate::MeshGeometry;
use crate::MeshMorph;
use crate::blend_mesh_geometry_morph;
use crate::capture_mesh_morph_bind_pose;
use crate::get_mesh_geometry_morph_bind_pose;
use crate::set_mesh_geometry_morph_bind_pose;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::{
        CANONICAL_MESH_GEOMETRY_LAYOUT, MeshGeometryOptions, MeshMorphTarget, create_mesh_geometry,
    };

    #[test]
    fn meshgeometry_update_geometry_morph_matches_free_function_and_clean_cache_behavior() {
        let options = || MeshGeometryOptions {
            vertices: vec![0.0; 12].into_boxed_slice(),
            indices: None,
            layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
            subsets: None,
            topology: None,
        };
        let mut free = create_mesh_geometry(options());
        let mut method = create_mesh_geometry(options());
        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![4.0, 0.0, 0.0].into_boxed_slice(),
                normal_deltas: None,
                tangent_deltas: None,
            }],
            weights: vec![0.5].into_boxed_slice(),
        };
        update_mesh_geometry_morph(&mut free, &morph);
        method.update_geometry_morph(&morph);
        assert_eq!(method.vertices, free.vertices);
        assert_eq!(method.vertices[0], 2.0);
        assert_eq!(method.version, free.version);
        let version = method.version;
        update_mesh_geometry_morph(&mut free, &morph);
        method.update_geometry_morph(&morph);
        assert_eq!(method.version, version);
        assert_eq!(method.version, free.version);
    }
}

fn has_morph_weights_changed(geometry: &MeshGeometry, morph: &MeshMorph) -> bool {
    let blended = match &geometry.geometry_runtime.morph_blended_weights {
        Some(b) => b,
        None => {
            return true;
        }
    };

    let weights = &morph.weights;
    if blended.len() != weights.len() {
        return true;
    }
    for i in 0..weights.len() {
        if blended[i] != weights[i] {
            return true;
        }
    }
    return false;
}

fn record_morph_blended_weights(geometry: &mut MeshGeometry, morph: &MeshMorph) {
    let weights = &morph.weights;
    let blended = &mut geometry.geometry_runtime.morph_blended_weights;
    match blended {
        Some(b) if b.len() == weights.len() => {
            b.copy_from_slice(weights);
        }
        _ => {
            *blended = Some(weights.clone());
        }
    }
}

/// Blends a morphed mesh into its geometry for the current weights. Captures the bind
/// pose lazily on the first call. A mesh with no morph is a no-op. Steady-state morph
/// allocates nothing.
// flight-lint: allow(conform-extra) D8 owning geometry helper for the scene3d relocation of updateMeshMorph; preserves its source-private bind-pose and weight cache algorithm without exposing runtime internals
pub fn update_mesh_geometry_morph(geometry: &mut MeshGeometry, morph: &MeshMorph) {
    let has_bind_pose = get_mesh_geometry_morph_bind_pose(geometry).is_some();

    if !has_bind_pose {
        let bind_pose = capture_mesh_morph_bind_pose(geometry);
        set_mesh_geometry_morph_bind_pose(
            geometry,
            Some(std::sync::Arc::new(std::sync::RwLock::new(bind_pose))),
        );
    } else if !has_morph_weights_changed(geometry, morph) {
        return;
    }

    let bind_pose = get_mesh_geometry_morph_bind_pose(geometry).unwrap().clone();
    blend_mesh_geometry_morph(geometry, morph, &mut bind_pose.write().unwrap());
    record_morph_blended_weights(geometry, morph);
}

impl MeshGeometry {
    pub fn update_geometry_morph(&mut self, morph: &MeshMorph) {
        update_mesh_geometry_morph(self, morph);
    }
}
