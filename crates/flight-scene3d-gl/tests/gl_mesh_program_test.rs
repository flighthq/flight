use std::cell::Cell;
use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_geometry::create_matrix4;
use flight_materials::MaterialAlphaMode;
use flight_materials::contract::create_standard_pbr_material;
use flight_meshgeometry::{
    MeshGeometry, MeshGeometryOptions, PrimitiveTopology, VertexAttribute, VertexAttributeLayout,
    VertexFormat, VertexSemantic, create_box_mesh_geometry, create_mesh_geometry,
};
use flight_render::{CreateRenderTextureOptions, create_render_texture};
use flight_render_gl::GlViewportRect;
use flight_scene3d_gl::contract::*;
use flight_texture::{Texture, create_texture, set_texture_uv_offset, set_texture_uv_scale};

use crate::gl_test_helper::{
    calls_with, make_gl_scene3d_state, make_test_camera, make_test_mesh_program, make_test_proxy,
    material_ref, set_program_link, set_shader_compile, thrown_message, uniform_location,
    uniform_location_of, uniform_lookups,
};

fn standard_material() -> flight_materials::Material3DRef {
    return material_ref(create_standard_pbr_material());
}

fn box_geometry() -> MeshGeometry {
    return create_box_mesh_geometry(None, None, None);
}

fn bound_texture() -> Texture {
    // A texture whose 2D source is bound (TS `createTexture({ source: { kind: ImageTextureSourceKind } })`).
    return Texture::Texture2D(create_render_texture(&CreateRenderTextureOptions {
        width: 4,
        height: 4,
        ..crate::gl_test_helper::test_default()
    }));
}

mod begin_gl_mesh_draw {
    use super::*;

    #[test]
    fn disables_depth_writes_for_every_bind_in_a_blended_run() {
        let state = make_gl_scene3d_state();
        get_gl_scene3d_runtime(&state).active_blended_run = true;

        let first: GlMeshProgramRef = Rc::new(make_test_mesh_program(&state));
        let second: GlMeshProgramRef = Rc::new(make_test_mesh_program(&state));
        begin_gl_mesh_draw(&state, &first, false);
        begin_gl_mesh_draw(&state, &second, false);

        let masks: Vec<i64> = calls_with("depth_mask")
            .iter()
            .map(|call| call.integers[0])
            .collect();
        assert_eq!(masks, vec![0, 0]);
    }

    #[test]
    fn stores_the_active_program_selects_it_and_sets_depth_back_face_cull() {
        let state = make_gl_scene3d_state();
        let program: GlMeshProgramRef = Rc::new(make_test_mesh_program(&state));
        begin_gl_mesh_draw(&state, &program, false);
        assert!(!calls_with("use_program").is_empty());
        assert!(
            calls_with("enable")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::DEPTH_TEST))
        );
        assert!(
            calls_with("enable")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::CULL_FACE))
        );
        assert!(
            calls_with("depth_mask")
                .iter()
                .any(|call| call.integers[0] == 1)
        );
        assert!(Rc::ptr_eq(
            get_gl_scene3d_runtime(&state)
                .active_mesh_program
                .as_ref()
                .unwrap(),
            &program
        ));
    }

    #[test]
    fn disables_culling_for_a_double_sided_material() {
        let state = make_gl_scene3d_state();
        let program: GlMeshProgramRef = Rc::new(make_test_mesh_program(&state));
        begin_gl_mesh_draw(&state, &program, true);
        assert!(
            calls_with("disable")
                .iter()
                .any(|call| call.integers[0] == i64::from(glow::CULL_FACE))
        );
    }
}

mod bind_gl_instance_color_palette {
    use super::*;

