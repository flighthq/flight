use flight_geometry::create_matrix4;
use flight_scene3d_formats::*;

mod awd_data_type_byte_size {
    use super::*;

    #[test]
    fn sizes_every_numeric_wire_type_and_defaults_unknown_types_to_four() {
        for (kind, size) in [
            (AWD2_DATA_INT8, 1),
            (AWD2_DATA_UINT8, 1),
            (AWD2_DATA_INT16, 2),
            (AWD2_DATA_UINT16, 2),
            (AWD2_DATA_INT32, 4),
            (AWD2_DATA_UINT32, 4),
            (AWD2_DATA_FLOAT32, 4),
            (AWD2_DATA_FLOAT64, 8),
            (0xff, 4),
        ] {
            assert_eq!(awd_data_type_byte_size(kind), size);
        }
    }
}

mod awd_transform_to_matrix4 {
    use super::*;

    #[test]
    fn supplies_the_homogeneous_row_and_overwrites_the_entire_existing_matrix() {
        let mut out = create_matrix4();
        let uid = flight_entity::get_entity_uid(&mut out);
        let transform = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 7.0, 8.0, 9.0];
        awd_transform_to_matrix4(&mut out, &transform);
        assert_eq!(&out.m[12..16], &[7.0, 8.0, 9.0, 1.0]);
        assert_eq!([out.m[3], out.m[7], out.m[11]], [0.0; 3]);
        let next = [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0];
        awd_transform_to_matrix4(&mut out, &next);
        assert_eq!(flight_entity::get_entity_uid(&mut out), uid);
        assert_eq!(
            out.m,
            [
                2.0, 0.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 0.0, 4.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }
}

mod awd_transform_to_transform3d {
    use super::*;

    #[test]
    fn decomposes_translation_and_uniform_scale_without_hidden_scratch_state() {
        let transform = {
            let mut output = flight_geometry::contract::create_transform3d();
            awd_transform_to_transform3d(
                &mut output,
                &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 4.0],
            );
            output
        };
        assert_eq!(
            [
                transform.position.x,
                transform.position.y,
                transform.position.z
            ],
            [2.0, 3.0, 4.0]
        );
        let scaled = {
            let mut output = flight_geometry::contract::create_transform3d();
            awd_transform_to_transform3d(
                &mut output,
                &[2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0],
            );
            output
        };
        assert_eq!(
            [
                scaled.scale.x.abs(),
                scaled.scale.y.abs(),
                scaled.scale.z.abs()
            ],
            [2.0; 3]
        );
        assert_eq!(
            [
                transform.position.x,
                transform.position.y,
                transform.position.z
            ],
            [2.0, 3.0, 4.0]
        );
    }
    #[test]
    fn replaces_translation_rotation_and_scale_when_reusing_a_previously_decomposed_output() {
        let mut out = flight_geometry::contract::create_transform3d();
        awd_transform_to_transform3d(
            &mut out,
            &[2.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 1.0, 2.0, 3.0],
        );
        assert_eq!(
            [out.position.x, out.position.y, out.position.z],
            [1.0, 2.0, 3.0]
        );
        assert_eq!([out.scale.x, out.scale.y, out.scale.z], [2.0; 3]);
        awd_transform_to_transform3d(
            &mut out,
            &[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
        );
        assert_eq!([out.position.x, out.position.y, out.position.z], [0.0; 3]);
        assert_eq!([out.scale.x, out.scale.y, out.scale.z], [1.0; 3]);
        assert_eq!(
            [
                out.rotation.x,
                out.rotation.y,
                out.rotation.z,
                out.rotation.w
            ],
            [0.0, 0.0, 0.0, 1.0]
        );
    }
}

mod has_non_unit_scale {
    use super::*;

    #[test]
    fn applies_the_source_tolerance_per_axis_and_preserves_nan_comparisons() {
        assert!(!has_non_unit_scale(1.0, 1.0, 1.0));
        assert!(!has_non_unit_scale(1.0 + 1e-6, 1.0 - 1e-6, 1.0));
        for xyz in [
            [3.0, 1.0, 1.0],
            [1.0, 3.0, 1.0],
            [1.0, 1.0, 3.0],
            [1.001, 1.0, 1.0],
        ] {
            assert!(has_non_unit_scale(xyz[0], xyz[1], xyz[2]));
        }
        assert!(!has_non_unit_scale(f32::NAN, 1.0, 1.0));
    }
}

mod read_awd_data_value {
    use super::*;

