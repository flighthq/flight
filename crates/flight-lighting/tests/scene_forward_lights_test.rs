use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{BoundingSphere, create_bounding_sphere, create_vector3};
use flight_lighting::contract::*;

fn bounds() -> BoundingSphere {
    return create_bounding_sphere(0.0, 0.0, 0.0, 0.0);
}

fn point(x: f32) -> Ref<PointLight> {
    let mut light = create_point_light();
    light.position = create_vector3(x, 0.0, 0.0);
    return Arc::new(RwLock::new(light));
}

fn spot(x: f32) -> Ref<SpotLight> {
    return Arc::new(RwLock::new(create_spot_light(Some(&SpotLightOptions {
        direction: Some(create_vector3(-1.0, 0.0, 0.0)),
        inner_cone_degrees: Some(45.0),
        outer_cone_degrees: Some(60.0),
        position: Some(create_vector3(x, 0.0, 0.0)),
        range: Some(-1.0),
        ..crate::spot_options()
    }))));
}

fn scene(points: Vec<Ref<PointLight>>, spots: Vec<Ref<SpotLight>>) -> Scene3DLights {
    let mut out = create_scene_3d_lights();
    out.point = points;
    out.spot = spots;
    return out;
}

mod select_scene_3d_forward_lights {
    use super::*;

    #[test]
    fn applies_independent_family_caps_and_stable_indices() {
        let points: Vec<_> = [8.0, 7.0, 6.0, 5.0, 4.0, 3.0]
            .into_iter()
            .map(point)
            .collect();
        let spots: Vec<_> = [8.0, 7.0, 6.0, 5.0, 4.0, 3.0]
            .into_iter()
            .map(spot)
            .collect();
        let lights = scene(points.clone(), spots.clone());
        let mut out = crate::selection();
        select_scene_3d_forward_lights(&mut out, &lights, &bounds(), None);
        assert_eq!(out.point.len(), MAX_FORWARD_LIGHTS);
        assert_eq!(out.spot.len(), MAX_FORWARD_LIGHTS);
        assert_eq!(out.indices, vec![5, 4, 3, 2, !5, !4, !3, !2]);
        assert!(Arc::ptr_eq(&out.point[0], &points[5]));
        assert!(Arc::ptr_eq(&out.spot[0], &spots[5]));
    }

    #[test]
    fn preserves_input_order_for_equal_scores() {
        let points: Vec<_> = (0..6).map(|_| point(2.0)).collect();
        let lights = scene(points.clone(), Vec::new());
        let mut out = crate::selection();
        select_scene_3d_forward_lights(&mut out, &lights, &bounds(), None);
        assert_eq!(out.indices, vec![0, 1, 2, 3]);
        for (actual, expected) in out.point.iter().zip(&points) {
            assert!(Arc::ptr_eq(actual, expected));
        }
    }

    #[test]
    fn ranks_linear_luminance_decay_and_priority() {
        let gray: Vec<_> = (0..4)
            .map(|_| {
                let mut light = create_point_light();
                light.color = 0x8080_80ff;
                light.position = create_vector3(2.0, 0.0, 0.0);
                Arc::new(RwLock::new(light))
            })
            .collect();
        let mut white_value = create_point_light();
        white_value.color = 0xffff_ffff;
        white_value.intensity = 0.3;
        white_value.position = create_vector3(2.0, 0.0, 0.0);
        let white = Arc::new(RwLock::new(white_value));
        let mut points = gray;
        points.push(white.clone());
        let mut out = crate::selection();
        select_scene_3d_forward_lights(&mut out, &scene(points, vec![]), &bounds(), None);
        assert!(out.point.iter().any(|item| Arc::ptr_eq(item, &white)));

        let mut key_value = create_point_light();
        key_value.intensity = 1.0;
        key_value.priority = 1.0;
        let key = Arc::new(RwLock::new(key_value));
        let mut bright_value = create_point_light();
        bright_value.intensity = 50.0;
        let bright = Arc::new(RwLock::new(bright_value));
        select_scene_3d_forward_lights(
            &mut out,
            &scene(vec![bright, key.clone()], vec![]),
            &bounds(),
            None,
        );
        assert!(Arc::ptr_eq(&out.point[0], &key));

        let mut inverse_square_value = create_point_light();
        inverse_square_value.decay = 2.0;
        inverse_square_value.position = create_vector3(4.0, 0.0, 0.0);
        let inverse_square = Arc::new(RwLock::new(inverse_square_value));
        let mut linear_value = create_point_light();
        linear_value.decay = 1.0;
        linear_value.position = create_vector3(4.0, 0.0, 0.0);
        let linear = Arc::new(RwLock::new(linear_value));
        select_scene_3d_forward_lights(
            &mut out,
            &scene(
                vec![
                    point(1.0),
                    point(2.0),
                    point(3.0),
                    inverse_square.clone(),
                    linear.clone(),
                ],
                vec![],
            ),
            &bounds(),
            None,
        );
        assert!(out.point.iter().any(|item| Arc::ptr_eq(item, &linear)));
        assert!(
            !out.point
                .iter()
                .any(|item| Arc::ptr_eq(item, &inverse_square))
        );
    }

    #[test]
    fn filters_layers_disabled_zero_negative_and_nan_contributions_before_ranking() {
        let mut hidden_value = create_point_light();
        hidden_value.intensity = 100.0;
        hidden_value.layer_mask = 0b10;
        let hidden = Arc::new(RwLock::new(hidden_value));
        let mut visible_value = create_point_light();
        visible_value.layer_mask = 0b01;
        let visible = Arc::new(RwLock::new(visible_value));
        let mut disabled_value = create_point_light();
        disabled_value.enabled = false;
        disabled_value.intensity = 100.0;
        let disabled = Arc::new(RwLock::new(disabled_value));
        let mut negative_value = create_point_light();
        negative_value.intensity = -1.0;
        let negative = Arc::new(RwLock::new(negative_value));
        let mut nan_value = create_point_light();
        nan_value.intensity = f32::NAN;
        let nan = Arc::new(RwLock::new(nan_value));
        let mut outside_value = create_point_light();
        outside_value.position = create_vector3(10.0, 0.0, 0.0);
        outside_value.range = 2.0;
        let outside = Arc::new(RwLock::new(outside_value));
        let lights = scene(
            vec![hidden, visible.clone(), disabled, negative, nan, outside],
            vec![],
        );
        let mut out = crate::selection();
        select_scene_3d_forward_lights(&mut out, &lights, &bounds(), Some(0b01));
        assert_eq!(out.point.len(), 1);
        assert!(Arc::ptr_eq(&out.point[0], &visible));
        assert_eq!(out.indices, vec![1]);
    }

    #[test]
    fn reads_candidates_before_replacing_reused_output_vectors() {
        let far = point(4.0);
        let near = point(1.0);
        let lights = scene(vec![far.clone(), near.clone()], vec![]);
        let mut out = Scene3DForwardLightSelection {
            indices: vec![99],
            point: vec![far],
            spot: vec![spot(3.0)],
        };
        select_scene_3d_forward_lights(&mut out, &lights, &bounds(), None);
        assert!(Arc::ptr_eq(&out.point[0], &near));
        assert_eq!(out.indices, vec![1, 0]);
        assert!(out.spot.is_empty());
    }
}