    #[test]
    fn uploads_the_colour_palette_texture_and_sets_u_instance_color_palette() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);

        bind_gl_instance_color_palette(&state, &program, &[1.0, 0.0, 0.0, 1.0], 1);

        assert!(!calls_with("active_texture").is_empty());
        assert!(program.loc_instance_color_palette.get().is_some());
    }

    // One texel per instance, against the matrix palette's four.
    #[test]
    fn uploads_one_texel_per_instance() {
        let state = make_gl_scene3d_state();

        bind_gl_instance_color_palette(&state, &make_test_mesh_program(&state), &[0.0; 12], 3);

        let upload = calls_with("tex_image_2d").pop().unwrap();
        assert_eq!(upload.integers[3], 3);
    }
}

mod bind_gl_instance_palette {
    use super::*;

    #[test]
    fn uploads_the_instance_palette_texture_and_sets_u_instance_palette() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        bind_gl_instance_palette(&state, &program, &[0.0; 16], 1);
        assert!(!calls_with("active_texture").is_empty());
        assert!(program.loc_instance_palette.get().is_some());
    }
}

mod bind_gl_uv_transform {
    use super::*;

    #[test]
    fn uploads_the_khr_transform_as_a_column_major_mat3_with_transpose_false() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        let mut texture = create_texture(None);
        set_texture_uv_scale(&mut texture, 2.0, 3.0);
        // Exactly-representable float32 offsets so the upload compares without rounding slop.
        set_texture_uv_offset(&mut texture, 0.5, 0.25);

        bind_gl_uv_transform(&state.gl, &program, Some(&texture));

        let call = calls_with("uniform_matrix_3_f32").pop().unwrap();
        // transpose=false: the buffer is already column-major (col0 = U axis, col1 = V axis, col2 = xlate).
        assert_eq!(call.integers[2], 0);
        // `+ 0.0` normalizes the -0 from -sy*sin(0) to +0 so the buffer compares cleanly.
        let uploaded: Vec<f32> = call.floats.iter().map(|value| value + 0.0).collect();
        assert_eq!(uploaded, vec![2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.5, 0.25, 1.0]);
    }

    #[test]
    fn resolves_the_location_once_and_skips_the_upload_for_a_null_texture() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);

        bind_gl_uv_transform(&state.gl, &program, None);

        assert_eq!(
            uniform_lookups()
                .iter()
                .filter(|name| name.as_str() == "u_uvTransform")
                .count(),
            1
        );
        assert!(calls_with("uniform_matrix_3_f32").is_empty());
    }
}

mod compile_gl_program {
    use super::*;

    #[test]
    fn compiles_attaches_and_links_a_vertex_fragment_pair() {
        let state = make_gl_scene3d_state();
        compile_gl_program(
            &state.gl,
            "#version 300 es\nvoid main(){}",
            "#version 300 es\nvoid main(){}",
        );
        assert!(!calls_with("link_program").is_empty());
    }

    #[test]
    fn throws_on_a_shader_compile_failure() {
        let state = make_gl_scene3d_state();
        set_shader_compile(false);
        let message = thrown_message(|| {
            compile_gl_program(&state.gl, "v", "f");
        });
        assert!(message.contains("compile error"));
    }

    #[test]
    fn throws_on_a_program_link_failure() {
        let state = make_gl_scene3d_state();
        set_program_link(false);
        let message = thrown_message(|| {
            compile_gl_program(&state.gl, "v", "f");
        });
        assert!(message.contains("link error"));
    }
}

mod destroy_gl_mesh_program {
    use super::*;

