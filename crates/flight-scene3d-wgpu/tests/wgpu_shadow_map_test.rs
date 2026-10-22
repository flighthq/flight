use std::sync::{Arc, RwLock};

use flight_camera::{
    Camera3D, Projection, configure_directional_shadow_camera_3d, create_orthographic_projection,
    get_orthographic_projection_texel_size,
};
use flight_entity::Ref;
use flight_geometry::{Matrix4, create_aabb, create_matrix4, create_vector3};
use flight_lighting::{
    DIRECTIONAL_SHADOW_MAP_SIZE, DirectionalLight, DirectionalLightOptions,
    create_directional_light,
};
use flight_materials::contract::create_standard_pbr_material;
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU16, MeshGeometryOptions,
    VertexAttribute, VertexAttributeLayout, VertexFormat, VertexSemantic, create_box_mesh_geometry,
    create_mesh_geometry,
};
use flight_node::NodeRef;
use flight_render_wgpu::*;
use flight_scene3d::{
    Skeleton3D, Skin, create_instanced_mesh, set_instanced_mesh_instance_count,
    set_instanced_mesh_instance_matrix,
};
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn shadow_light(options: DirectionalLightOptions) -> DirectionalLight {
    return create_directional_light(Some(&options));
}

fn casting_light() -> DirectionalLight {
    return shadow_light(DirectionalLightOptions {
        casts_shadow: Some(true),
        color: Some(0xffffffff),
        direction: Some(create_vector3(0.0, -1.0, -1.0)),
        intensity: Some(1.0),
        ..test_default()
    });
}

fn disabled_light() -> DirectionalLight {
    return shadow_light(DirectionalLightOptions {
        casts_shadow: Some(false),
        ..test_default()
    });
}

// The projection is overwritten by the directional configuration (to orthographic).
fn make_shadow_camera() -> Camera3D {
    let mut camera = make_test_camera();
    camera.far = 10.0;
    configure_directional_shadow_camera_3d(
        &mut camera,
        &create_vector3(0.0, -1.0, -1.0),
        &create_aabb(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
    );
    return camera;
}

fn shadow_translation(x: f32) -> Matrix4 {
    let mut matrix = create_matrix4();
    matrix.m[12] = x;
    return matrix;
}

fn make_shadow_scene() -> NodeRef {
    let scene = create_test_scene_root();
    add_test_child(
        &scene,
        &create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new()),
    );
    return scene;
}

// The shadow pass must open before the main pass, so the recording state's open pass is suspended
// (its encoder stays open for the frame) before the depth pass records.
fn make_shadow_state() -> WgpuScene3DTestState {
    let mut test = make_wgpu_scene3d_state(None);
    let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
    suspend_wgpu_render_pass(&mut pass);
    test.clear();
    return test;
}

fn shadow(test: &mut WgpuScene3DTestState) -> Option<WgpuScene3DShadow> {
    return get_wgpu_scene3d_runtime(&mut test.state).shadow.clone();
}

fn depth_creates(test: &WgpuScene3DTestState) -> usize {
    return test
        .textures()
        .iter()
        .filter(|texture| texture.format == wgpu::TextureFormat::Depth32Float)
        .count();
}

fn orthographic_half_extent(camera: &Camera3D) -> (f32, f32) {
    let Projection::Orthographic(projection) = &camera.projection else {
        panic!("the shadow camera is orthographic");
    };
    let projection = projection.read().unwrap();
    return (projection.half_width, projection.half_height);
}

mod destroy_wgpu_scene3d_shadow {
    use super::*;

    #[test]
    fn destroys_the_shadow_depth_texture_and_clears_the_slot() {
        let mut test = make_shadow_state();
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );
        let texture = shadow(&mut test).unwrap().depth_texture;

        destroy_wgpu_scene3d_shadow(&mut test.state);

