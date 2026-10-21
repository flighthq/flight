use flight_tilemap_formats::*;

mod create_tiled_guard_state {
    use super::*;

    #[test]
    fn returns_empty_guard_state() {
        let state = create_tiled_guard_state();
        let result = decode_tiled_base64_layer("AQAAAAIAAAA=", Some(TiledCompression::Zlib), None, Some(&state));
        assert!(result.is_none());
    }
}

mod decode_tiled_base64_layer {
    use super::*;

    #[test]
    fn decodes_uncompressed() {
        let encoded = "AQAAAAIAAAADAAAA";
        let result = decode_tiled_base64_layer(encoded, None, None, None);
        assert!(result.is_some());
        let data = result.unwrap();
        assert_eq!(&*data, &[1u32, 2, 3]);
    }
}

mod decode_tiled_csv_layer {
    use super::*;

    #[test]
    fn decodes_simple_csv() {
        let result = decode_tiled_csv_layer("1,2,3,4");
        assert_eq!(&*result, &[1u32, 2, 3, 4]);
    }

    #[test]
    fn handles_whitespace() {
        let result = decode_tiled_csv_layer(" 1 , 2 , 3 ");
        assert_eq!(&*result, &[1u32, 2, 3]);
    }
}

mod explain_tiled_layer_data {
    use super::*;

    #[test]
    fn uncompressed_is_decoded() {
        let result = explain_tiled_layer_data("data", None, None);
        assert!(!result.preserved_as_zero_grid);
        assert_eq!(result.reason, "decoded");
    }
}

mod set_tiled_layer_data_guard {
    use super::*;

    #[test]
    fn can_set_none() {
        let state = create_tiled_guard_state();
        set_tiled_layer_data_guard(&state, None);
    }
}