    #[test]
    fn deletes_the_linked_gl_program() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        destroy_gl_mesh_program(&state, &program);
        let deletes = calls_with("delete_program");
        assert_eq!(deletes.len(), 1);
        assert_eq!(deletes[0].integers[0], i64::from(program.program.0.get()));
    }

    // The driver may recycle a deleted program's name, so its upload records go with it.
    #[test]
    fn drops_the_programs_upload_records_so_a_recycled_name_starts_clean() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        {
            let mut scene = get_gl_scene3d_runtime(&state);
            scene.uploaded_light_blocks.insert(
                program.program,
                (
                    Rc::new(flight_lighting::Scene3DLightBlock {
                        ambient_count: 0,
                        data: vec![0.0_f32; 4].into_boxed_slice(),
                        directional_count: 0,
                        hemisphere_count: 0,
                        point_count: 0,
                        spot_count: 0,
                        version: 1,
                    }),
                    1,
                ),
            );
            scene.custom_shader_checked_programs.insert(program.program);
        }
        destroy_gl_mesh_program(&state, &program);
        let scene = get_gl_scene3d_runtime(&state);
        assert!(!scene.uploaded_light_blocks.contains_key(&program.program));
        assert!(
            !scene
                .custom_shader_checked_programs
                .contains(&program.program)
        );
    }
}

mod draw_gl_mesh_subset {
    use super::*;

    fn draw_box(program: &GlMeshProgram, alpha: Option<f32>) {
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.alpha = alpha;
        draw_gl_mesh_subset(&mut state, program, &proxy, &geometry);
    }

    #[test]
    fn uploads_the_model_normal_matrices_and_issues_an_indexed_draw_over_the_subset() {
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        let program = make_test_mesh_program(&state);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);

