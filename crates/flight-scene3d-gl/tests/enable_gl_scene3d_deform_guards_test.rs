use std::sync::{Arc, RwLock};

use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, MeshGeometryOptions, MeshMorph, MeshMorphTarget,
    create_box_mesh_geometry, create_mesh_geometry,
};
use flight_node::NodeRef;
use flight_node::contract::NodeRevisionState;
use flight_scene3d::{
    Mesh, Node3DFields, Skin, create_node3d, prepare_scene3d_morph, publish_node3d,
};
use flight_scene3d_gl::contract::*;
use flight_skeleton3d::{Skeleton3DGuardState, create_skeleton3d, prepare_scene3d_skinning};

use crate::gl_test_helper::{
    log_messages, make_gl_scene3d_state, make_test_lights, make_test_log, make_test_look_at_camera,
    make_test_pass, make_test_scene,
};

fn add_child(scene: &NodeRef, mesh: flight_entity::Ref<Mesh>) {
    let node: NodeRef = mesh;
    flight_node::add_node_child(scene, &node);
}

// A box geometry carrying a morph; drawn with no material so the guard (top of the mesh loop) runs
// without exercising the material draw path.
fn morph_mesh() -> flight_entity::Ref<Mesh> {
    let mesh = flight_scene3d::create_mesh(
        Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
        Arc::new(RwLock::new(Vec::new())),
    );
    mesh.write().unwrap().morph = Some(Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(vec![MeshMorphTarget {
            position_deltas: vec![0.0; 72].into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }]),
        weights: vec![1.0].into_boxed_slice(),
    })));
    return mesh;
}

fn skinned_mesh() -> flight_entity::Ref<Mesh> {
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0; 20].into_boxed_slice(),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    });
    let mesh = flight_scene3d::create_mesh(
        Arc::new(RwLock::new(geometry)),
        Arc::new(RwLock::new(Vec::new())),
    );
    let joint: flight_scene3d::Node3DRef = publish_node3d(create_node3d::<Node3DFields>(None));
    let skeleton = create_skeleton3d(
        Arc::new(RwLock::new(vec![joint])),
        None,
        &mut NodeRevisionState {
            world_transform_revision: 0,
        },
        &Arc::new(RwLock::new(Skeleton3DGuardState {
            enabled: false,
            bind_pose_guard: None,
        })),
    );
    mesh.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
        skeleton: Arc::new(RwLock::new(skeleton)),
        skeleton_root: None,
    })));
    return mesh;
}

fn draw_with_guard(scene: &NodeRef) -> usize {
    let mut state = make_gl_scene3d_state();
    let (log, sink) = make_test_log();
    enable_gl_scene3d_deform_guards(&state, Some(log));
    let pass = make_test_pass(&state);
    render_gl_scene3d(
        &mut state,
        &pass,
        None,
        scene,
        &make_test_look_at_camera(),
        &make_test_lights(),
        None,
    );
    return log_messages(&sink).len();
}

mod are_gl_scene3d_deform_guards_enabled {
    use super::*;

    #[test]
    fn reports_false_until_guards_are_installed_then_true() {
        let state = make_gl_scene3d_state();
        assert!(!are_gl_scene3d_deform_guards_enabled(&state));
        enable_gl_scene3d_deform_guards(&state, None);
        assert!(are_gl_scene3d_deform_guards_enabled(&state));
    }
}

mod enable_gl_scene3d_deform_guards {
    use super::*;

    #[test]
    fn stays_silent_once_the_deform_passes_have_run() {
        let scene = make_test_scene();
        add_child(&scene, morph_mesh());
        add_child(&scene, skinned_mesh());
        // Ready both deformers, exactly as an app would before prepare_scene_3d_render.
        prepare_scene3d_morph(&scene);
        prepare_scene3d_skinning(
            &scene,
            &mut NodeRevisionState {
                world_transform_revision: 0,
            },
        );
        assert_eq!(draw_with_guard(&scene), 0);
    }

    #[test]
    fn warns_when_a_morphed_mesh_is_drawn_without_prepare_scene3d_morph() {
        let scene = make_test_scene();
        add_child(&scene, morph_mesh());
        assert_eq!(draw_with_guard(&scene), 1);
    }

    #[test]
    fn warns_when_a_gpu_skinned_mesh_is_drawn_without_prepare_scene3d_skinning() {
        let scene = make_test_scene();
        add_child(&scene, skinned_mesh());
        assert_eq!(draw_with_guard(&scene), 1);
    }
}
