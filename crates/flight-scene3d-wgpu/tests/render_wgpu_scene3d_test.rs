use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{Matrix4, create_matrix4};
use flight_materials::contract::create_standard_pbr_material;
use flight_materials::{BLEND_MODE_ADD, Material3DRef, MaterialAlphaMode};
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU16, MeshGeometryOptions,
    create_box_mesh_geometry, create_mesh_geometry,
};
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_render_wgpu::*;
use flight_scene3d::{
    Skeleton3D, Skin, create_instanced_mesh, set_instanced_mesh_instance_color,
    set_instanced_mesh_instance_count, set_instanced_mesh_instance_matrix,
};
use flight_scene3d_wgpu::*;

use crate::support::*;

fn make_camera() -> flight_camera::Camera3D {
    return make_test_look_at_camera(std::f32::consts::PI / 3.0, [0.0, 0.0, 5.0], [0.0, 0.0, 0.0]);
}

fn pbr() -> Material3DRef {
    return share_test_material(create_standard_pbr_material());
}

fn blended_pbr() -> Material3DRef {
    let mut material = create_standard_pbr_material();
    material.alpha_mode = MaterialAlphaMode::Blend;
    return share_test_material(material);
}

fn instance_translation(x: f32) -> Matrix4 {
    let mut matrix = create_matrix4();
    matrix.m[12] = x;
    return matrix;
}

fn render(test: &mut WgpuScene3DTestState, scene: &NodeRef, camera: &flight_camera::Camera3D) {
    let lights = make_test_scene_lights();
    let mut pass = get_wgpu_active_render_pass_handle(&mut test.state).unwrap();
    render_wgpu_scene3d(&mut pass, scene, camera, &lights, None);
}

fn opaque_meshes(test: &mut WgpuScene3DTestState) -> Vec<NodeRef> {
    return get_wgpu_scene3d_runtime(&mut test.state)
        .opaque_draw_list
        .iter()
        .map(|entry| entry.mesh.clone().unwrap())
        .collect();
}

fn blended_meshes(test: &mut WgpuScene3DTestState) -> Vec<NodeRef> {
    return get_wgpu_scene3d_runtime(&mut test.state)
        .blended_draw_list
        .iter()
        .map(|entry| entry.mesh.clone().unwrap())
        .collect();
}

fn same_nodes(actual: &[NodeRef], expected: &[&NodeRef]) -> bool {
    return actual.len() == expected.len()
        && actual
            .iter()
            .zip(expected.iter())
            .all(|(a, b)| Arc::ptr_eq(a, b));
}

fn pipeline_keys(test: &mut WgpuScene3DTestState) -> Vec<String> {
    return get_wgpu_scene3d_runtime(&mut test.state)
        .pipeline_cache
        .keys()
        .cloned()
        .collect();
}

fn count_mesh_buffers(test: &WgpuScene3DTestState) -> usize {
    return test
        .buffers()
        .iter()
        .filter(|buffer| {
            buffer
                .usage
                .intersects(wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::INDEX)
        })
        .count();
}

mod is_wgpu_mesh_gpu_skinned {
    use super::*;

    #[test]
    fn selects_gpu_skinning_only_for_a_skin_plus_joints0_and_weights0_geometry() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_gpu_skinning(&mut test.state);
        let rigid = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]);
        assert!(!is_wgpu_mesh_gpu_skinned(&mut test.state, &rigid.read().unwrap()));

        let skinned = create_test_mesh(
            create_mesh_geometry(MeshGeometryOptions {
                vertices: vec![0.0; 20].into_boxed_slice(),
                layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
                indices: Some(IndexBuffer::U16(IndexBufferU16 {
                    data: Arc::new(RwLock::new(vec![0, 0, 0].into_boxed_slice())),
                })),
                subsets: None,
                topology: None,
            }),
            vec![Some(pbr())],
        );
        let skeleton: Ref<Skeleton3D> = Arc::new(RwLock::new(flight_entity::allocate_entity()));
        skinned.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
            skeleton,
            skeleton_root: None,
        })));
        assert!(is_wgpu_mesh_gpu_skinned(&mut test.state, &skinned.read().unwrap()));
    }
}

mod render_wgpu_scene3d {
    use super::*;

    #[test]
    fn uploads_one_shared_geometry_once_across_a_primary_and_derived_state_on_the_same_device() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let WgpuOffscreenRenderStateResult::Ok(derived) = create_wgpu_offscreen_render_state(&test.state)
        else {
            panic!("the device is alive");
        };
        let mut derived = derived.state;
        register_wgpu_standard_pbr_material(&mut derived);

