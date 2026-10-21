use flight_importdiagnostics::ImportDiagnostic;
use flight_scene2d_formats::contract::*;

mod parse_rive_document {
    use super::*;

    #[test]
    fn keeps_the_stream_aligned_across_table_word_boundaries() {
        let types = [
            RiveFieldType::Uint,
            RiveFieldType::Double,
            RiveFieldType::Color,
            RiveFieldType::String,
        ];
        for count in [1, 3, 4, 5, 8, 9, 17] {
            let table = (0..count)
                .map(|index| (60_010 + index as u64, types[index % 4]))
                .collect::<Vec<_>>();
            let document = parse_rive_document(
                &build_rive_file(
                    create_header_fixture(),
                    &table,
                    &[object(91, &[]), object(92, &[])],
                ),
                None,
            )
            .expect("readable document");
            assert_eq!(document.header.table_of_contents.len(), count);
            assert_eq!(
                document
                    .header
                    .table_of_contents
                    .iter()
                    .map(|entry| (entry.key, entry.r#type))
                    .collect::<Vec<_>>(),
                table
            );
            assert_eq!(
                document
                    .objects
                    .iter()
                    .map(|object| object.type_key)
                    .collect::<Vec<_>>(),
                [91, 92]
            );
        }
    }

    #[test]
    fn prefers_the_built_in_width_over_a_table_entry_that_contradicts_it() {
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &[(7, RiveFieldType::Uint)],
                &[object(1, &[(7, &[0x00, 0x00, 0x70, 0x43])])],
            ),
            None,
        )
        .expect("readable document");
        let property = &document.objects[0].properties[0];
        assert_eq!(property.r#type, RiveFieldType::Double);
        assert_eq!(property.value, RiveValue::Double(240.0));
    }

    #[test]
    fn raises_no_diagnostic_at_all_for_a_well_formed_file() {
        let mut diagnostics = Vec::new();
        assert!(
            parse_rive_document(
                &build_rive_file(
                    HeaderFixture {
                        file_id: 1_234_567,
                        major: 7,
                        minor: 3,
                    },
                    &[],
                    &[],
                ),
                Some(&mut diagnostics),
            )
            .is_some()
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn reads_a_boolean_width_value_as_a_one_byte_varuint() {
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &[(60_014, RiveFieldType::Uint)],
                &[object(1, &[(60_014, &[1])]), object(1, &[(60_014, &[0])])],
            ),
            None,
        )
        .expect("readable document");
        assert_eq!(document.objects[0].properties[0].value, RiveValue::Uint(1));
        assert_eq!(document.objects[1].properties[0].value, RiveValue::Uint(0));
    }

    #[test]
    fn reads_a_color_property_as_a_little_endian_unsigned_32_bit_value() {
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &[(60_037, RiveFieldType::Color)],
                &[object(20, &[(60_037, &[0x44, 0x33, 0x22, 0xff])])],
            ),
            None,
        )
        .expect("readable document");
        assert_eq!(
            document.objects[0].properties[0].value,
            RiveValue::Color(0xff22_3344)
        );
    }

    #[test]
    fn reads_a_float_property_as_little_endian_ieee_754_binary32() {
        for (bytes, value) in [
            ([0x00, 0x00, 0x80, 0x3f], 1.0),
            ([0x00, 0x00, 0x00, 0x00], 0.0),
            ([0x00, 0x00, 0x80, 0xbf], -1.0),
            ([0x00, 0x00, 0x20, 0x41], 10.0),
            ([0xdb, 0x0f, 0x49, 0x40], std::f32::consts::PI),
        ] {
            let document = parse_rive_document(
                &build_rive_file(
                    create_header_fixture(),
                    &[(60_020, RiveFieldType::Double)],
                    &[object(1, &[(60_020, &bytes)])],
                ),
                None,
            )
            .expect("readable document");
            let RiveValue::Double(actual) = document.objects[0].properties[0].value else {
                panic!("expected float");
            };
            assert!((actual - value).abs() < 1e-6);
        }
    }

    #[test]
    fn reads_a_string_property_as_varuint_length_followed_by_utf8_bytes() {
        let text = "Artboard ünï✓";
        let mut raw = encode_var_uint(text.len() as u64);
        raw.extend_from_slice(text.as_bytes());
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &[(60_055, RiveFieldType::String)],
                &[object(23, &[(60_055, &raw)])],
            ),
            None,
        )
        .expect("readable document");
        assert_eq!(
            document.objects[0].properties[0].value,
            RiveValue::String(text.to_string())
        );
    }

    #[test]
    fn reads_standard_properties_from_the_built_in_model_when_the_file_declares_no_table() {
        let name = "Artboard";
        let mut encoded_name = encode_var_uint(name.len() as u64);
        encoded_name.extend_from_slice(name.as_bytes());
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &[],
                &[
                    object(23, &[]),
                    object(
                        1,
                        &[
                            (4, &encoded_name),
                            (7, &[0x00, 0x80, 0x54, 0x44]),
                            (8, &[0x00, 0x00, 0x70, 0x43]),
                        ],
                    ),
                ],
            ),
            None,
        )
        .expect("readable document");
        assert!(document.header.table_of_contents.is_empty());
        assert_eq!(
            document
                .objects
                .iter()
                .map(|object| object.type_key)
                .collect::<Vec<_>>(),
            [23, 1]
        );
        assert_eq!(
            document.objects[1].properties[0].value,
            RiveValue::String(name.to_string())
        );
        assert_eq!(
            document.objects[1].properties[1].value,
            RiveValue::Double(850.0)
        );
        assert_eq!(
            document.objects[1].properties[2].value,
            RiveValue::Double(240.0)
        );
    }

    #[test]
    fn reads_the_header_versions_and_file_id() {
        let document = parse_rive_document(
            &build_rive_file(
                HeaderFixture {
                    file_id: 1_234_567,
                    major: 7,
                    minor: 3,
                },
                &[],
                &[],
            ),
            None,
        )
        .expect("readable document");
        assert_eq!(document.header.file_id, 1_234_567);
        assert_eq!(document.header.major_version, 7);
        assert_eq!(document.header.minor_version, 3);
    }

    #[test]
    fn recovers_every_object_in_a_mixed_stream() {
        let table = [
            (60_010, RiveFieldType::Uint),
            (60_011, RiveFieldType::Double),
            (60_012, RiveFieldType::Color),
            (60_013, RiveFieldType::String),
        ];
        let mut hello = encode_var_uint(5);
        hello.extend_from_slice(b"hello");
        let document = parse_rive_document(
            &build_rive_file(
                create_header_fixture(),
                &table,
                &[
                    object(1, &[(60_010, &encode_var_uint(300))]),
                    object(2, &[]),
                    object(
                        3,
                        &[
                            (60_011, &[0x00, 0x00, 0x80, 0x3f]),
                            (60_013, &hello),
                            (60_012, &[0x01, 0x02, 0x03, 0x04]),
                        ],
                    ),
                    object(4, &[(60_010, &encode_var_uint(1))]),
                ],
            ),
            None,
        )
        .expect("readable document");
        assert_eq!(
            document
                .objects
                .iter()
                .map(|object| object.type_key)
                .collect::<Vec<_>>(),
            [1, 2, 3, 4]
        );
        assert_eq!(
            document.objects[0].properties[0].value,
            RiveValue::Uint(300)
        );
        assert_eq!(
            document.objects[2]
                .properties
                .iter()
                .map(|property| property.key)
                .collect::<Vec<_>>(),
            [60_011, 60_013, 60_012]
        );
        assert_eq!(
            document.objects[2].properties[1].value,
            RiveValue::String("hello".to_string())
        );
        assert_eq!(document.objects[3].properties[0].value, RiveValue::Uint(1));
    }

    #[test]
    fn refuses_a_file_from_a_format_generation_it_has_not_read() {
        let mut diagnostics = Vec::new();
        assert!(
            parse_rive_document(
                &build_rive_file(
                    HeaderFixture {
                        major: 6,
                        ..create_header_fixture()
                    },
                    &[],
                    &[],
                ),
                Some(&mut diagnostics),
            )
            .is_none()
        );
        assert_eq!(diagnostic_kinds(&diagnostics), ["rive.unsupported-version"]);
        assert!(
            parse_rive_document(
                &build_rive_file(
                    HeaderFixture {
                        major: 8,
                        ..create_header_fixture()
                    },
                    &[],
                    &[],
                ),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_a_file_too_short_to_hold_a_fingerprint() {
        assert!(parse_rive_document(&[0x52, 0x49], None).is_none());
    }

    #[test]
    fn rejects_a_file_whose_fingerprint_is_not_rive() {
        let mut diagnostics = Vec::new();
        assert!(
            parse_rive_document(&[0x52, 0x49, 0x56, 0x58, 0x01], Some(&mut diagnostics)).is_none()
        );
        assert_eq!(diagnostic_kinds(&diagnostics), ["rive.invalid-header"]);
    }

    #[test]
    fn rejects_a_stream_truncated_mid_value() {
        let mut complete = build_rive_file(
            create_header_fixture(),
            &[(60_011, RiveFieldType::Double)],
            &[object(1, &[(60_011, &[0x00, 0x00, 0x80, 0x3f])])],
        );
        complete.truncate(complete.len() - 2);
        let mut diagnostics = Vec::new();
        assert!(parse_rive_document(&complete, Some(&mut diagnostics)).is_none());
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.truncated-object-stream"]
        );
    }

    #[test]
    fn round_trips_varuints_against_their_arithmetic_definition() {
        for value in [
            0,
            1,
            63,
            127,
            128,
            129,
            300,
            16_383,
            16_384,
            2_097_151,
            2_097_152,
            4_294_967_295,
            68_719_476_735,
        ] {
            let document = parse_rive_document(
                &build_rive_file(
                    HeaderFixture {
                        file_id: value,
                        ..create_header_fixture()
                    },
                    &[],
                    &[],
                ),
                None,
            )
            .expect("readable document");
            assert_eq!(document.header.file_id, value);
        }
    }

    #[test]
    fn stops_instead_of_guessing_when_a_property_key_has_no_declared_width() {
        let mut diagnostics = Vec::new();
        let bytes = build_rive_file(
            create_header_fixture(),
            &[(60_010, RiveFieldType::Uint)],
            &[object(1, &[(60_099, &[5])])],
        );
        assert!(parse_rive_document(&bytes, Some(&mut diagnostics)).is_none());
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.unknown-property-width"]
        );
    }
}