    #[test]
    fn reads_every_wire_signedness_and_width_at_the_requested_window_offset() {
        assert_eq!(read_awd_data_value(&[0, 251], 1, AWD2_DATA_INT8), -5.0);
        assert_eq!(
            read_awd_data_value(&(-300_i16).to_le_bytes(), 0, AWD2_DATA_INT16),
            -300.0
        );
        assert_eq!(
            read_awd_data_value(&(-123456_i32).to_le_bytes(), 0, AWD2_DATA_INT32),
            -123456.0
        );
        assert_eq!(read_awd_data_value(&[200], 0, AWD2_DATA_UINT8), 200.0);
        assert_eq!(
            read_awd_data_value(&60000_u16.to_le_bytes(), 0, AWD2_DATA_UINT16),
            60000.0
        );
        assert_eq!(
            read_awd_data_value(&4_000_000_000_u32.to_le_bytes(), 0, AWD2_DATA_UINT32),
            4_000_000_000.0
        );
        assert_eq!(
            read_awd_data_value(&1.25_f32.to_le_bytes(), 0, AWD2_DATA_FLOAT32),
            1.25
        );
        assert_eq!(
            read_awd_data_value(&1.5_f64.to_le_bytes(), 0, AWD2_DATA_FLOAT64),
            1.5
        );
        assert_eq!(read_awd_data_value(&2.5_f32.to_le_bytes(), 0, 0xff), 2.5);
    }

    #[test]
    fn rejects_an_out_of_window_read_with_the_data_view_error() {
        let error = std::panic::catch_unwind(|| read_awd_data_value(&[0], 0, AWD2_DATA_UINT32))
            .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(
            error.message,
            "Offset is outside the bounds of the DataView"
        );
    }
}

mod read_awd_properties {
    use super::*;

    #[test]
    fn reads_ordered_spans_skips_unknown_fields_and_replaces_duplicate_keys_in_place() {
        let mut bytes = vec![0; 4];
        for (key, payload) in [
            (1_u16, 2.5_f32.to_le_bytes()),
            (2, 77_u32.to_le_bytes()),
            (1, 9.5_f32.to_le_bytes()),
        ] {
            bytes.extend_from_slice(&key.to_le_bytes());
            bytes.extend_from_slice(&4_u32.to_le_bytes());
            bytes.extend_from_slice(&payload);
        }
        bytes[..4].copy_from_slice(&30_u32.to_le_bytes());
        let result = read_awd_properties(&bytes, 0, bytes.len());
        assert_eq!(result.end, 34);
        assert_eq!(
            result.values.iter().map(|e| e.key).collect::<Vec<_>>(),
            [1, 2]
        );
        assert_eq!(
            read_awd_property_float32(&bytes, &result.values, 1),
            Some(9.5)
        );
        assert_eq!(
            read_awd_property_uint32(&bytes, &result.values, 2),
            Some(77)
        );
    }

    #[test]
    fn caps_the_list_and_stops_before_an_overrunning_field_without_discarding_prior_spans() {
        let mut bytes = vec![0; 24];
        bytes[..4].copy_from_slice(&100_u32.to_le_bytes());
        bytes[4..6].copy_from_slice(&1_u16.to_le_bytes());
        bytes[6..10].copy_from_slice(&4_u32.to_le_bytes());
        bytes[14..16].copy_from_slice(&2_u16.to_le_bytes());
        bytes[16..20].copy_from_slice(&100_u32.to_le_bytes());
        let result = read_awd_properties(&bytes, 0, 24);
        assert_eq!(result.end, 24);
        assert_eq!(result.values.len(), 1);
        let short = read_awd_properties(&bytes, 22, 24);
        assert_eq!(short.end, 22);
        assert!(short.values.is_empty());
    }
}

mod read_awd_property_float32 {
    use super::*;

    #[test]
    fn returns_none_for_missing_or_short_values_and_reads_four_byte_fields() {
        let bytes = 2.5_f32.to_le_bytes();
        assert_eq!(read_awd_property_float32(&bytes, &[], 1), None);
        for length in [0, 1, 2, 3, 4, 8] {
            let entries = [Awd2PropertyEntry {
                key: 1,
                value: Awd2PropertySpan { length, offset: 0 },
            }];
            assert_eq!(
                read_awd_property_float32(&bytes, &entries, 1),
                if length < 4 { None } else { Some(2.5) }
            );
        }
    }
}

mod read_awd_property_number {
    use super::*;

    #[test]
    fn uses_each_property_record_width_instead_of_a_global_header_flag() {
        let mut bytes = vec![0; 16];
        bytes[..4].copy_from_slice(&1.25_f32.to_le_bytes());
        bytes[8..].copy_from_slice(&9.5_f64.to_le_bytes());
        for (length, offset, expected) in [(4, 0, 1.25), (7, 0, 1.25), (8, 8, 9.5), (12, 8, 9.5)] {
            let entries = [Awd2PropertyEntry {
                key: 1,
                value: Awd2PropertySpan { length, offset },
            }];
            assert_eq!(
                read_awd_property_number(&bytes, &entries, 1),
                Some(expected)
            );
        }
        assert_eq!(read_awd_property_number(&bytes, &[], 9), None);
        assert_eq!(
            read_awd_property_number(
                &bytes,
                &[Awd2PropertyEntry {
                    key: 1,
                    value: Awd2PropertySpan {
                        length: 3,
                        offset: 0
                    }
                }],
                1
            ),
            None
        );
    }
}

mod read_awd_property_uint32 {
    use super::*;

