use crate::Mesh;
use crate::MeshGeometry;
use crate::MeshMorph;
use crate::blend_mesh_geometry_morph;
use crate::capture_mesh_morph_bind_pose;
use crate::get_mesh_geometry_morph_bind_pose;
use crate::set_mesh_geometry_morph_bind_pose;

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
pub fn update_mesh_morph(mesh: &mut Mesh) {
    let morph = match &mesh.morph {
        Some(m) => m,
        None => {
            return;
        }
    };

    let has_bind_pose = get_mesh_geometry_morph_bind_pose(&mesh.geometry).is_some();

    if !has_bind_pose {
        let bind_pose = capture_mesh_morph_bind_pose(&mesh.geometry);
        set_mesh_geometry_morph_bind_pose(
            &mut mesh.geometry,
            Some(std::sync::Arc::new(std::sync::RwLock::new(bind_pose))),
        );
    } else if !has_morph_weights_changed(&mesh.geometry, morph) {
        return;
    }

    let bind_pose = get_mesh_geometry_morph_bind_pose(&mesh.geometry)
        .unwrap()
        .clone();
    blend_mesh_geometry_morph(&mut mesh.geometry, morph, &mut bind_pose.write().unwrap());
    record_morph_blended_weights(&mut mesh.geometry, morph);
}
