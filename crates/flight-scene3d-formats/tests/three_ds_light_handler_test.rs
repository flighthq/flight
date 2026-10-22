use super::three_ds_test_helper::*;
use flight_geometry::{create_vector3, rotate_vector3_by_quaternion};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_lighting::{PointLight, SpotLight};
use flight_scene3d_formats::*;
use std::any::Any;
use std::sync::Arc;

fn float_bytes(values: &[f32]) -> Vec<u8> {
    return values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
}
fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.00001, "{a} != {b}");
}

mod parse_three_ds_light {
    use super::*;
    #[test]
    fn reads_position_direct_color_and_defaults_and_reports_truncation_without_losing_survivors() {
        let mut record = float_bytes(&[5.0, 10.0, 15.0]);
        record.extend_from_slice(&write_chunk(
            THREE_DS_COLOR_FLOAT,
            &float_bytes(&[1.0, 0.5, 0.0]),
        ));
        let chunk = write_chunk(THREE_DS_LIGHT, &record);
        let light = parse_three_ds_light(&chunk, 0, chunk.len(), "Lamp", None).unwrap();
        assert_eq!(light.position, [5.0, 10.0, 15.0]);
        assert_eq!(light.color, [1.0, 0.5, 0.0]);
        assert_eq!(light.name, "Lamp");
        assert_eq!(light.target, None);
        assert_eq!(light.multiplier, 1.0);
        assert_eq!(light.outer_range, None);
        let chunk = write_chunk(THREE_DS_LIGHT, &[0; 4]);
        let mut drops = Vec::new();
        assert!(parse_three_ds_light(&chunk, 0, chunk.len(), "Bad", Some(&mut drops)).is_none());
        assert_eq!(drops[0].value.kind, "3ds.light-truncated");
        assert_eq!(drops[0].value.severity, ImportDiagnosticSeverity::Drop);
        let mut record = vec![0; 12];
        record.extend_from_slice(&write_chunk(THREE_DS_LIGHT_SPOT, &[0; 12]));
        record.extend_from_slice(&[0; 6]);
        let chunk = write_chunk(THREE_DS_LIGHT, &record);
        let mut drops = Vec::new();
        let light =
            parse_three_ds_light(&chunk, 0, chunk.len(), "Partial", Some(&mut drops)).unwrap();
        assert_eq!(light.target, None);
        assert_eq!(
            drops
                .iter()
                .map(|entry| entry.value.kind.as_str())
                .collect::<Vec<_>>(),
            ["3ds.light-spot-truncated", "3ds.subchunk-exceeds-light"]
        );
    }
}

