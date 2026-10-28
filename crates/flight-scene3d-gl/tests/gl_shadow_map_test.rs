use std::sync::{Arc, RwLock};

use flight_camera::{
    Camera3D, Projection, create_camera_3d, create_orthographic_projection,
    create_perspective_projection, get_orthographic_projection_texel_size,
    set_camera_3d_view_matrix4_from_look_at,
};
use flight_geometry::{Matrix4, create_matrix4, create_vector3};
use flight_lighting::{
    DIRECTIONAL_SHADOW_MAP_SIZE, DirectionalLight, DirectionalLightOptions,
    create_directional_light,
};
use flight_meshgeometry::{
    MeshGeometryOptions, MeshMorph, MeshMorphTarget, VertexAttribute, VertexAttributeLayout,
    VertexFormat, VertexSemantic, create_box_mesh_geometry, create_mesh_geometry,
};
use flight_node::NodeRef;
use flight_render_gl::GlRenderState;
use flight_scene3d::{
    Skin, create_instanced_mesh, set_instanced_mesh_instance_count,
    set_instanced_mesh_instance_matrix, update_mesh_morph,
};
use flight_scene3d_gl::contract::*;
use flight_skeleton3d::{Skeleton3DGuardState, create_skeleton3d};

use crate::gl_test_helper::{
    add_test_mesh, bytes_as_f32, calls_with, count_calls, make_gl_scene3d_state, make_test_scene,
    test_default, thrown_message,
};

fn position_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![VertexAttribute {
            byte_offset: 0,
            format: VertexFormat::Float32x3,
            semantic: VertexSemantic::Position,
        }],
        stride: 12,
    };
}

// A layout carrying joints0 (what has_mesh_geometry_skin keys off) so a mesh with a skin GPU-skins.
fn skinned_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute {
                byte_offset: 0,
                format: VertexFormat::Float32x3,
                semantic: VertexSemantic::Position,
            },
            VertexAttribute {
                byte_offset: 12,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Joints0,
            },
            VertexAttribute {
                byte_offset: 28,
                format: VertexFormat::Float32x4,
                semantic: VertexSemantic::Weights0,
            },
        ],
        stride: 44,
    };
}

fn light(options: DirectionalLightOptions) -> DirectionalLight {
    return create_directional_light(Some(&options));
}

fn shadow_light() -> DirectionalLight {
    return light(DirectionalLightOptions {
        casts_shadow: Some(true),
        ..test_default()
    });
}

fn disabled_light() -> DirectionalLight {
    return light(DirectionalLightOptions {
        casts_shadow: Some(false),
        ..test_default()
    });
}

fn last_uploaded_vertices() -> Vec<f32> {
    let upload = calls_with("buffer_data")
        .into_iter()
        .filter(|call| call.integers[0] == i64::from(glow::ARRAY_BUFFER) && !call.bytes.is_empty())
        .last()
        .expect("a vertex upload");
    return bytes_as_f32(&upload.bytes);
}

fn shadow_translation(x: f32) -> Matrix4 {
    let mut matrix = create_matrix4();
    matrix.m[12] = x;
    return matrix;
}

fn orthographic_camera(half: f32) -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_orthographic_projection();
    {
        let mut orthographic = projection.write().unwrap();
        orthographic.half_height = half;
        orthographic.half_width = half;
    }
    camera.projection = Projection::Orthographic(projection);
    return camera;
}