    #[test]
    fn preserves_the_full_unsigned_range_and_absent_sentinel() {
        let bytes = u32::MAX.to_le_bytes();
        let entries = [Awd2PropertyEntry {
            key: 1,
            value: Awd2PropertySpan {
                length: 4,
                offset: 0,
            },
        }];
        assert_eq!(
            read_awd_property_uint32(&bytes, &entries, 1),
            Some(u32::MAX)
        );
        assert_eq!(read_awd_property_uint32(&bytes, &entries, 2), None);
        assert_eq!(
            read_awd_property_uint32(
                &bytes,
                &[Awd2PropertyEntry {
                    key: 1,
                    value: Awd2PropertySpan {
                        length: 3,
                        offset: 0
                    }
                }],
                1
            ),
            None
        );
    }
}

mod read_awd_property_uint8 {
    use super::*;

    #[test]
    fn reads_a_single_byte_and_refuses_missing_or_empty_fields() {
        for length in [0, 1] {
            let entries = [Awd2PropertyEntry {
                key: 1,
                value: Awd2PropertySpan { length, offset: 0 },
            }];
            assert_eq!(
                read_awd_property_uint8(&[200], &entries, 1),
                if length == 0 { None } else { Some(200) }
            );
        }
        assert_eq!(read_awd_property_uint8(&[200], &[], 1), None);
    }
}

mod read_awd_string {
    use super::*;

    #[test]
    fn decodes_length_prefixed_utf8_empty_names_and_clamped_source_windows() {
        let bytes = [4, 0, b'R', b'o', b'o', b't'];
        assert_eq!(
            read_awd_string(&bytes, &bytes, 0),
            Awd2StringRead {
                end: 6,
                value: "Root".to_string()
            }
        );
        assert_eq!(read_awd_string(&[0, 0], &[0, 0], 0).value, "");
        let unicode = [5, 0, 0xc3, 0xa9, 0xe7, 0x8c, 0xab];
        assert_eq!(read_awd_string(&unicode, &unicode, 0).value, "é猫");
        let bom = [4, 0, 0xef, 0xbb, 0xbf, b'A'];
        assert_eq!(read_awd_string(&bom, &bom, 0).value, "A");
        let truncated = [9, 0, b'x', 0xc3];
        assert_eq!(
            read_awd_string(&truncated, &truncated, 0),
            Awd2StringRead {
                end: 11,
                value: "x�".to_string()
            }
        );
    }
}

mod read_awd_transform {
    use super::*;

    #[test]
    fn reads_both_declared_widths_and_flips_only_the_source_handedness_components() {
        let mut narrow = vec![0xaa; 3];
        let mut wide = vec![0xaa; 3];
        for i in 0..12 {
            narrow.extend_from_slice(&(i as f32).to_le_bytes());
            wide.extend_from_slice(&(i as f64).to_le_bytes());
        }
        let a = read_awd_transform(&narrow, 3, false);
        let b = read_awd_transform(&wide, 3, true);
        assert_eq!(a.end, 51);
        assert_eq!(b.end, 99);
        assert_eq!(a.transform, b.transform);
        for i in 0..12 {
            let expected = if [2, 5, 6, 7, 11].contains(&i) {
                -(i as f64)
            } else {
                i as f64
            };
            assert_eq!(a.transform[i], expected);
        }
        let exact = 1.0_f64 + f64::EPSILON;
        let mut wide = vec![0; 96];
        wide[..8].copy_from_slice(&exact.to_le_bytes());
        assert_eq!(
            read_awd_transform(&wide, 0, true).transform[0].to_bits(),
            exact.to_bits()
        );
    }
}

mod skip_awd_attr_list {
    use super::*;

    #[test]
    fn skips_by_declared_length_even_past_end_but_stays_when_prefix_is_short() {
        let mut bytes = vec![0; 16];
        bytes[..4].copy_from_slice(&6_u32.to_le_bytes());
        assert_eq!(skip_awd_attr_list(&bytes, 0, 16), 10);
        assert_eq!(skip_awd_attr_list(&bytes, 14, 16), 14);
        bytes[..4].copy_from_slice(&100_u32.to_le_bytes());
        assert_eq!(skip_awd_attr_list(&bytes, 0, 16), 104);
    }
}
