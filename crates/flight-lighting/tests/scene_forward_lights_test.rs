use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{BoundingSphere, create_bounding_sphere, create_vector3};
use flight_lighting::contract::*;

// flight-lint: allow-file(test-default-call) D12 scene options and selection output are plain records with no create factory

fn bounds() -> BoundingSphere {
    return create_bounding_sphere(0.0, 0.0, 0.0, 0.0);
}

fn point(x: f32) -> Ref<PointLight> {
    return Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
        position: Some(create_vector3(x, 0.0, 0.0)),
        range: Some(-1.0),
        ..crate::point_options()
    }))));
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
    return create_scene_3d_lights(Some(&Scene3DLightsOptions {
        point: Some(points),
        spot: Some(spots),
        ..crate::scene_options()
    }));
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
                Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
                    color: Some(0x8080_80ff),
                    position: Some(create_vector3(2.0, 0.0, 0.0)),
                    ..crate::point_options()
                }))))
            })
            .collect();
        let white = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            color: Some(0xffff_ffff),
            intensity: Some(0.3),
            position: Some(create_vector3(2.0, 0.0, 0.0)),
            ..crate::point_options()
        }))));
        let mut points = gray;
        points.push(white.clone());
        let mut out = crate::selection();
        select_scene_3d_forward_lights(&mut out, &scene(points, vec![]), &bounds(), None);
        assert!(out.point.iter().any(|item| Arc::ptr_eq(item, &white)));

        let key = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            intensity: Some(1.0),
            priority: Some(1.0),
            ..crate::point_options()
        }))));
        let bright = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            intensity: Some(50.0),
            ..crate::point_options()
        }))));
        select_scene_3d_forward_lights(
            &mut out,
            &scene(vec![bright, key.clone()], vec![]),
            &bounds(),
            None,
        );
        assert!(Arc::ptr_eq(&out.point[0], &key));

        let inverse_square = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            decay: Some(2.0),
            position: Some(create_vector3(4.0, 0.0, 0.0)),
            ..crate::point_options()
        }))));
        let linear = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            decay: Some(1.0),
            position: Some(create_vector3(4.0, 0.0, 0.0)),
            ..crate::point_options()
        }))));
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
        let hidden = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            intensity: Some(100.0),
            layer_mask: Some(0b10),
            ..crate::point_options()
        }))));
        let visible = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            layer_mask: Some(0b01),
            ..crate::point_options()
        }))));
        let disabled = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            enabled: Some(false),
            intensity: Some(100.0),
            ..crate::point_options()
        }))));
        let negative = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            intensity: Some(-1.0),
            ..crate::point_options()
        }))));
        let nan = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            intensity: Some(f32::NAN),
            ..crate::point_options()
        }))));
        let outside = Arc::new(RwLock::new(create_point_light(Some(&PointLightOptions {
            position: Some(create_vector3(10.0, 0.0, 0.0)),
            range: Some(2.0),
            ..crate::point_options()
        }))));
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