fn make_shadow_camera() -> Camera3D {
    let mut camera = orthographic_camera(10.0);
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(0.0, 10.0, 10.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return camera;
}

fn shadow_target_framebuffer(state: &GlRenderState) -> Option<glow::NativeFramebuffer> {
    return get_gl_scene3d_runtime(state)
        .shadow_target
        .as_ref()
        .map(|target| target.framebuffer);
}

fn add_node(scene: &NodeRef, node: NodeRef) {
    flight_node::add_node_child(scene, &node);
}

// D1 f32 bound (TS: exact toBe on f64 products).
fn assert_close(actual: f32, expected: f32) {
    let bound = 4.0 * f32::EPSILON * expected.abs().max(1.0);
    assert!((actual - expected).abs() <= bound, "{actual} != {expected}");
}

mod render_gl_scene3d_shadow_map {
    use super::*;

    #[test]
    fn does_not_allocate_or_render_when_the_directional_light_has_shadows_disabled() {
        let mut state = make_gl_scene3d_state();

        render_gl_scene3d_shadow_map(
            &mut state,
            &make_test_scene(),
            &make_shadow_camera(),
            Some(&disabled_light()),
        );

        let runtime = get_gl_scene3d_runtime(&state);
        assert!(runtime.shadow_target.is_none());
        assert!(runtime.shadow.is_none());
        assert_eq!(count_calls("clear"), 0);
    }

    #[test]
    fn lazily_creates_the_shadow_target_on_the_first_call() {
        let mut state = make_gl_scene3d_state();

        render_gl_scene3d_shadow_map(
            &mut state,
            &make_test_scene(),
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        assert!(get_gl_scene3d_runtime(&state).shadow_target.is_some());
    }

    #[test]
    fn treats_an_absent_directional_light_as_disabled_and_invalidates_a_retained_shadow() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let camera = make_shadow_camera();
        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&shadow_light()));
        let clear_count = count_calls("clear");

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, None);

        assert!(
            !get_gl_scene3d_runtime(&state)
                .shadow
                .as_ref()
                .unwrap()
                .enabled
        );
        assert_eq!(count_calls("clear"), clear_count);
    }

    #[test]
    fn reuses_the_same_shadow_target_on_subsequent_calls() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let camera = make_shadow_camera();

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&shadow_light()));
        let first_target = shadow_target_framebuffer(&state);

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&shadow_light()));
        let second_target = shadow_target_framebuffer(&state);

        assert!(first_target.is_some());
        assert_eq!(second_target, first_target);
    }

    #[test]
    fn records_the_light_space_matrix_on_the_runtime() {
        let mut state = make_gl_scene3d_state();

        render_gl_scene3d_shadow_map(
            &mut state,
            &make_test_scene(),
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        let runtime = get_gl_scene3d_runtime(&state);
        let shadow = runtime.shadow.as_ref().expect("a recorded shadow");
        assert_ne!(shadow.matrix.m, create_matrix4().m);
    }

    #[test]
    fn records_normalized_pcf_and_receiver_bias_configuration_on_the_runtime() {
        let mut state = make_gl_scene3d_state();
        let light = light(DirectionalLightOptions {
            casts_shadow: Some(true),
            normal_bias: Some(0.02),
            pcf_radius: Some(8.7),
            shadow_bias: Some(0.01),
            ..test_default()
        });
        let camera = make_shadow_camera();
        let Projection::Orthographic(orthographic) = &camera.projection else {
            panic!("test shadow camera must be orthographic");
        };

        render_gl_scene3d_shadow_map(&mut state, &make_test_scene(), &camera, Some(&light));

        let runtime = get_gl_scene3d_runtime(&state);
        let shadow = runtime.shadow.as_ref().unwrap();
        assert!(shadow.enabled);
        assert_close(
            shadow.normal_bias_world,
            0.02 * get_orthographic_projection_texel_size(
                &orthographic.read().unwrap(),
                DIRECTIONAL_SHADOW_MAP_SIZE as f32,
                DIRECTIONAL_SHADOW_MAP_SIZE as f32,
            ),
        );
        assert_eq!(shadow.pcf_radius, 2.0);
        assert_eq!(shadow.shadow_bias, 0.01);
    }

    #[test]
    fn scales_authored_normal_bias_texels_with_the_orthographic_shadow_projection() {
        let light = light(DirectionalLightOptions {
            casts_shadow: Some(true),
            normal_bias: Some(1.0),
            ..test_default()
        });
        let camera = make_shadow_camera();
        let mut wide_camera = make_shadow_camera();
        wide_camera.projection = orthographic_camera(20.0).projection;

        let mut first = make_gl_scene3d_state();
        render_gl_scene3d_shadow_map(&mut first, &make_test_scene(), &camera, Some(&light));
        let first_bias = get_gl_scene3d_runtime(&first)
            .shadow
            .as_ref()
            .unwrap()
            .normal_bias_world;
        let mut second = make_gl_scene3d_state();
        render_gl_scene3d_shadow_map(&mut second, &make_test_scene(), &wide_camera, Some(&light));
        let second_bias = get_gl_scene3d_runtime(&second)
            .shadow
            .as_ref()
            .unwrap()
            .normal_bias_world;

        assert_close(second_bias, first_bias * 2.0);
    }

    #[test]
    fn rejects_a_perspective_directional_shadow_camera() {
        let mut state = make_gl_scene3d_state();
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        let projection = create_perspective_projection();
        {
            let mut perspective = projection.write().unwrap();
            perspective.aspect = 1.0;
            perspective.fov_y = std::f32::consts::PI / 4.0;
        }
        camera.projection = Projection::Perspective(projection);

        let message = thrown_message(|| {
            render_gl_scene3d_shadow_map(
                &mut state,
                &make_test_scene(),
                &camera,
                Some(&shadow_light()),
            );
        });
        assert!(message.contains("requires an orthographic shadow camera"));
        assert!(get_gl_scene3d_runtime(&state).shadow_target.is_none());
    }

    #[test]
    fn handles_false_to_true_to_false_without_allocating_or_sampling_a_stale_shadow() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let camera = make_shadow_camera();

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&disabled_light()));
        assert!(get_gl_scene3d_runtime(&state).shadow.is_none());
        assert!(get_gl_scene3d_runtime(&state).shadow_target.is_none());

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&shadow_light()));
        let shadow = get_gl_scene3d_runtime(&state).shadow.clone().unwrap();
        let target = shadow_target_framebuffer(&state);
        let clear_count = count_calls("clear");
        assert!(shadow.enabled);
        assert!(clear_count > 0);

        render_gl_scene3d_shadow_map(&mut state, &scene, &camera, Some(&disabled_light()));

        let runtime = get_gl_scene3d_runtime(&state);
        let retained = runtime.shadow.as_ref().unwrap();
        assert_eq!(retained.texture, shadow.texture);
        assert_eq!(retained.matrix, shadow.matrix);
        assert!(!retained.enabled);
        assert_eq!(
            runtime
                .shadow_target
                .as_ref()
                .map(|value| value.framebuffer),
            target
        );
        assert_eq!(count_calls("clear"), clear_count);
    }

    #[test]
    fn sets_up_the_depth_pass_with_front_face_culling() {
        let mut state = make_gl_scene3d_state();

        render_gl_scene3d_shadow_map(
            &mut state,
            &make_test_scene(),
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        assert!(
            calls_with("cull_face")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::FRONT))
        );
        assert!(
            calls_with("enable")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::CULL_FACE))
        );
    }

    #[test]
    fn records_the_caster_at_the_pose_the_app_blended_before_the_pass() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0].into_boxed_slice(),
            layout: Arc::new(RwLock::new(position_layout())),
            indices: None,
            subsets: None,
            topology: None,
        });
        let mesh = add_test_mesh(&scene, geometry, Vec::new());
        // Weight 1 on a target that raises y by 5. The morph is blended by the app's prepare before any
        // draw (here update_mesh_morph stands in for it); the depth pass just uploads that pose.
        mesh.write().unwrap().morph = Some(Arc::new(RwLock::new(MeshMorph {
            targets: Arc::new(vec![MeshMorphTarget {
                normal_deltas: None,
                position_deltas: vec![0.0, 5.0, 0.0, 0.0, 5.0, 0.0].into_boxed_slice(),
                tangent_deltas: None,
            }]),
            weights: vec![1.0].into_boxed_slice(),
        })));
        update_mesh_morph(&mesh.read().unwrap());

        render_gl_scene3d_shadow_map(
            &mut state,
            &scene,
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        let uploaded = last_uploaded_vertices();
        assert_eq!(uploaded[1], 5.0);
        assert_eq!(uploaded[4], 5.0);
    }

    #[test]
    fn draws_a_gpu_skinned_caster_through_the_has_skin_depth_variant() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        let scene = make_test_scene();
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0]
                .into_boxed_slice(),
            layout: Arc::new(RwLock::new(skinned_layout())),
            indices: None,
            subsets: None,
            topology: None,
        });
        let mesh = add_test_mesh(&scene, geometry, Vec::new());
        let mut skeleton = create_skeleton3d(
            Arc::new(RwLock::new(Vec::new())),
            None,
            &Arc::new(RwLock::new(Skeleton3DGuardState {
                enabled: false,
                bind_pose_guard: None,
            })),
        );
        skeleton.inverse_bind_matrices = Arc::new(RwLock::new(vec![0.0; 16].into_boxed_slice()));
        skeleton.joint_matrices = Arc::new(RwLock::new(vec![0.0; 16].into_boxed_slice()));
        mesh.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
            skeleton: Arc::new(RwLock::new(skeleton)),
            skeleton_root: None,
        })));

        render_gl_scene3d_shadow_map(
            &mut state,
            &scene,
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        // A skinned caster compiles + uses the dedicated HAS_SKIN depth program rather than the rigid one.
        assert!(
            get_gl_scene3d_runtime(&state)
                .program_cache
                .contains_key("shadow:depth:skin")
        );
    }

    #[test]
    fn restores_the_previous_framebuffer_after_the_depth_pass() {
        let mut state = make_gl_scene3d_state();

        render_gl_scene3d_shadow_map(
            &mut state,
            &make_test_scene(),
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        let last = calls_with("bind_framebuffer")
            .last()
            .cloned()
            .expect("a framebuffer bind");
        assert_eq!(last.integers[0], i64::from(glow::FRAMEBUFFER));
        assert_eq!(last.integers[1], 0);
    }

    // An instanced caster draws once per instance at `u_model * instanceModelMatrix()`. Recording a
    // single rigid copy at the node origin both loses every instance's shadow and can stamp a wildly
    // mis-sized caster into the map.
    #[test]
    fn instances_an_instanced_caster_rather_than_drawing_one_copy_at_the_node_origin() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        let mesh = create_instanced_mesh(
            Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
            Arc::new(RwLock::new(vec![None])),
            Some(8),
        );
        set_instanced_mesh_instance_count(&mesh, 3);
        set_instanced_mesh_instance_matrix(&mesh, 0, &shadow_translation(0.0));
        set_instanced_mesh_instance_matrix(&mesh, 1, &shadow_translation(4.0));
        set_instanced_mesh_instance_matrix(&mesh, 2, &shadow_translation(-4.0));
        add_node(&scene, mesh);

        render_gl_scene3d_shadow_map(
            &mut state,
            &scene,
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        assert_eq!(count_calls("draw_elements"), 0);
        let instanced = calls_with("draw_elements_instanced");
        assert_eq!(instanced.len(), 1);
        assert_eq!(instanced[0].integers[4], 3);
    }

    #[test]
    fn casts_nothing_for_an_instanced_caster_with_no_live_instances() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_node(
            &scene,
            create_instanced_mesh(
                Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
                Arc::new(RwLock::new(vec![None])),
                Some(8),
            ),
        );

        render_gl_scene3d_shadow_map(
            &mut state,
            &scene,
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        assert_eq!(count_calls("draw_elements_instanced"), 0);
        assert_eq!(count_calls("draw_elements"), 0);
    }

    #[test]
    fn still_draws_an_ordinary_rigid_caster_with_a_non_instanced_draw() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_test_mesh(
            &scene,
            create_box_mesh_geometry(None, None, None),
            vec![None],
        );

        render_gl_scene3d_shadow_map(
            &mut state,
            &scene,
            &make_shadow_camera(),
            Some(&shadow_light()),
        );

        assert_eq!(count_calls("draw_elements"), 1);
        assert_eq!(count_calls("draw_elements_instanced"), 0);
    }
}