        let scene = create_test_scene_root();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]));
        let mesh_buffers_before = count_mesh_buffers(&test);

        render(&mut test, &scene, &make_camera());
        let lights = make_test_scene_lights();
        let camera = make_camera();
        with_wgpu_frame_borrow(&mut test.state, &mut derived, |derived| {
            let mut pass = get_wgpu_active_render_pass_handle(derived).unwrap();
            render_wgpu_scene3d(&mut pass, &scene, &camera, &lights, None);
        });

        // 2 geometry buffers (vertex + index, shared across states) + 2 per-state instance buffers.
        assert_eq!(count_mesh_buffers(&test), mesh_buffers_before + 4);
    }

    #[test]
    fn draws_each_visible_mesh_subset_with_its_registered_material_renderer() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]));

        render(&mut test, &scene, &make_camera());

        assert!(test.count("setPipeline") > 0);
        assert!(test.count("drawIndexed") > 0);
        submit_test_frame(&mut test);
    }

    #[test]
    fn skips_a_subset_whose_material_has_no_registered_renderer() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = create_test_scene_root();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]));

        render(&mut test, &scene, &make_camera());

        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn binds_once_for_a_run_of_subsets_sharing_a_material() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let material = pbr();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material.clone())]));
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material)]));

        render(&mut test, &scene, &make_camera());

        // Same material across both meshes: pipeline bound once, drawn twice.
        assert_eq!(test.count("setPipeline"), 1);
        assert_eq!(test.count("drawIndexed"), 2);
        submit_test_frame(&mut test);
    }

    #[test]
    fn does_not_draw_a_disabled_mesh() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let mesh = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]);
        mesh.write().unwrap().enabled = false;
        add_test_child(&scene, &mesh);

        render(&mut test, &scene, &make_camera());

        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn partitions_opaque_and_blended_subsets_into_distinct_pipeline_runs() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let blended = add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(blended_pbr())]));
        let opaque = add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]));

        render(&mut test, &scene, &make_camera());

        assert!(same_nodes(&opaque_meshes(&mut test), &[&opaque]));
        assert!(same_nodes(&blended_meshes(&mut test), &[&blended]));
        let keys = pipeline_keys(&mut test);
        assert!(keys.iter().any(|key| key.ends_with("|opaque|rigid|direct")));
        assert!(keys.iter().any(|key| key.ends_with("|blend:Normal|rigid|direct")));
        submit_test_frame(&mut test);
    }

    #[test]
    fn selects_a_pipeline_variant_keyed_by_the_surface_material_blend_mode() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let mut material = create_standard_pbr_material();
        material.alpha_mode = MaterialAlphaMode::Blend;
        material.blend_mode = BLEND_MODE_ADD.to_string();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(share_test_material(material))]));

        render(&mut test, &scene, &make_camera());

        assert!(pipeline_keys(&mut test)
            .iter()
            .any(|key| key.ends_with("|blend:Add|rigid|direct")));
    }

    // Pipeline identity is the blend mode alone: one premultiplied blend state per mode.
    #[test]
    fn keys_a_blended_pipeline_variant_by_blend_mode_alone() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(blended_pbr())]));

        render(&mut test, &scene, &make_camera());

        let keys = pipeline_keys(&mut test);
        assert!(keys.iter().any(|key| key.ends_with("|blend:Normal|rigid|direct")));
        assert!(!keys
            .iter()
            .any(|key| key.contains("straight") || key.contains("premultiplied")));
    }

    #[test]
    fn routes_resolved_node_alpha_through_the_blended_pass_and_draw_proxy() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let mesh = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]);
        mesh.write().unwrap().alpha = 0.5;
        add_test_child(&scene, &mesh);

        render(&mut test, &scene, &make_camera());

        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert!(runtime.opaque_draw_list.is_empty());
        assert!((runtime.blended_draw_list[0].alpha - 0.5).abs() < 1e-6);
        assert!(pipeline_keys(&mut test)
            .iter()
            .any(|key| key.ends_with("|blend:Normal|rigid|direct")));
    }

    #[test]
    fn sorts_blended_subsets_back_to_front_by_projected_depth() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let material = blended_pbr();
        let far = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material.clone())]);
        let near = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material)]);
        far.write().unwrap().position.z = -3.0;
        near.write().unwrap().position.z = -1.0;
        let near = add_test_child(&scene, &near);
        let far = add_test_child(&scene, &far);
        invalidate_node_local_transform(&far);
        invalidate_node_local_transform(&near);

        render(&mut test, &scene, &make_camera());

        assert!(same_nodes(&blended_meshes(&mut test), &[&far, &near]));
    }

    #[test]
    fn sorts_blended_subsets_back_to_front_with_an_orthographic_camera() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let material = blended_pbr();
        let far = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material.clone())]);
        let near = create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(material)]);
        far.write().unwrap().position.z = -3.0;
        near.write().unwrap().position.z = -1.0;
        let near = add_test_child(&scene, &near);
        let far = add_test_child(&scene, &far);
        invalidate_node_local_transform(&far);
        invalidate_node_local_transform(&near);
        let mut camera = make_camera();
        let projection = flight_camera::create_orthographic_projection();
        {
            let mut projection = projection.write().unwrap();
            projection.half_height = 1.0;
            projection.half_width = 1.0;
        }
        camera.projection = flight_camera::Projection::Orthographic(projection);

        render(&mut test, &scene, &camera);

        assert!(same_nodes(&blended_meshes(&mut test), &[&far, &near]));
    }

    // Rust draw records are pooled values, so reuse is observed as the pools draining back into the
    // lists rather than as object identity.
    #[test]
    fn reuses_opaque_and_blended_draw_records_across_frames() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let opaque = add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(pbr())]));
        let blended = add_test_child(&scene, &create_test_mesh(create_box_mesh_geometry(None, None, None), vec![Some(blended_pbr())]));
        let camera = make_camera();

        render(&mut test, &scene, &camera);
        render(&mut test, &scene, &camera);

        assert!(same_nodes(&opaque_meshes(&mut test), &[&opaque]));
        assert!(same_nodes(&blended_meshes(&mut test), &[&blended]));
        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert!(runtime.opaque_pool.is_empty());
        assert!(runtime.blended_pool.is_empty());
    }

    #[test]
    fn draws_a_particle_emitter3d_node_in_the_scene_via_the_single_render_wgpu_scene3d_call() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_particle_emitter3d_pass(&mut test.state);
        let scene = create_test_scene_root();
        add_test_child(&scene, &make_particle_emitter(3));

        render(&mut test, &scene, &make_camera());

        let draws = test.draws_indexed();
        assert!(!draws.is_empty());
        assert_eq!(draws[0].index_count, 6);
        assert_eq!(draws[0].instance_count, 3);
        submit_test_frame(&mut test);
    }

    // The instance record is matrix-then-linear-RGBA; an uncoloured instance uploads opaque white.
    #[test]
    fn packs_each_instance_colour_into_the_tail_of_its_instance_record() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        let mesh = create_instanced_mesh(
            Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
            Arc::new(RwLock::new(vec![Some(pbr())])),
            Some(8),
        );
        set_instanced_mesh_instance_count(&mesh, 2);
        set_instanced_mesh_instance_matrix(&mesh, 0, &instance_translation(0.0));
        set_instanced_mesh_instance_matrix(&mesh, 1, &instance_translation(1.0));
        set_instanced_mesh_instance_color(&mesh, 0, 0xff0000ff);
        add_test_child(&scene, &mesh);

        render(&mut test, &scene, &make_camera());

        // Select the instance upload by its exact byte size: two 80-byte records.
        let write = test
            .buffer_writes()
            .into_iter()
            .find(|write| write.data.len() == 2 * 80)
            .unwrap();
        let record = bytes_to_f32(&write.data);
        assert_eq!(&record[16..20], &[1.0, 0.0, 0.0, 1.0]);
        assert_eq!(&record[36..40], &[1.0, 1.0, 1.0, 1.0]);
        submit_test_frame(&mut test);
    }

    #[test]
    fn gives_each_instanced_mesh_in_a_frame_its_own_instance_buffer() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_standard_pbr_material(&mut test.state);
        let scene = create_test_scene_root();
        for x in [0.0, 0.5] {
            let mesh = create_instanced_mesh(
                Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
                Arc::new(RwLock::new(vec![Some(pbr())])),
                Some(8),
            );
            set_instanced_mesh_instance_count(&mesh, 1);
            set_instanced_mesh_instance_matrix(&mesh, 0, &instance_translation(x));
            add_test_child(&scene, &mesh);
        }

        render(&mut test, &scene, &make_camera());

        let bound: Vec<wgpu::Buffer> = test
            .set_vertex_buffers()
            .into_iter()
            .filter(|set| set.slot == 1)
            .map(|set| set.buffer)
            .collect();
        assert_eq!(bound.len(), 2);
        assert_ne!(bound[0], bound[1]);
    }
}

fn make_particle_emitter(count: usize) -> Ref<flight_particleemitter::ParticleEmitter3D> {
    let emitter = flight_particleemitter::create_particle_emitter_3d();
    flight_particleemitter::reserve_particle_emitter_3d(&emitter, count);
    {
        let mut guard = emitter.write().unwrap();
        let data = &mut guard.data;
        data.particle_count = count;
        for index in 0..count {
            let tt = index * 4;
            data.transforms[tt] = index as f32;
            data.transforms[tt + 1] = index as f32;
            data.transforms[tt + 2] = 0.0;
            data.transforms[tt + 3] = 1.0;
            data.positions_z[index] = 0.0;
            data.alphas[index] = 1.0;
            let ct = index * 3;
            data.colors[ct] = 1.0;
            data.colors[ct + 1] = 1.0;
            data.colors[ct + 2] = 1.0;
            data.ids[index] = 0;
        }
    }
    return emitter;
}
