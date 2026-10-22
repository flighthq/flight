use std::rc::Rc;
use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, set_camera_3d_view_matrix4_from_look_at};
use flight_geometry::create_vector3;
use flight_lighting::{
    SCENE_LIGHT_POINT_OFFSET, Scene3DLightsLike, SpotLightOptions, create_point_light,
    create_scene_3d_lights, create_spot_light,
};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render::prepare_scene_3d_render;
use flight_render_gl::GlRenderState;
use flight_scene3d_gl::*;

use crate::gl_test_helper::{add_test_mesh, make_gl_scene3d_state, make_test_camera, make_test_scene, test_default};

fn camera() -> Camera3D {
    let mut result = make_test_camera();
    if let Projection::Perspective(projection) = &result.projection {
        projection.write().unwrap().fov_y = std::f32::consts::PI / 2.0;
    }
    set_camera_3d_view_matrix4_from_look_at(
        &mut result,
        &create_vector3(4.0, 0.0, 20.0),
        &create_vector3(4.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    return result;
}

fn point_light(x: f32, y: f32, z: f32) -> flight_entity::Ref<flight_lighting::PointLight> {
    let mut light = create_point_light();
    light.position = create_vector3(x, y, z);
    light.range = -1.0;
    return Arc::new(RwLock::new(light));
}

fn clustered_lights() -> Scene3DLightsLike {
    let mut lights = create_scene_3d_lights();
    lights.point = vec![
        point_light(8.0, 0.0, 0.0),
        point_light(8.0, 1.0, 0.0),
        point_light(8.0, -1.0, 0.0),
        point_light(8.0, 0.0, 1.0),
        point_light(0.0, 0.0, 0.0),
        point_light(0.0, 1.0, 0.0),
        point_light(0.0, -1.0, 0.0),
        point_light(0.0, 0.0, 1.0),
    ];
    return lights;
}

// TS `prepareGlScene3DForwardLights(state, prepareScene3DRender(state, …), lights)`: the render list is
// state-owned, so it is lent out of the state for the duration of the call.
fn prepare(
    state: &mut GlRenderState,
    scene: &flight_node::NodeRef,
    view: &Camera3D,
    lights: &Scene3DLightsLike,
) -> GlScene3DForwardLightList {
    prepare_scene_3d_render(state, scene, view, lights, None);
    let prepared = state.runtime.prepared_scene3d.take().unwrap();
    let out = prepare_gl_scene3d_forward_lights(state, &prepared.list, lights);
    state.runtime.prepared_scene3d = Some(prepared);
    return out;
}

mod prepare_gl_scene3d_forward_lights {
    use super::*;

    #[test]
    fn packs_four_selected_points_and_four_selected_spots_from_independent_family_budgets() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_test_mesh(&scene, create_box_mesh_geometry(None, None, None), Vec::new());
        let mut lights = create_scene_3d_lights();
        lights.point = (0..6).map(|index| point_light(index as f32 + 1.0, 0.0, 0.0)).collect();
        lights.spot = (0..6)
            .map(|index| {
                return Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
                    direction: Some(create_vector3(-1.0, 0.0, 0.0)),
                    inner_cone_degrees: Some(45.0),
                    outer_cone_degrees: Some(60.0),
                    position: Some(create_vector3(index as f32 + 1.0, 0.0, 0.0)),
                    range: Some(-1.0),
                    ..test_default()
                }))));
            })
            .collect();
        let selected = prepare(&mut state, &scene, &camera(), &lights);
        let block = &selected.mesh_light_blocks[0];
        assert_eq!(block.point_count, 4);
        assert_eq!(block.spot_count, 4);
    }

    #[test]
    fn selects_punctual_lights_per_visible_mesh_and_deduplicates_identical_tuples() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_test_mesh(&scene, create_box_mesh_geometry(None, None, None), Vec::new());
        let near_b = add_test_mesh(&scene, create_box_mesh_geometry(None, None, None), Vec::new());
        near_b.write().unwrap().position.x = 0.1;
        let far = add_test_mesh(&scene, create_box_mesh_geometry(None, None, None), Vec::new());
        far.write().unwrap().position.x = 8.0;
        let lights = clustered_lights();

        let selected = prepare(&mut state, &scene, &camera(), &lights);

        assert_eq!(selected.mesh_count, 3);
        assert!(Rc::ptr_eq(&selected.mesh_light_blocks[0], &selected.mesh_light_blocks[1]));
        assert!(!Rc::ptr_eq(&selected.mesh_light_blocks[0], &selected.mesh_light_blocks[2]));
        assert_eq!(selected.mesh_light_blocks[0].point_count, 4);
        assert_eq!(selected.mesh_light_blocks[0].data[SCENE_LIGHT_POINT_OFFSET], 0.0);
        assert_eq!(selected.mesh_light_blocks[2].data[SCENE_LIGHT_POINT_OFFSET], 8.0);
    }

    #[test]
    fn reuses_its_list_mesh_array_and_packed_blocks_across_frames() {
        let mut state = make_gl_scene3d_state();
        let scene = make_test_scene();
        add_test_mesh(&scene, create_box_mesh_geometry(None, None, None), Vec::new());
        let lights = clustered_lights();
        let view = camera();
        let first = prepare(&mut state, &scene, &view, &lights);
        let block = first.mesh_light_blocks[0].clone();

        // The list is returned by value in Rust; the reused state-owned packed block keeps its identity.
        let second = prepare(&mut state, &scene, &view, &lights);
        assert_eq!(second.mesh_count, first.mesh_count);
        assert!(Rc::ptr_eq(&second.mesh_light_blocks[0], &block));
    }
}