        assert!(shadow(&mut test).is_none());
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .shadow_depth_pipeline
                .is_none()
        );
        // A destroyed texture rejects a copy into it.
        assert!(test_panics(|| {
            let encoder = test.native.device.create_command_encoder(&test_default());
            let mut encoder = encoder;
            encoder.clear_texture(&texture, &test_default());
            test.native.queue.submit([encoder.finish()]);
        }));
    }

    #[test]
    fn is_a_no_op_when_no_shadow_was_drawn() {
        let mut test = make_shadow_state();
        assert!(!test_panics(|| destroy_wgpu_scene3d_shadow(
            &mut test.state
        )));
    }
}

mod render_wgpu_scene3d_shadow_map {
    use super::*;

    #[test]
    fn does_not_allocate_or_render_when_the_directional_light_has_shadows_disabled() {
        let mut test = make_shadow_state();

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&disabled_light()),
        );

        assert!(shadow(&mut test).is_none());
        assert_eq!(test.count("beginRenderPass"), 0);
        assert_eq!(depth_creates(&test), 0);
    }

    #[test]
    fn treats_an_absent_directional_light_as_disabled_and_invalidates_a_retained_shadow() {
        let mut test = make_shadow_state();
        let scene = make_shadow_scene();
        let camera = make_shadow_camera();
        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&casting_light()));
        let pass_count = test.count("beginRenderPass");

        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, None);

        assert!(!shadow(&mut test).unwrap().enabled);
        assert_eq!(test.count("beginRenderPass"), pass_count);
    }

    #[test]
    fn creates_a_sampleable_depth32float_shadow_map_and_stores_it_on_the_runtime() {
        let mut test = make_shadow_state();
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        assert_eq!(depth_creates(&test), 1);
        let shadow = shadow(&mut test).unwrap();
        assert!(shadow.matrix.m.iter().any(|value| *value != 0.0));
        submit_test_frame(&mut test);
    }

    #[test]
    fn records_normalized_pcf_and_receiver_bias_configuration_on_the_runtime() {
        let mut test = make_shadow_state();
        let light = shadow_light(DirectionalLightOptions {
            casts_shadow: Some(true),
            normal_bias: Some(0.02),
            pcf_radius: Some(8.7),
            shadow_bias: Some(0.01),
            ..test_default()
        });
        let camera = make_shadow_camera();

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &camera,
            Some(&light),
        );

        let Projection::Orthographic(projection) = &camera.projection else {
            panic!("test shadow camera must be orthographic");
        };
        let texel = get_orthographic_projection_texel_size(
            &projection.read().unwrap(),
            DIRECTIONAL_SHADOW_MAP_SIZE as f32,
            DIRECTIONAL_SHADOW_MAP_SIZE as f32,
        );
        let shadow = shadow(&mut test).unwrap();
        assert!(shadow.enabled);
        assert!((shadow.normal_bias_world - 0.02 * texel).abs() < 1e-7);
        assert_eq!(shadow.pcf_radius, 2.0);
        assert!((shadow.shadow_bias - 0.01).abs() < 1e-7);
    }

    #[test]
    fn scales_authored_normal_bias_texels_with_the_orthographic_shadow_projection() {
        let light = shadow_light(DirectionalLightOptions {
            casts_shadow: Some(true),
            normal_bias: Some(1.0),
            ..test_default()
        });
        let camera = make_shadow_camera();
        let mut wide_camera = make_shadow_camera();
        let (half_width, half_height) = orthographic_half_extent(&camera);
        let projection = create_orthographic_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.half_height = half_height * 2.0;
            projection.half_width = half_width * 2.0;
        }
        wide_camera.projection = Projection::Orthographic(projection);
        let mut first = make_shadow_state();
        let mut second = make_shadow_state();

        render_wgpu_scene3d_shadow_map(
            &mut first.state,
            &make_shadow_scene(),
            &camera,
            Some(&light),
        );
        render_wgpu_scene3d_shadow_map(
            &mut second.state,
            &make_shadow_scene(),
            &wide_camera,
            Some(&light),
        );

        let narrow = shadow(&mut first).unwrap().normal_bias_world;
        let wide = shadow(&mut second).unwrap().normal_bias_world;
        assert!((wide - narrow * 2.0).abs() < 1e-6);
    }

    #[test]
    fn rejects_a_perspective_directional_shadow_camera() {
        let mut test = make_shadow_state();
        let camera = make_test_camera();

        assert!(test_panics(|| {
            render_wgpu_scene3d_shadow_map(
                &mut test.state,
                &make_shadow_scene(),
                &camera,
                Some(&casting_light()),
            );
        }));
        assert!(shadow(&mut test).is_none());
    }

    #[test]
    fn handles_false_to_true_to_false_without_allocating_or_sampling_a_stale_shadow() {
        let mut test = make_shadow_state();
        let scene = make_shadow_scene();
        let camera = make_shadow_camera();

        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&disabled_light()));
        assert!(shadow(&mut test).is_none());

        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&casting_light()));
        let first = shadow(&mut test).unwrap();
        let pass_count = test.count("beginRenderPass");
        assert!(first.enabled);
        assert!(pass_count > 0);

        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&disabled_light()));

        let retained = shadow(&mut test).unwrap();
        assert_eq!(retained.depth_texture, first.depth_texture);
        assert!(!retained.enabled);
        assert_eq!(test.count("beginRenderPass"), pass_count);
    }

    // The sibling of the forward-pass defect: a non-indexed caster must still cast.
    #[test]
    fn issues_a_non_indexed_draw_for_a_caster_without_indices() {
        let mut test = make_shadow_state();
        let scene = create_test_scene_root();
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            vertices: vec![0.0; 9].into_boxed_slice(),
            layout: Arc::new(RwLock::new(VertexAttributeLayout {
                attributes: vec![VertexAttribute {
                    byte_offset: 0,
                    format: VertexFormat::Float32x3,
                    semantic: VertexSemantic::Position,
                }],
                stride: 12,
            })),
            indices: None,
            subsets: None,
            topology: None,
        });
        add_test_child(&scene, &create_test_mesh(geometry, Vec::new()));

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &scene,
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let draws = test.draws();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].vertex_count, 3);
        assert_eq!(test.count("drawIndexed"), 0);
        assert_eq!(test.count("setIndexBuffer"), 0);
    }

    #[test]
    fn opens_a_depth_only_pass_and_renders_each_caster_mesh_depth() {
        let mut test = make_shadow_state();
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        assert!(test.count("beginRenderPass") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("drawIndexed") > 0);
        assert!(test.count("end") > 0);
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .shadow_depth_skinned_pipeline
                .is_none()
        );
        assert!(
            !test
                .textures()
                .iter()
                .any(|texture| texture.format == wgpu::TextureFormat::Rgba32Float)
        );
        submit_test_frame(&mut test);
    }

    #[test]
    fn draws_a_gpu_skinned_caster_through_a_palette_backed_depth_variant() {
        let mut test = make_shadow_state();
        register_wgpu_gpu_skinning(&mut test.state);
        let scene = create_test_scene_root();
        let mesh = create_test_mesh(
            create_mesh_geometry(MeshGeometryOptions {
                vertices: vec![0.0; 20].into_boxed_slice(),
                layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
                indices: Some(IndexBuffer::U16(IndexBufferU16 {
                    data: Arc::new(RwLock::new(vec![0, 0, 0].into_boxed_slice())),
                })),
                subsets: None,
                topology: None,
            }),
            Vec::new(),
        );
        let mut skeleton: Skeleton3D = flight_entity::allocate_entity();
        skeleton.joint_matrices = Arc::new(RwLock::new(vec![0.0_f32; 16].into_boxed_slice()));
        let skeleton: Ref<Skeleton3D> = Arc::new(RwLock::new(skeleton));
        mesh.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
            skeleton,
            skeleton_root: None,
        })));
        add_test_child(&scene, &mesh);

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &scene,
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let skinned_source = test
            .shader_sources()
            .into_iter()
            .find(|source| source.contains("jointTexture"))
            .unwrap();
        assert!(skinned_source.contains("skinMatrix(joints0, weights0)"));
        assert!(
            get_wgpu_scene3d_runtime(&mut test.state)
                .shadow_depth_skinned_pipeline
                .is_some()
        );
        assert!(
            test.textures()
                .iter()
                .any(|texture| texture.format == wgpu::TextureFormat::Rgba32Float)
        );
        assert!(test.set_bind_groups().iter().any(|set| set.index == 0));
        submit_test_frame(&mut test);
    }

    #[test]
    fn compiles_a_vertex_only_depth_module_with_the_gl_to_webgpu_depth_remap() {
        let mut test = make_shadow_state();
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let code = test
            .shader_sources()
            .into_iter()
            .find(|source| source.contains("draw.world"))
            .unwrap();
        assert!(code.contains("clip.z = (clip.z + clip.w) * 0.5"));
        assert!(!code.contains("fs_main"));
    }

    #[test]
    fn reuses_the_shadow_depth_texture_across_frames() {
        let mut test = make_shadow_state();
        let scene = make_shadow_scene();
        let camera = make_shadow_camera();
        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&casting_light()));
        render_wgpu_scene3d_shadow_map(&mut test.state, &scene, &camera, Some(&casting_light()));
        assert_eq!(depth_creates(&test), 1);
    }

    #[test]
    fn is_a_no_op_when_no_command_encoder_is_active() {
        let mut test = make_shadow_state();
        get_wgpu_render_state_runtime_mut(&mut test.state).command_encoder = None;
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );
        assert_eq!(test.count("beginRenderPass"), 0);
        assert!(shadow(&mut test).is_none());
    }

    #[test]
    fn binds_a_group_3_shadow_group_on_the_lit_pbr_draw_that_follows() {
        let mut test = make_shadow_state();
        register_wgpu_standard_pbr_material(&mut test.state);
        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let scene = create_test_scene_root();
        add_test_child(
            &scene,
            &create_test_mesh(
                create_box_mesh_geometry(None, None, None),
                vec![Some(share_test_material(create_standard_pbr_material()))],
            ),
        );
        let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
        resume_wgpu_render_pass(&mut pass);
        render_wgpu_scene3d(
            &mut pass,
            &scene,
            &make_test_camera(),
            &make_test_scene_lights(),
            None,
        );

        assert!(test.set_bind_groups().iter().any(|set| set.index == 3));
        submit_test_frame(&mut test);
    }

    // An instanced caster draws once per instance at world * instanceMatrix.
    #[test]
    fn instances_an_instanced_caster_rather_than_drawing_one_copy_at_the_node_world_matrix() {
        let mut test = make_shadow_state();
        let scene = create_test_scene_root();
        let mesh = create_instanced_mesh(
            Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
            Arc::new(RwLock::new(Vec::new())),
            Some(8),
        );
        set_instanced_mesh_instance_count(&mesh, 3);
        set_instanced_mesh_instance_matrix(&mesh, 0, &shadow_translation(0.0));
        set_instanced_mesh_instance_matrix(&mesh, 1, &shadow_translation(0.5));
        set_instanced_mesh_instance_matrix(&mesh, 2, &shadow_translation(-0.5));
        add_test_child(&scene, &mesh);

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &scene,
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].instance_count, 3);
        assert!(test.set_vertex_buffers().iter().any(|set| set.slot == 1));
        submit_test_frame(&mut test);
    }

    #[test]
    fn casts_nothing_for_an_instanced_caster_with_no_live_instances() {
        let mut test = make_shadow_state();
        let scene = create_test_scene_root();
        add_test_child(
            &scene,
            &create_instanced_mesh(
                Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
                Arc::new(RwLock::new(Vec::new())),
                Some(8),
            ),
        );

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &scene,
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        assert_eq!(test.count("drawIndexed"), 0);
    }

    // Two instanced casters in one depth pass must not share an instance buffer.
    #[test]
    fn gives_each_instanced_caster_in_a_pass_its_own_instance_buffer() {
        let mut test = make_shadow_state();
        let scene = create_test_scene_root();
        for x in [0.0, 0.5] {
            let mesh = create_instanced_mesh(
                Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
                Arc::new(RwLock::new(Vec::new())),
                Some(8),
            );
            set_instanced_mesh_instance_count(&mesh, 1);
            set_instanced_mesh_instance_matrix(&mesh, 0, &shadow_translation(x));
            add_test_child(&scene, &mesh);
        }

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &scene,
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let bound: Vec<wgpu::Buffer> = test
            .set_vertex_buffers()
            .into_iter()
            .filter(|set| set.slot == 1)
            .map(|set| set.buffer)
            .collect();
        assert_eq!(bound.len(), 2);
        assert_ne!(bound[0], bound[1]);
    }

    #[test]
    fn still_draws_an_ordinary_rigid_caster_with_a_single_non_instanced_draw() {
        let mut test = make_shadow_state();

        render_wgpu_scene3d_shadow_map(
            &mut test.state,
            &make_shadow_scene(),
            &make_shadow_camera(),
            Some(&casting_light()),
        );

        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].instance_count, 1);
    }
}

