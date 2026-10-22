use std::sync::{Arc, RwLock};

use flight_camera::{
    Projection, create_camera_3d, create_orthographic_projection,
    set_camera_3d_view_matrix4_from_look_at,
};
use flight_geometry::{create_matrix4, create_vector3};
use flight_materials::contract::create_standard_pbr_material;
use flight_materials::{MaterialAlphaMode, StandardPbrMaterial};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_render::{RenderTargetDepth, RenderTargetDescriptor};
use flight_render_gl::{
    GlBoundShader, begin_gl_render_pass, create_gl_texture_render_target, end_gl_render_pass,
};
use flight_scene3d::{
    create_instanced_mesh, set_instanced_mesh_instance_color, set_instanced_mesh_instance_count,
    set_instanced_mesh_instance_matrix,
};
use flight_scene3d_gl::*;
use flight_texture::RenderTargetColorSpace;
use glow::HasContext;

use crate::gl_test_helper::{
    add_test_mesh, bytes_as_f32, calls_with, make_derived_gl_scene3d_state, make_gl_scene3d_state,
    make_test_lights, make_test_look_at_camera, make_test_pass, make_test_scene, material_ref,
    make_state_options,
};

fn standard(alpha_mode: MaterialAlphaMode) -> StandardPbrMaterial {
    let mut material = create_standard_pbr_material();
    material.alpha_mode = alpha_mode;
    return material;
}

fn add_box(scene: &NodeRef, material: flight_materials::Material3DRef) -> flight_entity::Ref<flight_scene3d::Mesh> {
    return add_test_mesh(scene, create_box_mesh_geometry(None, None, None), vec![Some(material)]);
}

fn render(state: &mut flight_render_gl::GlRenderState, scene: &NodeRef) {
    let pass = make_test_pass(state);
    render_gl_scene3d(
        state,
        &pass,
        None,
        scene,
        &make_test_look_at_camera(),
        &make_test_lights(),
        None,
    );
}

fn enabled(capability: u32) -> bool {
    return calls_with("enable")
        .iter()
        .any(|call| call.integers[0] == i64::from(capability));
}

fn disabled(capability: u32) -> bool {
    return calls_with("disable")
        .iter()
        .any(|call| call.integers[0] == i64::from(capability));
}

fn blended_meshes(state: &flight_render_gl::GlRenderState) -> Vec<NodeRef> {
    return get_gl_scene3d_runtime(state)
        .blended_draw_list
        .iter()
        .map(|entry| entry.mesh.clone().unwrap())
        .collect();
}

fn make_emitter(count: usize) -> flight_entity::Ref<flight_particleemitter::ParticleEmitter3D> {
    let emitter = flight_particleemitter::create_particle_emitter_3d();
    flight_particleemitter::reserve_particle_emitter_3d(&emitter, count);
    {
        let mut guard = emitter.write().unwrap();
        let data = &mut guard.data;
        data.particle_count = count;
        for i in 0..count {
            data.transforms[i * 4 + 3] = 1.0;
            data.alphas[i] = 1.0;
            data.colors[i * 3] = 1.0;
            data.colors[i * 3 + 1] = 1.0;
            data.colors[i * 3 + 2] = 1.0;
        }
    }
    return emitter;
}

mod render_gl_scene3d {
    use super::*;

