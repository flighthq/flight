use std::sync::{Arc, RwLock};

use flight_geometry::create_vector3;
use flight_lighting::{
    SCENE_LIGHT_POINT_OFFSET, Scene3DLightBlock, SpotLightOptions, create_point_light,
    create_scene_3d_lights, create_spot_light,
};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::invalidate_node_local_transform;
use flight_render::prepare_scene_3d_render;
use flight_scene3d_wgpu::contract::*;

use crate::support::*;

fn camera() -> flight_camera::Camera3D {
    return make_test_look_at_camera(
        std::f32::consts::PI / 2.0,
        [4.0, 0.0, 20.0],
        [4.0, 0.0, 0.0],
    );
}

fn point_light(x: f32, y: f32) -> flight_entity::Ref<flight_lighting::PointLight> {
    let mut light = create_point_light();
    light.position = create_vector3(x, y, 0.0);
    light.range = -1.0;
    return Arc::new(RwLock::new(light));
}

fn clustered_lights() -> flight_lighting::Scene3DLights {
    let mut lights = create_scene_3d_lights();
    lights.point = [8.0, 8.0, 8.0, 8.0, 0.0, 0.0, 0.0, 0.0]
        .iter()
        .enumerate()
        .map(|(index, x)| point_light(*x, (index % 4) as f32))
        .collect();
    return lights;
}

mod prepare_wgpu_scene3d_forward_lights {
    use super::*;

    #[test]
    fn packs_independent_four_light_point_and_spot_budgets() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = create_test_scene_root();
        add_test_child(
            &scene,
            &create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new()),
        );
        let mut lights = create_scene_3d_lights();
        lights.point = (0..6)
            .map(|index| point_light(index as f32 + 1.0, 0.0))
            .collect();
        lights.spot = (0..6)
            .map(|index| {
                Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
                    direction: Some(create_vector3(-1.0, 0.0, 0.0)),
                    inner_cone_degrees: Some(45.0),
                    outer_cone_degrees: Some(60.0),
                    position: Some(create_vector3(index as f32 + 1.0, 0.0, 0.0)),
                    range: Some(-1.0),
                    ..test_default()
                }))))
            })
            .collect();
        let camera = camera();
        let list = {
            let list = prepare_scene_3d_render(&mut test.state, &scene, &camera, &lights, None);
            clone_render_list(list)
        };

        let mut prepared = empty_list();
        prepare_wgpu_scene3d_forward_lights(&mut prepared, &mut test.state, &list, &lights);

        let block = prepared.mesh_light_blocks[0].read().unwrap();
        assert_eq!(block.point_count, 4);
        assert_eq!(block.spot_count, 4);
    }

    #[test]
    fn selects_per_visible_mesh_deduplicates_tuples_and_reuses_scratch() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = create_test_scene_root();
        let near_a = create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new());
        let near_b = create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new());
        near_b.write().unwrap().position.x = 0.1;
        let far = create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new());
        far.write().unwrap().position.x = 8.0;
        add_test_child(&scene, &near_a);
        let near_b_node = add_test_child(&scene, &near_b);
        let far_node = add_test_child(&scene, &far);
        invalidate_node_local_transform(&near_b_node);
        invalidate_node_local_transform(&far_node);
        let lights = clustered_lights();
        let camera = camera();
        let list = {
            let list = prepare_scene_3d_render(&mut test.state, &scene, &camera, &lights, None);
            clone_render_list(list)
        };
        let mut first = empty_list();
        prepare_wgpu_scene3d_forward_lights(&mut first, &mut test.state, &list, &lights);
        let blocks = first.mesh_light_blocks.clone();

        assert_eq!(first.mesh_count, 3);
        assert!(Arc::ptr_eq(&blocks[0], &blocks[1]));
        assert!(!Arc::ptr_eq(&blocks[0], &blocks[2]));
        assert_eq!(
            blocks[0].read().unwrap().data[SCENE_LIGHT_POINT_OFFSET],
            0.0
        );
        assert_eq!(
            blocks[2].read().unwrap().data[SCENE_LIGHT_POINT_OFFSET],
            8.0
        );
        // The state-owned scratch is reused: a second preparation hands back the same blocks.
        let mut second = empty_list();
        prepare_wgpu_scene3d_forward_lights(&mut second, &mut test.state, &list, &lights);
        for (index, block) in second.mesh_light_blocks.iter().enumerate() {
            assert!(Arc::ptr_eq(block, &blocks[index]));
        }
    }

    // D24: one caller-owned out is cleared, then filled, on every call; stale entries never survive.
    #[test]
    fn clears_then_fills_one_caller_owned_out_across_two_calls() {
        let mut test = make_wgpu_scene3d_state(None);
        let scene = create_test_scene_root();
        let near = create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new());
        let far = create_test_mesh(create_box_mesh_geometry(None, None, None), Vec::new());
        far.write().unwrap().position.x = 8.0;
        add_test_child(&scene, &near);
        let far_node = add_test_child(&scene, &far);
        invalidate_node_local_transform(&far_node);
        let lights = clustered_lights();
        let camera = camera();
        let list = {
            let list = prepare_scene_3d_render(&mut test.state, &scene, &camera, &lights, None);
            clone_render_list(list)
        };
        let mut out = empty_list();
        out.mesh_count = 99;
        out.mesh_light_blocks
            .push(Arc::new(RwLock::new(Scene3DLightBlock {
                ambient_count: 0,
                data: vec![0.0_f32; 4].into_boxed_slice(),
                directional_count: 0,
                hemisphere_count: 0,
                point_count: 0,
                spot_count: 0,
                version: 0,
            })));

        prepare_wgpu_scene3d_forward_lights(&mut out, &mut test.state, &list, &lights);
        assert_eq!(out.mesh_count, 2);
        assert_eq!(out.mesh_light_blocks.len(), 2);
        let first = out.mesh_light_blocks.clone();
        let blocks_ptr = out.mesh_light_blocks.as_ptr();

        prepare_wgpu_scene3d_forward_lights(&mut out, &mut test.state, &list, &lights);
        assert_eq!(out.mesh_count, 2);
        assert_eq!(out.mesh_light_blocks.len(), 2);
        assert_eq!(out.mesh_light_blocks.as_ptr(), blocks_ptr);
        assert!(Arc::ptr_eq(&out.mesh_light_blocks[0], &first[0]));
        assert!(Arc::ptr_eq(&out.mesh_light_blocks[1], &first[1]));
        assert!(!Arc::ptr_eq(
            &out.mesh_light_blocks[0],
            &out.mesh_light_blocks[1]
        ));
    }
}

fn empty_list() -> WgpuScene3DForwardLightList {
    return WgpuScene3DForwardLightList {
        mesh_count: 0,
        mesh_light_blocks: Vec::new(),
    };
}

fn clone_render_list(list: &flight_render::Scene3DRenderList) -> flight_render::Scene3DRenderList {
    return flight_render::Scene3DRenderList {
        instanced_mesh_count: list.instanced_mesh_count,
        lights: list.lights.clone(),
        mesh_count: list.mesh_count,
        view_projection: list.view_projection.clone(),
        visible_instanced_meshes: list.visible_instanced_meshes.clone(),
        visible_meshes: list.visible_meshes.clone(),
    };
}