#[derive(Clone, Copy)]
struct HeaderFixture {
    file_id: u64,
    major: u64,
    minor: u64,
}

struct ObjectFixture {
    properties: Vec<(u64, Vec<u8>)>,
    type_key: u64,
}

fn build_rive_file(
    header: HeaderFixture,
    table: &[(u64, RiveFieldType)],
    objects: &[ObjectFixture],
) -> Vec<u8> {
    let mut bytes = vec![0x52, 0x49, 0x56, 0x45];
    bytes.extend(encode_var_uint(header.major));
    bytes.extend(encode_var_uint(header.minor));
    bytes.extend(encode_var_uint(header.file_id));
    for (key, _) in table {
        bytes.extend(encode_var_uint(*key));
    }
    bytes.push(0);
    for entries in table.chunks(4) {
        let mut word = 0_u32;
        for (slot, (_, field_type)) in entries.iter().enumerate() {
            word |= (*field_type as u32 & 3) << (slot * 2);
        }
        bytes.extend(encode_uint32_little_endian(word));
    }
    for object in objects {
        bytes.extend(encode_var_uint(object.type_key));
        for (key, raw) in &object.properties {
            bytes.extend(encode_var_uint(*key));
            bytes.extend(raw);
        }
        bytes.push(0);
    }
    return bytes;
}

fn create_header_fixture() -> HeaderFixture {
    return HeaderFixture {
        file_id: 0,
        major: 7,
        minor: 0,
    };
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn encode_uint32_little_endian(value: u32) -> [u8; 4] {
    return value.to_le_bytes();
}

fn encode_var_uint(value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut remaining = value;
    loop {
        let group = (remaining % 128) as u8;
        remaining /= 128;
        bytes.push(if remaining > 0 { group | 0x80 } else { group });
        if remaining == 0 {
            return bytes;
        }
    }
}

fn object(type_key: u64, properties: &[(u64, &[u8])]) -> ObjectFixture {
    return ObjectFixture {
        properties: properties
            .iter()
            .map(|(key, raw)| (*key, raw.to_vec()))
            .collect(),
        type_key,
    };
}
