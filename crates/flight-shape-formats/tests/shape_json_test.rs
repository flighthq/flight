use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_geometry::{Matrix, create_matrix};
use flight_path::contract::PathWinding;
use flight_shape::contract::{
    CapsStyle, GradientType, InterpolationMethod, JointStyle, LineScaleMode, Shape,
    ShapeCommandToken, SpreadMethod, TriangleCulling, append_shape_begin_fill,
    append_shape_begin_gradient_fill, append_shape_begin_texture_fill, append_shape_circle,
    append_shape_cubic_curve_to, append_shape_draw_triangles, append_shape_ellipse,
    append_shape_end_fill, append_shape_line_gradient_style, append_shape_line_style,
    append_shape_line_texture_style, append_shape_line_to, append_shape_move_to, append_shape_path,
    append_shape_quadratic_curve_to, append_shape_rectangle, append_shape_rounded_rectangle,
    create_shape, get_shape_command_count,
};
use flight_shape_formats::contract::*;
use flight_texture::contract::{Texture, create_texture};

fn command_count(shape: &Ref<Shape>) -> usize {
    let shape = shape.read().unwrap();
    return get_shape_command_count(&*shape);
}

fn create_every_non_texture_command_shape() -> Ref<Shape> {
    let shape = create_shape();
    append_shape_begin_fill(&shape, 0xff0000ff, Some(1.0));
    let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 10.0, 20.0);
    append_shape_begin_gradient_fill(
        &shape,
        GradientType::Linear,
        &[0xff0000ff, 0x0000ffff],
        &[1.0, 0.5],
        &[0.0, 255.0],
        Some(&matrix),
        Some(SpreadMethod::Pad),
        Some(InterpolationMethod::Rgb),
        Some(0.0),
    );
    append_shape_line_style(
        &shape,
        Some(2.0),
        0x00ff00ff,
        Some(1.0),
        Some(false),
        Some(LineScaleMode::Normal),
        Some(CapsStyle::Round),
        Some(JointStyle::Miter),
        Some(3.0),
    );
    append_shape_move_to(&shape, 0.0, 0.0);
    append_shape_line_to(&shape, 100.0, 0.0);
    append_shape_quadratic_curve_to(&shape, 150.0, 50.0, 100.0, 100.0);
    append_shape_cubic_curve_to(&shape, 10.0, 10.0, 20.0, 20.0, 30.0, 30.0);
    append_shape_path(
        &shape,
        &[1, 2],
        &[0.0, 0.0, 50.0, 50.0],
        Some(PathWinding::EvenOdd),
    );
    append_shape_circle(&shape, 5.0, 6.0, 7.0);
    append_shape_ellipse(&shape, 1.0, 2.0, 3.0, 4.0);
    append_shape_rectangle(&shape, 10.0, 11.0, 12.0, 13.0);
    append_shape_rounded_rectangle(&shape, 1.0, 2.0, 3.0, 4.0, 5.0);
    append_shape_draw_triangles(
        &shape,
        &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
        Some(&[0.0, 1.0, 2.0]),
        Some(&[0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
        Some(TriangleCulling::Positive),
    );
    append_shape_draw_triangles(
        &shape,
        &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
        None,
        None,
        Some(TriangleCulling::None),
    );
    append_shape_line_gradient_style(
        &shape,
        GradientType::Radial,
        &[0x112233ff, 0x445566ff],
        &[1.0, 0.0],
        &[0.0, 255.0],
        None,
        Some(SpreadMethod::Reflect),
        Some(InterpolationMethod::LinearRgb),
        Some(0.5),
    );
    append_shape_end_fill(&shape);
    return shape;
}

fn create_fake_texture() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}