mod wgpu_directional_shadow_wgsl {
    use super::*;

    #[test]
    fn uses_a_bounded_runtime_pcf_radius_and_configurable_receiver_biases() {
        let source = WGPU_DIRECTIONAL_SHADOW_WGSL;
        assert!(
            source.contains("sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f)")
        );
        assert!(source.contains("geometricNormal * shadow.params.w"));
        assert!(source.contains("0.5 - shadow.params.z"));
        assert!(source.contains("if (radius == 0)"));
        assert!(source.contains("return compareDirectionalShadow(uv, depthRef)"));
        assert!(source.contains("if (radius == 1)"));
        assert!(source.contains("for (var x = -1; x <= 1; x = x + 1)"));
        assert!(source.contains(
            "for (var x = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x = x + 1)"
        ));
        assert!(source.contains("return sum / 9.0"));
        assert!(!source.contains("0.0025"));
    }
}

// The lit WGSL string surface: PBR and classic declare the group(3) shadow bindings and apply the PCF
// comparison to their directional terms, mirroring scene3d-gl.
mod wgpu_pbr_prelude_shadow_sampling {
    use super::*;

    #[test]
    fn declares_the_group_3_shadow_bindings_and_pcf_comparison() {
        let code = get_wgpu_pbr_module_source_for_key(
            &build_wgpu_pbr_standard_define_key(None, None),
            None,
            None,
            None,
        );
        assert!(code.contains("@group(3) @binding(0) var<uniform> shadow"));
        assert!(code.contains("var shadowMap : texture_depth_2d"));
        assert!(code.contains("var shadowSampler : sampler_comparison"));
        assert!(code.contains("fn sampleDirectionalShadow"));
        assert!(code.contains("textureSampleCompareLevel(shadowMap, shadowSampler"));
        assert!(
            code.contains("direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)")
        );
    }

    #[test]
    fn classic_prelude_samples_the_shadow_map_on_the_directional_term_mirrors_scene_gl_classic() {
        let code = get_wgpu_classic_module_source_for_key(
            &WgpuClassicDefineKey {
                alpha_mask_enabled: false,
                double_sided: false,
                has_color_adjustment: None,
                has_color_matrix: None,
                has_alpha_map: Some(false),
                has_diffuse_map: false,
                has_normal_map: false,
                has_specular_map: false,
                lighting_model: WgpuClassicLightingModel::Lambert,
            },
            None,
            None,
            None,
        );
        assert!(code.contains("@group(3) @binding(1) var shadowMap : texture_depth_2d"));
        assert!(code.contains("fn sampleDirectionalShadow"));
        assert!(
            code.contains("direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)")
        );
    }
}