        assert!(!calls_with("uniform_matrix_4_f32").is_empty());
        assert!(!calls_with("uniform_matrix_3_f32").is_empty());
        let draw = calls_with("draw_elements").pop().unwrap();
        assert_eq!(draw.integers[1], i64::from(proxy.subset.index_count));
    }

    #[test]
    fn draws_each_topology_with_the_matching_gl_primitive_mode() {
        let cases = [
            (PrimitiveTopology::LineList, glow::LINES),
            (PrimitiveTopology::LineStrip, glow::LINE_STRIP),
            (PrimitiveTopology::PointList, glow::POINTS),
            (PrimitiveTopology::TriangleList, glow::TRIANGLES),
            (PrimitiveTopology::TriangleStrip, glow::TRIANGLE_STRIP),
        ];
        for (topology, constant) in cases {
            let mut state = make_gl_scene3d_state();
            let mut geometry = box_geometry();
            geometry.topology = topology;
            let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
            let program = make_test_mesh_program(&state);
            draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
            let draw = calls_with("draw_elements").pop().unwrap();
            assert_eq!(draw.integers[0], i64::from(constant));
        }
    }

    #[test]
    fn draws_a_non_indexed_geometry_with_its_vertex_count() {
        let mut state = make_gl_scene3d_state();
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
        let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        let program = make_test_mesh_program(&state);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        let draw = calls_with("draw_arrays").pop().unwrap();
        assert_eq!(draw.integers, vec![i64::from(glow::TRIANGLES), 0, 3]);
    }

    #[test]
    fn uploads_u_object_alpha_with_the_proxy_alpha_when_the_program_has_an_object_alpha_location() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program
            .loc_object_alpha
            .set(Some(Some(uniform_location("u_objectAlpha"))));
        let mut state = state;
        let geometry = box_geometry();
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.alpha = Some(0.25);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(
            calls_with("uniform_1_f32")
                .iter()
                .any(|call| call.floats[0] == 0.25)
        );
    }

    #[test]
    fn defaults_u_object_alpha_to_1_when_the_proxy_carries_no_alpha() {
        let mut state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program
            .loc_object_alpha
            .set(Some(Some(uniform_location("u_objectAlpha"))));
        let geometry = box_geometry();
        let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(
            calls_with("uniform_1_f32")
                .iter()
                .any(|call| call.floats[0] == 1.0)
        );
    }

    #[test]
    fn is_a_no_op_for_object_alpha_when_the_program_has_no_object_alpha_location() {
        let mut state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program.loc_object_alpha.set(Some(None)); // resolved: this shader has no u_objectAlpha
        program.loc_alpha_is_coverage.set(Some(None)); // and no u_alphaIsCoverage either
        let geometry = box_geometry();
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.alpha = Some(0.5);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(calls_with("uniform_1_f32").is_empty());
        // A resolved-absent location is not re-resolved.
        assert!(!uniform_lookups().iter().any(|name| name == "u_objectAlpha"));
    }

    #[test]
    fn resolves_u_object_alpha_lazily_on_first_draw_when_unresolved_undefined() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state); // loc_object_alpha unresolved
        draw_box(&program, Some(0.5));
        assert!(uniform_lookups().iter().any(|name| name == "u_objectAlpha"));
    }

    #[test]
    fn skips_the_normal_matrix_when_the_program_has_no_normal_matrix_location() {
        let mut state = make_gl_scene3d_state();
        let mut program = make_test_mesh_program(&state);
        program.loc_normal_matrix = None;
        let geometry = box_geometry();
        let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(calls_with("uniform_matrix_3_f32").is_empty());
    }

    #[test]
    fn binds_no_bone_palette_for_a_skinned_draw_when_skinning_is_not_registered() {
        // Without the capability there is no binder to call, so the draw stays on the rigid path and the
        // skin palette unit is never bound.
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let program = make_test_mesh_program(&state);
        program
            .loc_joint_texture
            .set(Some(Some(uniform_location("u_jointTexture"))));
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0; 2 * 16].into_boxed_slice())));

        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);

        assert!(
            !calls_with("uniform_1_i32")
                .iter()
                .any(|call| call.integers[1] == i64::from(SKIN_PALETTE_TEXTURE_UNIT))
        );
    }

    #[test]
    fn uploads_the_bone_palette_into_the_data_texture_and_binds_the_skin_unit_for_a_skinned_draw() {
        let mut state = make_gl_scene3d_state();
        register_gl_mesh_skinning(&state);
        let geometry = box_geometry();
        let program = make_test_mesh_program(&state);
        program
            .loc_joint_texture
            .set(Some(Some(uniform_location("u_jointTexture"))));
        // Two joints' palette (32 floats) → texture width = 2 joints * 4 = 8 texels.
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0; 2 * 16].into_boxed_slice())));
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);

        // The palette allocates RGBA32F storage on the skin-palette unit and the sampler is set to it.
        assert!(
            calls_with("active_texture")
                .iter()
                .any(|call| call.integers[0]
                    == i64::from(glow::TEXTURE0 + SKIN_PALETTE_TEXTURE_UNIT))
        );
        let allocation = calls_with("tex_image_2d").into_iter().next().unwrap();
        assert_eq!(allocation.integers[3], 8); // width = 2 joints * 4 texels
        assert!(
            calls_with("uniform_1_i32")
                .iter()
                .any(|call| call.integers[1] == i64::from(SKIN_PALETTE_TEXTURE_UNIT))
        );
    }

    #[test]
    fn skips_the_skin_upload_when_the_program_has_no_joint_texture_location() {
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let program = make_test_mesh_program(&state); // loc_joint_texture unresolved → not skinned
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.joint_matrices = Some(Arc::new(RwLock::new(vec![0.0; 16].into_boxed_slice())));
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(calls_with("tex_image_2d").is_empty());
    }

    #[test]
    fn skips_the_skin_upload_for_a_skinned_program_drawing_a_rigid_paletteless_mesh() {
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let program = make_test_mesh_program(&state);
        program
            .loc_joint_texture
            .set(Some(Some(uniform_location("u_jointTexture"))));
        let proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        assert!(calls_with("tex_image_2d").is_empty());
    }
}

mod ensure_gl_scene3d_program {
    use super::*;

    #[test]
    fn compiles_a_key_once_and_returns_the_cached_program_on_repeat() {
        let state = make_gl_scene3d_state();
        let compiles = Cell::new(0);
        let first = ensure_gl_scene3d_program(&state, "fam:a", |_gl| {
            compiles.set(compiles.get() + 1);
            return make_test_mesh_program(&state);
        });
        let second = ensure_gl_scene3d_program(&state, "fam:a", |_gl| {
            compiles.set(compiles.get() + 1);
            return make_test_mesh_program(&state);
        });
        assert!(Rc::ptr_eq(&second, &first));
        assert_eq!(compiles.get(), 1);
    }