fn document(commands: &str) -> String {
    return format!(r#"{{"shapeFormat":3,"commands":{commands}}}"#);
}

fn format_ref(shape: &Ref<Shape>) -> String {
    let shape = shape.read().unwrap();
    return format_shape_json(&shape, None);
}

fn set_matrix_field(matrix: &mut Matrix, field: &str, value: f32) {
    match field {
        "a" => matrix.a = value,
        "b" => matrix.b = value,
        "c" => matrix.c = value,
        "d" => matrix.d = value,
        "tx" => matrix.tx = value,
        "ty" => matrix.ty = value,
        _ => panic!("unexpected matrix field"),
    }
}

mod format_shape_json {
    use super::*;

    #[test]
    fn honors_the_space_option_for_pretty_printing() {
        let shape = create_shape();
        append_shape_end_fill(&shape);
        let shape = shape.read().unwrap();
        assert_eq!(
            format_shape_json(
                &shape,
                Some(&ShapeJsonFormatOptions {
                    space: Some(ShapeJsonFormatSpace::Number(2.0)),
                }),
            ),
            "{\n  \"shapeFormat\": 3,\n  \"commands\": [\n    {\n      \"key\": \"endFill\",\n      \"args\": []\n    }\n  ]\n}"
        );
        assert_eq!(
            format_shape_json(
                &shape,
                Some(&ShapeJsonFormatOptions {
                    space: Some(ShapeJsonFormatSpace::String("\t".to_string())),
                }),
            ),
            "{\n\t\"shapeFormat\": 3,\n\t\"commands\": [\n\t\t{\n\t\t\t\"key\": \"endFill\",\n\t\t\t\"args\": []\n\t\t}\n\t]\n}"
        );
        assert!(
            format_shape_json(
                &shape,
                Some(&ShapeJsonFormatOptions {
                    space: Some(ShapeJsonFormatSpace::Number(20.0)),
                }),
            )
            .starts_with("{\n          \"shapeFormat\"")
        );
    }

    #[test]
    fn serializes_a_matrix_argument_as_its_fields() {
        let shape = create_shape();
        let matrix = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
        append_shape_begin_gradient_fill(
            &shape,
            GradientType::Radial,
            &[0x000000ff],
            &[1.0],
            &[0.0],
            Some(&matrix),
            Some(SpreadMethod::Pad),
            Some(InterpolationMethod::Rgb),
            Some(0.0),
        );
        assert!(format_ref(&shape).contains(
            r#"["radial",[255],[1],[0],{"a":2,"b":0,"c":0,"d":3,"tx":5,"ty":7},"pad","rgb",0]"#
        ));

        for field in ["a", "b", "c", "d", "tx", "ty"] {
            let shape = create_shape();
            let mut matrix = create_matrix(2.0, 0.0, 0.0, 3.0, 5.0, 7.0);
            set_matrix_field(&mut matrix, field, f32::MAX);
            append_shape_begin_gradient_fill(
                &shape,
                GradientType::Radial,
                &[0x000000ff],
                &[1.0],
                &[0.0],
                Some(&matrix),
                Some(SpreadMethod::Pad),
                Some(InterpolationMethod::Rgb),
                Some(0.0),
            );
            let text = format_ref(&shape);
            let restored = parse_shape_json(&text, None).unwrap();
            assert_eq!(format_ref(&restored), text, "{field}");

            let invalid = create_shape();
            set_matrix_field(&mut matrix, field, f32::INFINITY);
            append_shape_begin_gradient_fill(
                &invalid,
                GradientType::Radial,
                &[0x000000ff],
                &[1.0],
                &[0.0],
                Some(&matrix),
                Some(SpreadMethod::Pad),
                Some(InterpolationMethod::Rgb),
                Some(0.0),
            );
            let thrown = catch_unwind(AssertUnwindSafe(|| format_ref(&invalid))).unwrap_err();
            let error = thrown.downcast::<FlightError>().unwrap();
            assert_eq!(error.kind, FlightErrorKind::TypeError);
            assert_eq!(
                error.message,
                "Shape command \"beginGradientFill\" cannot be represented as shape JSON"
            );
        }

        let invalid_scalar = create_shape();
        append_shape_begin_fill(&invalid_scalar, 0, Some(1.0));
        invalid_scalar.write().unwrap().data.commands[2] = ShapeCommandToken::Number(f64::NAN);
        let thrown = catch_unwind(AssertUnwindSafe(|| format_ref(&invalid_scalar))).unwrap_err();
        let error = thrown.downcast::<FlightError>().unwrap();
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(
            error.message,
            "Shape command \"beginFill\" cannot be represented as shape JSON"
        );

        let invalid_array = create_shape();
        append_shape_path(
            &invalid_array,
            &[1],
            &[0.0, 0.0],
            Some(PathWinding::EvenOdd),
        );
        invalid_array.write().unwrap().data.commands[3]
            .as_numbers_mut()
            .unwrap()[0] = f64::INFINITY;
        let thrown = catch_unwind(AssertUnwindSafe(|| format_ref(&invalid_array))).unwrap_err();
        let error = thrown.downcast::<FlightError>().unwrap();
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(
            error.message,
            "Shape command \"drawPath\" cannot be represented as shape JSON"
        );
    }

    #[test]
    fn serializes_a_texture_as_an_ordinal_reference_never_the_texture() {
        let shape = create_shape();
        append_shape_begin_texture_fill(&shape, &create_fake_texture(), None);
        append_shape_line_texture_style(&shape, &create_fake_texture(), None);
        assert_eq!(
            format_ref(&shape),
            r#"{"shapeFormat":3,"commands":[{"key":"beginTextureFill","args":[{"texture":{"index":0}},null]},{"key":"lineTextureStyle","args":[{"texture":{"index":1}},null]}]}"#
        );
    }

    #[test]
    fn wraps_the_command_stream_in_a_versioned_top_level_object() {
        let shape = create_shape();
        append_shape_begin_fill(&shape, 0x112233ff, Some(1.0));
        assert_eq!(
            format_ref(&shape),
            r#"{"shapeFormat":3,"commands":[{"key":"beginFill","args":[287454207,1]}]}"#
        );

        for (value, expected) in [
            (1e-7, "1e-7"),
            (1e-6, "0.000001"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (-0.0, "0"),
        ] {
            let shape = create_shape();
            append_shape_begin_fill(&shape, 0, Some(value));
            assert_eq!(
                format_ref(&shape),
                format!(
                    r#"{{"shapeFormat":3,"commands":[{{"key":"beginFill","args":[0,{expected}]}}]}}"#
                )
            );
        }
    }
}

mod parse_shape_json {
    use super::*;

    #[test]
    fn accepts_a_command_that_omits_its_optional_trailing_arguments() {
        let restored = parse_shape_json(
            &document(r#"[{"key":"lineStyle","args":[]},{"key":"endFill","args":[]}]"#),
            None,
        )
        .unwrap();
        assert_eq!(command_count(&restored), 2);
        let shape = restored.read().unwrap();
        assert_eq!(shape.data.commands[0].as_str(), Some("lineStyle"));
        assert_eq!(shape.data.commands[1].as_number(), Some(8.0));
        assert_eq!(shape.data.commands[2].as_number(), Some(1.0));
        assert_eq!(shape.data.commands[3].as_number(), Some(0.0));
        assert_eq!(shape.data.commands[4].as_number(), Some(1.0));
        assert_eq!(shape.data.commands[5].as_boolean(), Some(false));
    }

    #[test]
    fn accepts_a_null_matrix_in_an_optional_matrix_position() {
        let text = document(
            r#"[{"key":"beginGradientFill","args":["linear",[1],[1],[0],null,"pad","rgb",0]}]"#,
        );
        let restored = parse_shape_json(&text, None).unwrap();
        assert_eq!(command_count(&restored), 1);
        let shape = restored.read().unwrap();
        assert!(shape.data.commands[6].is_null());
    }

    #[test]
    fn drops_a_bitmap_fill_when_no_resolver_is_supplied_and_keeps_the_rest_intact() {
        let shape = create_shape();
        append_shape_begin_fill(&shape, 0xffffffff, Some(1.0));
        append_shape_begin_texture_fill(&shape, &create_fake_texture(), None);
        append_shape_line_to(&shape, 9.0, 9.0);
        let restored = parse_shape_json(&format_ref(&shape), None).unwrap();
        assert_eq!(command_count(&restored), 2);
        let shape = restored.read().unwrap();
        assert_eq!(shape.data.commands[0].as_str(), Some("beginFill"));
        assert_eq!(shape.data.commands[4].as_str(), Some("lineTo"));
    }

    #[test]
    fn drops_a_bitmap_fill_when_the_resolver_returns_null() {
        let shape = create_shape();
        append_shape_begin_texture_fill(&shape, &create_fake_texture(), None);
        append_shape_end_fill(&shape);
        let restored = parse_shape_json(
            &format_ref(&shape),
            Some(&ShapeJsonParseOptions {
                resolve_texture: Some(Arc::new(|_| None)),
            }),
        )
        .unwrap();
        assert_eq!(command_count(&restored), 1);
        assert_eq!(
            restored.read().unwrap().data.commands[0].as_str(),
            Some("endFill")
        );
    }

    #[test]
    fn drops_rather_than_rejects_a_texture_command_whose_reference_does_not_resolve() {
        let shape = create_shape();
        append_shape_begin_texture_fill(&shape, &create_fake_texture(), None);
        append_shape_end_fill(&shape);
        let restored = parse_shape_json(
            &format_ref(&shape),
            Some(&ShapeJsonParseOptions {
                resolve_texture: Some(Arc::new(|_| None)),
            }),
        )
        .unwrap();
        assert_eq!(command_count(&restored), 1);
    }

    #[test]
    fn parses_every_command_the_serializer_can_emit_proving_each_has_a_runtime_schema() {
        let shape = create_every_non_texture_command_shape();
        let expected = command_count(&shape);
        let restored = parse_shape_json(&format_ref(&shape), None).unwrap();
        assert_eq!(command_count(&restored), expected);
    }

    #[test]
    fn rejects_a_command_with_too_few_arguments() {
        assert!(parse_shape_json(&document(r#"[{"key":"moveTo","args":[1]}]"#), None,).is_none());
    }

    #[test]
    fn rejects_a_command_with_too_many_arguments() {
        assert!(
            parse_shape_json(&document(r#"[{"key":"moveTo","args":[1,2,3]}]"#), None,).is_none()
        );
    }

    #[test]
    fn rejects_a_matrix_field_serialized_from_infinity_to_null() {
        for field in ["a", "b", "c", "d", "tx", "ty"] {
            let mut fields = vec![
                ("a", "1"),
                ("b", "0"),
                ("c", "0"),
                ("d", "1"),
                ("tx", "2"),
                ("ty", "3"),
            ];
            fields.iter_mut().find(|entry| entry.0 == field).unwrap().1 = "1e999";
            let matrix = fields
                .iter()
                .map(|(key, value)| format!(r#""{key}":{value}"#))
                .collect::<Vec<_>>()
                .join(",");
            let text = format!(
                r#"{{"shapeFormat":3,"commands":[{{"key":"beginGradientFill","args":["linear",[1],[1],[0],{{{matrix}}},"pad","rgb",0]}}]}}"#
            );
            assert!(parse_shape_json(&text, None).is_none(), "{field}");
        }
        let null_field = document(
            r#"[{"key":"beginGradientFill","args":["linear",[1],[1],[0],{"a":null,"b":0,"c":0,"d":1,"tx":2,"ty":3},"pad","rgb",0]}]"#,
        );
        assert!(null_field.contains(r#""a":null"#));
        assert!(parse_shape_json(&null_field, None).is_none());
    }

    #[test]
    fn rejects_a_non_finite_entry_inside_a_numeric_array() {
        assert!(parse_shape_json(
            r#"{"shapeFormat":3,"commands":[{"key":"drawPath","args":[[1],[1e999,0],"evenOdd"]}]}"#,
            None,
        )
        .is_none());
    }

    #[test]
    fn rejects_a_non_matrix_object_in_a_matrix_position() {
        let text = document(
            r#"[{"key":"beginGradientFill","args":["linear",[1],[1],[0],{"a":1},"pad","rgb",0]}]"#,
        );
        assert!(parse_shape_json(&text, None).is_none());
    }

    #[test]
    fn rejects_a_non_numeric_entry_inside_a_numeric_array() {
        assert!(
            parse_shape_json(
                &document(r#"[{"key":"drawPath","args":[[1],[0,"x"],"evenOdd"]}]"#),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_a_null_where_a_number_is_expected_which_is_how_nan_survives_json() {
        assert!(
            parse_shape_json(&document(r#"[{"key":"moveTo","args":[null,5]}]"#), None,).is_none()
        );
    }

    #[test]
    fn rejects_a_number_where_an_array_is_expected() {
        assert!(
            parse_shape_json(
                &document(r#"[{"key":"drawPath","args":[1,[0,0],"evenOdd"]}]"#),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_a_number_where_a_string_is_expected() {
        assert!(
            parse_shape_json(
                &document(r#"[{"key":"drawPath","args":[[1],[0,0],7]}]"#),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn rejects_a_string_where_a_number_is_expected() {
        assert!(
            parse_shape_json(&document(r#"[{"key":"moveTo","args":["1","2"]}]"#), None,).is_none()
        );
    }

    #[test]
    fn rejects_an_out_of_range_literal_that_parses_as_infinity() {
        assert!(
            parse_shape_json(
                r#"{"shapeFormat":3,"commands":[{"key":"moveTo","args":[1e999,2]}]}"#,
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn returns_null_for_a_malformed_argument_object() {
        let text = document(r#"[{"key":"beginFill","args":[{"nonsense":true},1]}]"#);
        assert!(parse_shape_json(&text, None).is_none());
        assert!(parse_shape_json(&document(r#"[7]"#), None).is_none());
        assert!(parse_shape_json(&document(r#"[{"args":[]}]"#), None).is_none());
        assert!(parse_shape_json(&document(r#"[{"key":"endFill","args":{}}]"#), None,).is_none());
        assert!(
            parse_shape_json(
                &document(
                    r#"[{"key":"beginTextureFill","args":[{"texture":{"index":"0"}},null]}]"#,
                ),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn returns_null_for_a_mismatched_version_tag() {
        assert!(parse_shape_json(r#"{"shapeFormat":999,"commands":[]}"#, None).is_none());
    }

    #[test]
    fn returns_null_for_a_missing_version_tag() {
        assert!(parse_shape_json(r#"{"commands":[]}"#, None).is_none());
        assert!(parse_shape_json(r#"{"shapeFormat":3,"commands":{}}"#, None).is_none());
    }

    #[test]
    fn returns_null_for_an_unknown_command_key() {
        assert!(
            parse_shape_json(&document(r#"[{"key":"notACommand","args":[]}]"#), None,).is_none()
        );
    }

    #[test]
    fn returns_null_for_malformed_json() {
        assert!(parse_shape_json("{ not json", None).is_none());
    }

    #[test]
    fn returns_null_when_the_top_level_is_not_an_object() {
        assert!(parse_shape_json("[]", None).is_none());
        assert!(parse_shape_json("null", None).is_none());
    }

    #[test]
    fn round_trips_a_bitmap_fill_through_the_texture_resolver() {
        let texture = create_fake_texture();
        let shape = create_shape();
        let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 3.0, 4.0);
        append_shape_begin_texture_fill(&shape, &texture, Some(&matrix));
        append_shape_line_texture_style(&shape, &texture, None);
        append_shape_move_to(&shape, 5.0, 6.0);

        let seen = Arc::new(Mutex::new(Vec::new()));
        let seen_by_resolver = seen.clone();
        let texture_by_resolver = texture.clone();
        let restored = parse_shape_json(
            &format_ref(&shape),
            Some(&ShapeJsonParseOptions {
                resolve_texture: Some(Arc::new(move |reference| {
                    seen_by_resolver.lock().unwrap().push(reference.index);
                    return Some(texture_by_resolver.clone());
                })),
            }),
        )
        .unwrap();

        assert_eq!(*seen.lock().unwrap(), vec![0.0, 1.0]);
        assert_eq!(command_count(&restored), 3);
        let restored = restored.read().unwrap();
        assert_eq!(restored.data.commands[0].as_str(), Some("beginTextureFill"));
        assert!(Arc::ptr_eq(
            restored.data.commands[2].as_texture().unwrap(),
            &texture
        ));
        assert_eq!(restored.data.commands[4].as_str(), Some("lineTextureStyle"));
        assert!(Arc::ptr_eq(
            restored.data.commands[6].as_texture().unwrap(),
            &texture
        ));
    }

    #[test]
    fn round_trips_every_non_texture_command_losslessly() {
        let shape = create_every_non_texture_command_shape();
        let json = format_ref(&shape);
        let restored = parse_shape_json(&json, None).unwrap();
        assert_eq!(command_count(&restored), command_count(&shape));
        assert_eq!(format_ref(&restored), json);

        let dynamic_numbers = document(
            r#"[{"key":"beginFill","args":[1.5,0.25]},{"key":"drawPath","args":[[300,-1,1.5],[0.25,-2.5],"evenOdd"]}]"#,
        );
        let restored = parse_shape_json(&dynamic_numbers, None).unwrap();
        assert_eq!(format_ref(&restored), dynamic_numbers);
    }
}