mod three_ds_light_handler {
    use super::*;
    #[test]
    fn family_owns_the_light_id_and_places_point_lights_with_local_descriptors() {
        assert_eq!(THREE_DS_LIGHT_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &THREE_DS_LIGHT_FAMILY[0],
            &THREE_DS_LIGHT_HANDLER
        ));
        assert_eq!(
            THREE_DS_LIGHT_HANDLER.read().unwrap().chunk_ids,
            [THREE_DS_LIGHT]
        );
        let mut record = float_bytes(&[1.0, 2.0, 3.0]);
        record.extend_from_slice(&write_chunk(
            THREE_DS_COLOR_FLOAT,
            &float_bytes(&[1.0, 0.5, 0.0]),
        ));
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_MULTIPLIER,
            &2.0f32.to_le_bytes(),
        ));
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_OUTER_RANGE,
            &40.0f32.to_le_bytes(),
        ));
        let bytes =
            build_minimal_three_ds(&[write_object_chunk("Omni01", THREE_DS_LIGHT, &record)]);
        let mut diagnostics = Vec::new();
        let document = parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_LIGHT_FAMILY);
            output
        });
        assert!(diagnostics.is_empty());
        assert_eq!(document.lights.len(), 1);
        assert!(document.nodes.is_empty());
        let light = &document.lights[0];
        let descriptor = light.descriptor.read().unwrap();
        let point = (&*descriptor as &dyn Any)
            .downcast_ref::<PointLight>()
            .unwrap();
        assert_eq!(light.name.as_deref(), Some("Omni01"));
        assert_eq!(point.intensity, 2.0);
        assert_eq!(point.range, 40.0);
        assert_eq!(point.color, 0xff8000ff);
        assert_eq!(
            (point.position.x, point.position.y, point.position.z),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(
            (
                light.transform.position.x,
                light.transform.position.y,
                light.transform.position.z
            ),
            (1.0, 3.0, -2.0)
        );
    }

    #[test]
    fn spot_aim_comes_from_placement_and_full_cone_apertures_become_half_angles() {
        let mut record = vec![0; 12];
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_SPOT,
            &float_bytes(&[0.0, 0.0, -10.0, 30.0, 60.0]),
        ));
        let bytes =
            build_minimal_three_ds(&[write_object_chunk("Spot01", THREE_DS_LIGHT, &record)]);
        let document = parse_three_ds_document_with_dispatch(&bytes, None, &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_LIGHT_FAMILY);
            output
        });
        let light = &document.lights[0];
        let descriptor = light.descriptor.read().unwrap();
        let spot = (&*descriptor as &dyn Any)
            .downcast_ref::<SpotLight>()
            .unwrap();
        assert_eq!(
            (spot.direction.x, spot.direction.y, spot.direction.z),
            (0.0, 0.0, -1.0)
        );
        close(
            spot.inner_cone_cos,
            (15.0f32 * flight_math::DEG_TO_RAD).cos(),
        );
        close(
            spot.outer_cone_cos,
            (30.0f32 * flight_math::DEG_TO_RAD).cos(),
        );
        assert!(spot.inner_cone_cos > spot.outer_cone_cos);
        let mut aim = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(
            &mut aim,
            &create_vector3(0.0, 0.0, -1.0),
            &light.transform.rotation,
        );
        close(aim.x, 0.0);
        close(aim.y, -1.0);
        close(aim.z, 0.0);
    }

    #[test]
    fn default_light_is_white_unscaled_and_infinite_while_disabled_and_inner_range_are_ordered_skips()
     {
        let dispatch = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_LIGHT_FAMILY);
            output
        };
        let bytes = build_minimal_three_ds(&[write_object_chunk("Bare", THREE_DS_LIGHT, &[0; 12])]);
        let document = parse_three_ds_document_with_dispatch(&bytes, None, &dispatch);
        let descriptor = document.lights[0].descriptor.read().unwrap();
        let point = (&*descriptor as &dyn Any)
            .downcast_ref::<PointLight>()
            .unwrap();
        assert_eq!(point.color, 0xffffffff);
        assert_eq!(point.intensity, 1.0);
        assert_eq!(point.range, -1.0);
        drop(descriptor);
        let mut record = float_bytes(&[5.0, 0.0, 0.0]);
        record.extend_from_slice(&write_chunk(THREE_DS_LIGHT_OFF, &[]));
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_MULTIPLIER,
            &3.0f32.to_le_bytes(),
        ));
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_INNER_RANGE,
            &10.0f32.to_le_bytes(),
        ));
        record.extend_from_slice(&write_chunk(
            THREE_DS_LIGHT_OUTER_RANGE,
            &50.0f32.to_le_bytes(),
        ));
        let bytes = build_minimal_three_ds(&[write_object_chunk("Off01", THREE_DS_LIGHT, &record)]);
        let mut diagnostics = Vec::new();
        let document =
            parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &dispatch);
        let descriptor = document.lights[0].descriptor.read().unwrap();
        let point = (&*descriptor as &dyn Any)
            .downcast_ref::<PointLight>()
            .unwrap();
        assert_eq!(point.intensity, 0.0);
        assert_eq!(point.range, 50.0);
        assert_eq!(document.lights[0].transform.position.x, 5.0);
        assert_eq!(
            diagnostics
                .iter()
                .map(|value| value.kind.as_str())
                .collect::<Vec<_>>(),
            ["3ds.light-inner-range-dropped", "3ds.light-disabled"]
        );
        for crumb in diagnostics {
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
            assert_eq!(crumb.origin, "parse3ds");
            assert_eq!(
                crumb.detail.as_ref().unwrap().get("firstName"),
                Some(&ImportDiagnosticDetailValue::String("Off01".to_string()))
            );
        }
    }
}
