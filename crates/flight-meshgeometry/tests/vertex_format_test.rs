use flight_meshgeometry::*;

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

mod read_vertex_format_component {
    use super::*;

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
    fn writes_a_float_component() {
        let mut bytes = vec![0u8; 16];
        write_vertex_format_component(&mut bytes, 0, VertexFormat::Float32x2, 0, 2.5);
        let b = [bytes[0], bytes[1], bytes[2], bytes[3]];
        assert_eq!(f32::from_le_bytes(b), 2.5);
    }
}
