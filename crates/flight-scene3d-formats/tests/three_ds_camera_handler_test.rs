use super::three_ds_test_helper::*;
use flight_camera::Projection;
use flight_geometry::{create_vector3, rotate_vector3_by_quaternion};
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_scene3d_formats::*;
use std::sync::Arc;

fn camera_record(position: [f32; 3], target: [f32; 3], roll: f32, focal: f32) -> Vec<u8> {
    return position
        .into_iter()
        .chain(target)
        .chain([roll, focal])
        .flat_map(f32::to_le_bytes)
        .collect();
}

fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.00001, "{a} != {b}");
}

mod parse_three_ds_camera {
    use super::*;
    #[test]
    fn reads_the_fixed_record_ranges_and_reports_truncation_and_malformed_subchunks() {
        let mut record = camera_record([10.0, 20.0, 30.0], [0.0; 3], 15.0, 35.0);
        record.extend_from_slice(&write_chunk(
            THREE_DS_CAMERA_RANGES,
            &[2.0f32, 500.0]
                .into_iter()
                .flat_map(f32::to_le_bytes)
                .collect::<Vec<_>>(),
        ));
        let chunk = write_chunk(THREE_DS_CAMERA, &record);
        let camera = parse_three_ds_camera(&chunk, 0, chunk.len(), "Cam1", None).unwrap();
        assert_eq!(camera.position, [10.0, 20.0, 30.0]);
        assert_eq!(camera.target, [0.0; 3]);
        assert_eq!(camera.roll, 15.0);
        assert_eq!(camera.focal_length, 35.0);
        assert_eq!(camera.name, "Cam1");
        assert_eq!(camera.near, Some(2.0));
        assert_eq!(camera.far, Some(500.0));
        let chunk = write_chunk(THREE_DS_CAMERA, &[0; 8]);
        let mut drops = Vec::new();
        assert!(parse_three_ds_camera(&chunk, 0, chunk.len(), "Bad", Some(&mut drops)).is_none());
        assert_eq!(drops[0].value.kind, "3ds.camera-truncated");
        assert_eq!(drops[0].value.severity, ImportDiagnosticSeverity::Drop);
        let mut record = camera_record([0.0; 3], [0.0; 3], 0.0, 50.0);
        record.extend_from_slice(&[0; 6]);
        let chunk = write_chunk(THREE_DS_CAMERA, &record);
        let mut drops = Vec::new();
        assert!(
            parse_three_ds_camera(&chunk, 0, chunk.len(), "Partial", Some(&mut drops)).is_some()
        );
        assert_eq!(drops[0].value.kind, "3ds.subchunk-exceeds-camera");
    }
}

mod three_ds_camera_handler {
    use super::*;
    #[test]
    fn family_owns_the_camera_id_and_builds_placed_aimed_perspective_cameras() {
        assert_eq!(THREE_DS_CAMERA_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &THREE_DS_CAMERA_FAMILY[0],
            &THREE_DS_CAMERA_HANDLER
        ));
        assert_eq!(
            THREE_DS_CAMERA_HANDLER.read().unwrap().chunk_ids,
            [THREE_DS_CAMERA]
        );
        let mut record = camera_record([0.0; 3], [0.0, 0.0, -10.0], 0.0, 50.0);
        record.extend_from_slice(&write_chunk(
            THREE_DS_CAMERA_RANGES,
            &[2.0f32, 500.0]
                .into_iter()
                .flat_map(f32::to_le_bytes)
                .collect::<Vec<_>>(),
        ));
        let bytes =
            build_minimal_three_ds(&[write_object_chunk("Camera01", THREE_DS_CAMERA, &record)]);
        let mut diagnostics = Vec::new();
        let document = parse_three_ds_document_with_dispatch(&bytes, Some(&mut diagnostics), &{
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_CAMERA_FAMILY);
            output
        });
        assert!(diagnostics.is_empty());
        assert_eq!(document.cameras.len(), 1);
        assert!(document.nodes.is_empty());
        assert!(document.scenes[0].root_nodes.is_empty());
        let camera = &document.cameras[0];
        assert_eq!(camera.name.as_deref(), Some("Camera01"));
        assert_eq!(camera.near, 2.0);
        assert_eq!(camera.far, 500.0);
        let Projection::Perspective(projection) = &camera.projection else {
            panic!("perspective");
        };
        let projection = projection.read().unwrap();
        assert_eq!(projection.aspect, 1.0);
        close(projection.fov_y, 2.0 * (36.0f32 / 100.0).atan());
        let mut aim = create_vector3(0.0, 0.0, 0.0);
        rotate_vector3_by_quaternion(
            &mut aim,
            &create_vector3(0.0, 0.0, -1.0),
            &camera.transform.rotation,
        );
        close(aim.x, 0.0);
        close(aim.y, -1.0);
        close(aim.z, 0.0);
    }

    #[test]
    fn absent_ranges_and_invalid_lens_use_format_defaults_and_bank_preserves_the_aim() {
        let dispatch = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_CAMERA_FAMILY);
            output
        };
        let mut rotations = Vec::new();
        for roll in [0.0, 90.0] {
            let record = camera_record([0.0; 3], [1.0, 0.0, 0.0], roll, -1.0);
            let bytes =
                build_minimal_three_ds(&[write_object_chunk("Camera", THREE_DS_CAMERA, &record)]);
            let document = parse_three_ds_document_with_dispatch(&bytes, None, &dispatch);
            let camera = &document.cameras[0];
            assert_eq!(camera.near, 1.0);
            assert_eq!(camera.far, 1000.0);
            let Projection::Perspective(projection) = &camera.projection else {
                panic!("perspective");
            };
            close(
                projection.read().unwrap().fov_y,
                2.0 * (36.0f32 / 100.0).atan(),
            );
            let mut aim = create_vector3(0.0, 0.0, 0.0);
            rotate_vector3_by_quaternion(
                &mut aim,
                &create_vector3(0.0, 0.0, -1.0),
                &camera.transform.rotation,
            );
            close(aim.x, 1.0);
            close(aim.y, 0.0);
            close(aim.z, 0.0);
            rotations.push(camera.transform.rotation.w);
        }
        assert!((rotations[0] - rotations[1]).abs() > 0.001);
    }
}