    #[test]
    fn compiles_distinct_programs_for_distinct_keys() {
        let state = make_gl_scene3d_state();
        let a = ensure_gl_scene3d_program(&state, "fam:a", |_gl| make_test_mesh_program(&state));
        let b = ensure_gl_scene3d_program(&state, "fam:b", |_gl| make_test_mesh_program(&state));
        // Two distinct keys → two cached entries (the shared program_cache spans every family).
        let again =
            ensure_gl_scene3d_program(&state, "fam:a", |_gl| make_test_mesh_program(&state));
        assert!(!Rc::ptr_eq(&a, &b));
        assert!(Rc::ptr_eq(&again, &a));
        assert_eq!(get_gl_scene3d_runtime(&state).program_cache.len(), 2);
    }
}

// A world matrix with a negative determinant turns every triangle inside out on the way to clip space;
// the fix is a per-draw front-face decision, restored to CCW after the draw.
mod front_face_selection_under_a_mirroring_world_matrix {
    use super::*;

    fn front_face_args_for_scale_x(scale_x: f32) -> Vec<i64> {
        let mut state = make_gl_scene3d_state();
        let geometry = box_geometry();
        let mut world_matrix = create_matrix4();
        world_matrix.m[0] = scale_x;
        let mut proxy = make_test_proxy(standard_material(), geometry.subsets[0]);
        proxy.world_matrix = world_matrix;
        let program = make_test_mesh_program(&state);
        draw_gl_mesh_subset(&mut state, &program, &proxy, &geometry);
        return calls_with("front_face")
            .iter()
            .map(|call| call.integers[0])
            .collect();
    }

    #[test]
    fn keeps_counter_clockwise_front_for_an_ordinary_transform() {
        // Set before the draw and restored after it, so an ordinary mesh sets CCW twice.
        assert_eq!(front_face_args_for_scale_x(1.0), vec![0x0901, 0x0901]); // GL_CCW
    }

    #[test]
    fn switches_to_clockwise_front_for_a_mirrored_transform() {
        // CW for the mirrored draw, then restored to CCW so it cannot leak into the present pass.
        assert_eq!(front_face_args_for_scale_x(-1.0), vec![0x0900, 0x0901]); // GL_CW then GL_CCW
    }
}

mod has_gl_uv_transform {
    use super::*;

    #[test]
    fn is_false_for_a_null_texture() {
        assert!(!has_gl_uv_transform(None));
    }

    #[test]
    fn is_false_for_an_identity_transform_even_with_a_bound_image() {
        assert!(!has_gl_uv_transform(Some(&bound_texture())));
    }

    #[test]
    fn is_false_for_a_non_identity_transform_whose_image_is_unbound() {
        let mut texture = create_texture(None);
        set_texture_uv_scale(&mut texture, 2.0, 2.0);

        assert!(!has_gl_uv_transform(Some(&texture)));
    }

    #[test]
    fn is_true_only_when_a_bound_image_carries_a_non_identity_transform() {
        let mut texture = bound_texture();
        set_texture_uv_scale(&mut texture, 2.0, 2.0);

        assert!(has_gl_uv_transform(Some(&texture)));
    }
}

mod set_gl_mesh_camera_position {
    use super::*;

    #[test]
    fn uploads_a_vec3_camera_world_position() {
        let state = make_gl_scene3d_state();
        set_gl_mesh_camera_position(
            &state.gl,
            Some(uniform_location("u_cameraPosition")),
            &make_test_camera(),
        );
        assert!(!calls_with("uniform_3_f32").is_empty());
    }
}

mod set_gl_mesh_view_projection {
    use super::*;