    #[test]
    fn uploads_one_shared_geometry_once_across_a_primary_and_derived_state_on_the_same_context() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let mut options = make_state_options();
        options.gl_registries = state.gl_registries.clone();
        let mut derived = make_derived_gl_scene3d_state(&state, Some(&options));
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));
        let uploads_before = calls_with("gen_vertex_arrays").len();

        render(&mut state, &scene);
        render(&mut derived, &scene);

        assert_eq!(calls_with("gen_vertex_arrays").len(), uploads_before + 1);
    }

    #[test]
    fn binds_once_for_a_run_of_subsets_sharing_a_material() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let material = material_ref(create_standard_pbr_material());
        add_box(&scene, material.clone());
        add_box(&scene, material);

        render(&mut state, &scene);

        // Same material across both meshes: bound once, drawn twice.
        assert_eq!(calls_with("use_program").len(), 1);
        assert_eq!(calls_with("draw_elements").len(), 2);
    }

    #[test]
    fn invalidates_render_gl_binding_cache_after_drawing_so_the_present_pass_re_binds() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));
        // Stand in for render-gl having a program bound and cached before the scene draws.
        // SAFETY: the mock context allocates names on the test thread.
        let program = unsafe { state.gl.create_program() }.unwrap();
        state.context_state.runtime_state.borrow_mut().binding = Some(GlBoundShader {
            locations: None,
            program,
        });

        render(&mut state, &scene);

        assert!(state.context_state.runtime_state.borrow().binding.is_none());
    }

    #[test]
    fn declares_the_bound_render_target_linear_scene_materials_output_linear_hdr() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));
        let mut target = create_gl_texture_render_target(
            &state,
            &RenderTargetDescriptor {
                width: 64.0,
                height: 64.0,
                format: None,
                color_attachments: None,
                color_formats: None,
                sample_count: None,
                depth: Some(RenderTargetDepth::DepthStencil),
                color_space: Some(RenderTargetColorSpace::Srgb),
            },
            None,
        )
        .unwrap()
        .unwrap();
        let pass = begin_gl_render_pass(&state, &target, None, None).unwrap();

        render_gl_scene3d(
            &mut state,
            &pass,
            Some(&mut target),
            &scene,
            &make_test_look_at_camera(),
            &make_test_lights(),
            None,
        );
        end_gl_render_pass(&state, &pass).unwrap();

        assert_eq!(target.axes.color_space, RenderTargetColorSpace::Linear);
    }

    #[test]
    fn does_not_draw_a_disabled_mesh() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let mesh = add_box(&scene, material_ref(create_standard_pbr_material()));
        mesh.write().unwrap().enabled = false;

        render(&mut state, &scene);

        assert!(calls_with("draw_elements").is_empty());
    }

    #[test]
    fn draws_each_visible_mesh_subset_with_its_registered_material_renderer() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));

        render(&mut state, &scene);

        assert!(!calls_with("use_program").is_empty());
        assert!(!calls_with("draw_elements").is_empty());
    }

    #[test]
    fn enables_gl_blend_for_subsets_with_alpha_mode_blend_and_disables_it_after() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));
        crate::gl_test_helper::clear_calls();

        render(&mut state, &scene);

        assert!(enabled(glow::BLEND));
        assert!(disabled(glow::BLEND));
        assert!(!calls_with("blend_func").is_empty());
        assert!(!calls_with("draw_elements").is_empty());
    }

    #[test]
    fn keeps_depth_writes_disabled_across_blended_material_rebinds_and_restores_them_after() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));

        render(&mut state, &scene);

        assert_eq!(calls_with("use_program").len(), 2);
        let masks: Vec<i64> = calls_with("depth_mask").iter().map(|call| call.integers[0]).collect();
        assert_eq!(masks, vec![0, 0, 1]);
        assert!(!get_gl_scene3d_runtime(&state).active_blended_run);
    }

    #[test]
    fn applies_the_surface_material_blend_mode_for_a_blended_subset() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let mut material = standard(MaterialAlphaMode::Blend);
        material.blend_mode = flight_materials::BLEND_MODE_ADD.to_string();
        add_box(&scene, material_ref(material));

        render(&mut state, &scene);

        assert!(calls_with("blend_func").iter().any(|call| call.integers[0]
            == i64::from(glow::ONE)
            && call.integers[1] == i64::from(glow::ONE)));
    }

    // Normal resolves through the same premultiplied registry as every other mode; SRC_ALPHA
    // reappearing here would be the straight-alpha fork coming back.
    #[test]
    fn uses_premultiplied_normal_factors_never_straight_alpha_ones() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));

        render(&mut state, &scene);

        let blends = calls_with("blend_func");
        assert!(blends.iter().any(|call| call.integers[0] == i64::from(glow::ONE)
            && call.integers[1] == i64::from(glow::ONE_MINUS_SRC_ALPHA)));
        assert!(!blends
            .iter()
            .any(|call| call.integers[0] == i64::from(glow::SRC_ALPHA)));
    }

    #[test]
    fn draws_opaque_subsets_before_blended_subsets_regardless_of_scene_order() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        // Add blended first, then opaque — opaque should still draw before blended.
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));
        add_box(&scene, material_ref(create_standard_pbr_material()));
        crate::gl_test_helper::clear_calls();

        render(&mut state, &scene);

        // Both meshes drawn.
        assert_eq!(calls_with("draw_elements").len(), 2);
        // GL blending was enabled (the blended pass ran), and only after the opaque draw.
        assert!(enabled(glow::BLEND));
        let names = crate::gl_test_helper::call_names();
        let first_draw = names.iter().position(|name| name == "draw_elements").unwrap();
        let details = crate::gl_test_helper::snapshot().call_details;
        let blend_enable = details
            .iter()
            .position(|call| call.name == "enable" && call.integers[0] == i64::from(glow::BLEND))
            .unwrap();
        assert!(first_draw < blend_enable);
    }

    #[test]
    fn does_not_enable_gl_blend_when_all_subsets_are_opaque() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));
        crate::gl_test_helper::clear_calls();

        render(&mut state, &scene);

        // No blended subsets: GL_BLEND should not be enabled.
        assert!(!enabled(glow::BLEND));
    }

    #[test]
    fn routes_a_mesh_with_node_alpha_below_1_through_the_blended_pass_even_with_an_opaque_material() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        // Opaque material, but the node is faded (alpha < 1); the fading object composites through the
        // blended pass.
        let mesh = add_box(&scene, material_ref(create_standard_pbr_material()));
        mesh.write().unwrap().alpha = 0.5;
        crate::gl_test_helper::clear_calls();

        render(&mut state, &scene);

        assert!(enabled(glow::BLEND));
        assert!(!calls_with("draw_elements").is_empty());
        // The resolved node opacity was uploaded to u_objectAlpha (a uniform1f of 0.5).
        assert!(calls_with("uniform_1_f32").iter().any(|call| call.floats[0] == 0.5));
    }

    #[test]
    fn reuses_opaque_and_blended_draw_records_across_frames() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));
        add_box(&scene, material_ref(standard(MaterialAlphaMode::Blend)));

        render(&mut state, &scene);
        render(&mut state, &scene);

        // Rust moves pooled records by value, so record identity is unobservable; what is observable is
        // that the second frame drew from the pools (both empty) into lists of the same shape.
        let runtime = get_gl_scene3d_runtime(&state);
        assert_eq!(runtime.opaque_draw_list.len(), 1);
        assert_eq!(runtime.blended_draw_list.len(), 1);
        assert!(runtime.opaque_pool.is_empty());
        assert!(runtime.blended_pool.is_empty());
    }

    #[test]
    fn keeps_a_fully_opaque_mesh_node_alpha_1_in_the_opaque_pass() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let mesh = add_box(&scene, material_ref(create_standard_pbr_material()));
        mesh.write().unwrap().alpha = 1.0;
        crate::gl_test_helper::clear_calls();

        render(&mut state, &scene);

        assert!(!enabled(glow::BLEND));
        assert!(!calls_with("draw_elements").is_empty());
    }

    #[test]
    fn skips_a_subset_whose_material_has_no_registered_renderer_no_fallback() {
        let mut state = make_gl_scene3d_state();
        // No register_gl_standard_pbr_material: nothing resolves.
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));

        render(&mut state, &scene);

        assert!(calls_with("draw_elements").is_empty());
    }

    #[test]
    fn sorts_blended_subsets_back_to_front_by_camera_depth() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let blended = material_ref(standard(MaterialAlphaMode::Blend));
        // Far (z=-3) and near (z=-1): the far mesh draws first in the blended pass.
        let near_mesh = add_box(&scene, blended.clone());
        let far_mesh = add_box(&scene, blended);
        far_mesh.write().unwrap().position.z = -3.0;
        near_mesh.write().unwrap().position.z = -1.0;
        let far: NodeRef = far_mesh;
        let near: NodeRef = near_mesh;
        invalidate_node_local_transform(&far);
        invalidate_node_local_transform(&near);

        render(&mut state, &scene);

        let order = blended_meshes(&state);
        assert!(Arc::ptr_eq(&order[0], &far));
        assert!(Arc::ptr_eq(&order[1], &near));
    }

    #[test]
    fn sorts_blended_subsets_back_to_front_with_an_orthographic_camera() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let blended = material_ref(standard(MaterialAlphaMode::Blend));
        let near_mesh = add_box(&scene, blended.clone());
        let far_mesh = add_box(&scene, blended);
        far_mesh.write().unwrap().position.z = -3.0;
        near_mesh.write().unwrap().position.z = -1.0;
        let far: NodeRef = far_mesh;
        let near: NodeRef = near_mesh;
        invalidate_node_local_transform(&far);
        invalidate_node_local_transform(&near);
        let mut camera = create_camera_3d();
        camera.far = 100.0;
        camera.near = 0.1;
        let projection = create_orthographic_projection();
        {
            let mut value = projection.write().unwrap();
            value.half_height = 1.0;
            value.half_width = 1.0;
        }
        camera.projection = Projection::Orthographic(projection);
        set_camera_3d_view_matrix4_from_look_at(
            &mut camera,
            &create_vector3(0.0, 0.0, 5.0),
            &create_vector3(0.0, 0.0, 0.0),
            &create_vector3(0.0, 1.0, 0.0),
        );
        let pass = make_test_pass(&state);

        render_gl_scene3d(&mut state, &pass, None, &scene, &camera, &make_test_lights(), None);

        let order = blended_meshes(&state);
        assert!(Arc::ptr_eq(&order[0], &far));
        assert!(Arc::ptr_eq(&order[1], &near));
    }

    #[test]
    fn draws_a_particle_emitter3d_node_in_the_scene_via_the_single_render_gl_scene3d_call() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        register_gl_particle_emitter3d_pass(&mut state);
        let scene = make_test_scene();
        // An emitter carries no geometry, so it never appears in the visible-mesh list; the registered
        // emitter pass is the only drawElementsInstanced caller.
        let emitter: NodeRef = make_emitter(2);
        flight_node::add_node_child(&scene, &emitter);

        render(&mut state, &scene);

        assert!(!calls_with("draw_elements_instanced").is_empty());
    }

    #[test]
    fn draws_no_emitter_pass_when_the_particle_pass_is_not_registered() {
        // The tree-shaking contract: an unregistered pass is not dispatched at all.
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let emitter: NodeRef = make_emitter(2);
        flight_node::add_node_child(&scene, &emitter);

        render(&mut state, &scene);

        assert!(calls_with("draw_elements_instanced").is_empty());
    }

    #[test]
    fn does_not_draw_an_instanced_particle_pass_when_the_scene_has_no_emitters() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        add_box(&scene, material_ref(create_standard_pbr_material()));

        render(&mut state, &scene);

        assert!(calls_with("draw_elements_instanced").is_empty());
    }

    // The colour palette is one linear RGBA texel per instance, uploaded beside the matrix palette; an
    // uncoloured instance uploads opaque white so the unconditional multiply is an identity.
    #[test]
    fn uploads_each_instance_colour_as_a_linear_texel_defaulting_to_opaque_white() {
        let mut state = make_gl_scene3d_state();
        register_gl_standard_pbr_material(&mut state);
        let scene = make_test_scene();
        let mesh = create_instanced_mesh(
            Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
            Arc::new(RwLock::new(vec![Some(material_ref(create_standard_pbr_material()))])),
            Some(8),
        );
        set_instanced_mesh_instance_count(&mesh, 2);
        set_instanced_mesh_instance_matrix(&mesh, 0, &create_matrix4());
        set_instanced_mesh_instance_matrix(&mesh, 1, &create_matrix4());
        set_instanced_mesh_instance_color(&mesh, 0, 0xff00_00ff);
        let node: NodeRef = mesh;
        flight_node::add_node_child(&scene, &node);

        render(&mut state, &scene);

        // Two instances at one texel each; the matrix palette uploads eight, so select by width.
        let upload = calls_with("tex_image_2d")
            .into_iter()
            .filter(|call| call.integers[3] == 2)
            .last()
            .unwrap();
        let texels = bytes_as_f32(&upload.bytes);
        assert_eq!(texels[0..4].to_vec(), vec![1.0, 0.0, 0.0, 1.0]);
        assert_eq!(texels[4..8].to_vec(), vec![1.0, 1.0, 1.0, 1.0]);
    }
}
