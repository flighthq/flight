use flight_meshgeometry::contract::*;

mod get_vertex_format_byte_length {
    use super::*;

    #[test]
    fn reports_packed_and_float_sizes() {
        assert_eq!(get_vertex_format_byte_length(VertexFormat::Float32x3), 12);
        assert_eq!(get_vertex_format_byte_length(VertexFormat::Unorm8x4), 4);
    }
}

mod get_vertex_format_component_count {
    use super::*;

    #[test]
    fn reports_component_counts() {
        assert_eq!(get_vertex_format_component_count(VertexFormat::Uint16x4), 4);
    }
}

mod get_vertex_format_string {
    use super::*;
    #[test]
    fn matches_every_exact_source_literal() {
        assert_eq!(
            get_vertex_format_string(VertexFormat::Float32x2),
            "float32x2"
        );
        assert_eq!(
            get_vertex_format_string(VertexFormat::Float32x3),
            "float32x3"
        );
        assert_eq!(
            get_vertex_format_string(VertexFormat::Float32x4),
            "float32x4"
        );
        assert_eq!(get_vertex_format_string(VertexFormat::Uint16x4), "uint16x4");
        assert_eq!(get_vertex_format_string(VertexFormat::Uint8x4), "uint8x4");
        assert_eq!(get_vertex_format_string(VertexFormat::Unorm8x4), "unorm8x4");
    }
}

mod get_vertex_semantic_string {
    use super::*;
    #[test]
    fn matches_every_exact_source_literal() {
        assert_eq!(get_vertex_semantic_string(VertexSemantic::Color0), "color0");
        assert_eq!(
            get_vertex_semantic_string(VertexSemantic::Joints0),
            "joints0"
        );
        assert_eq!(get_vertex_semantic_string(VertexSemantic::Normal), "normal");
        assert_eq!(
            get_vertex_semantic_string(VertexSemantic::Position),
            "position"
        );
        assert_eq!(
            get_vertex_semantic_string(VertexSemantic::Tangent),
            "tangent"
        );
        assert_eq!(get_vertex_semantic_string(VertexSemantic::Uv0), "uv0");
        assert_eq!(get_vertex_semantic_string(VertexSemantic::Uv1), "uv1");
        assert_eq!(
            get_vertex_semantic_string(VertexSemantic::Weights0),
            "weights0"
        );
    }
}

mod parse_vertex_format {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_vertex_format("float32x2"),
            Some(VertexFormat::Float32x2)
        );
        assert_eq!(
            parse_vertex_format("float32x3"),
            Some(VertexFormat::Float32x3)
        );
        assert_eq!(
            parse_vertex_format("float32x4"),
            Some(VertexFormat::Float32x4)
        );
        assert_eq!(
            parse_vertex_format("uint16x4"),
            Some(VertexFormat::Uint16x4)
        );
        assert_eq!(parse_vertex_format("uint8x4"), Some(VertexFormat::Uint8x4));
        assert_eq!(
            parse_vertex_format("unorm8x4"),
            Some(VertexFormat::Unorm8x4)
        );
        assert_eq!(parse_vertex_format("UNKNOWN"), None);
        assert_eq!(parse_vertex_format("FLOAT32X2"), None);
    }
}

mod parse_vertex_semantic {
    use super::*;
    #[test]
    fn accepts_exact_literals_and_rejects_other_spellings() {
        assert_eq!(
            parse_vertex_semantic("color0"),
            Some(VertexSemantic::Color0)
        );
        assert_eq!(
            parse_vertex_semantic("joints0"),
            Some(VertexSemantic::Joints0)
        );
        assert_eq!(
            parse_vertex_semantic("normal"),
            Some(VertexSemantic::Normal)
        );
        assert_eq!(
            parse_vertex_semantic("position"),
            Some(VertexSemantic::Position)
        );
        assert_eq!(
            parse_vertex_semantic("tangent"),
            Some(VertexSemantic::Tangent)
        );
        assert_eq!(parse_vertex_semantic("uv0"), Some(VertexSemantic::Uv0));
        assert_eq!(parse_vertex_semantic("uv1"), Some(VertexSemantic::Uv1));
        assert_eq!(
            parse_vertex_semantic("weights0"),
            Some(VertexSemantic::Weights0)
        );
        assert_eq!(parse_vertex_semantic("UNKNOWN"), None);
        assert_eq!(parse_vertex_semantic("COLOR0"), None);
    }
}

mod read_vertex_format_component {
    use super::*;

    #[test]
    fn invalid_byte_ranges_throw_range_error_including_offset_overflow() {
        let view = [0u8; 4];
        for (offset, component) in [(4, 0), (0, 1), (usize::MAX, 0), (0, usize::MAX)] {
            let error = std::panic::catch_unwind(|| {
                read_vertex_format_component(&view, offset, VertexFormat::Float32x4, component)
            })
            .unwrap_err();
            let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
            assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
        }
    }

    #[test]
    fn reads_a_float_component() {
        let mut bytes = vec![0u8; 16];
        write_vertex_format_component(&mut bytes, 0, VertexFormat::Float32x2, 0, 2.5);
        let result = read_vertex_format_component(&bytes, 0, VertexFormat::Float32x2, 0);
        assert_eq!(result, 2.5);
    }
}

mod write_vertex_format_component {
    use super::*;

    #[test]
    fn invalid_byte_ranges_throw_before_writing_any_bytes() {
        let mut view = [7u8, 8];
        let error = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            write_vertex_format_component(&mut view, 0, VertexFormat::Float32x4, 0, 1.0)
        }))
        .unwrap_err();
        let error = error.downcast_ref::<flight_entity::FlightError>().unwrap();
        assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
        assert_eq!(view, [7, 8]);
    }

    #[test]
    fn writes_a_float_component() {
        let mut bytes = vec![0u8; 16];
        write_vertex_format_component(&mut bytes, 0, VertexFormat::Float32x2, 0, 2.5);
        let b = [bytes[0], bytes[1], bytes[2], bytes[3]];
        assert_eq!(f32::from_le_bytes(b), 2.5);
    }
}