    #[test]
    fn uploads_a_view_projection_using_the_active_viewport_aspect() {
        let state = make_gl_scene3d_state();
        state.gl_runtime.borrow_mut().render_target_viewport = Some(GlViewportRect {
            height: 100,
            width: 200,
            x: 10,
            y: 20,
        });

        set_gl_mesh_view_projection(
            &state,
            Some(uniform_location("u_viewProjection")),
            &make_test_camera(),
        );

        let upload = calls_with("uniform_matrix_4_f32").pop().unwrap();
        let expected = 3.0_f32.sqrt() / 2.0;
        // D1 f32 bound (TS: toBeCloseTo default 0.005)
        assert!((upload.floats[0] - expected).abs() <= 0.005);
    }
}

mod upload_gl_mesh_draw_alpha {
    use super::*;

    // Regression guard for the wireframe blank-frame defect: this upload lives outside
    // draw_gl_mesh_subset so a family that bypasses it still ships u_objectAlpha.
    #[test]
    fn uploads_node_alpha_and_resolves_each_location_once_across_draws() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program
            .loc_object_alpha
            .set(Some(Some(uniform_location("u_objectAlpha"))));
        program
            .loc_alpha_is_coverage
            .set(Some(Some(uniform_location("u_alphaIsCoverage"))));
        crate::gl_test_helper::clear_calls();

        upload_gl_mesh_draw_alpha(&state.gl, &program, 0.25, None);
        upload_gl_mesh_draw_alpha(&state.gl, &program, 1.0, None);

        let object_alpha = i64::from(uniform_location_of("u_objectAlpha"));
        let alphas: Vec<f32> = calls_with("uniform_1_f32")
            .iter()
            .filter(|call| call.integers[0] == object_alpha)
            .map(|call| call.floats[0])
            .collect();
        assert_eq!(alphas, vec![0.25, 1.0]);
        assert!(uniform_lookups().is_empty());
    }

    // Only glTF's 'blend' declares its alpha to be coverage; 'opaque' and 'mask' resolve to opaque.
    #[test]
    fn flags_alpha_as_coverage_only_for_a_blended_material() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program
            .loc_object_alpha
            .set(Some(Some(uniform_location("u_objectAlpha"))));
        program
            .loc_alpha_is_coverage
            .set(Some(Some(uniform_location("u_alphaIsCoverage"))));
        let coverage_location = i64::from(uniform_location_of("u_alphaIsCoverage"));

        let coverage_of = |mode: Option<MaterialAlphaMode>| -> f32 {
            crate::gl_test_helper::clear_calls();
            match mode {
                Some(mode) => {
                    let mut material = create_standard_pbr_material();
                    material.alpha_mode = mode;
                    upload_gl_mesh_draw_alpha(&state.gl, &program, 1.0, Some(&material));
                }
                None => upload_gl_mesh_draw_alpha(&state.gl, &program, 1.0, None),
            }
            return calls_with("uniform_1_f32")
                .iter()
                .find(|call| call.integers[0] == coverage_location)
                .unwrap()
                .floats[0];
        };

        assert_eq!(coverage_of(Some(MaterialAlphaMode::Blend)), 1.0);
        assert_eq!(coverage_of(Some(MaterialAlphaMode::Mask)), 0.0);
        assert_eq!(coverage_of(Some(MaterialAlphaMode::Opaque)), 0.0);
        assert_eq!(coverage_of(None), 0.0);
    }

    #[test]
    fn skips_silently_for_a_program_whose_shader_declares_neither_uniform() {
        let state = make_gl_scene3d_state();
        let program = make_test_mesh_program(&state);
        program.loc_object_alpha.set(Some(None));
        program.loc_alpha_is_coverage.set(Some(None));

        upload_gl_mesh_draw_alpha(&state.gl, &program, 0.25, None);

        assert!(calls_with("uniform_1_f32").is_empty());
    }
}
