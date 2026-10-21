use flight_tilemap_formats::*;

mod parse_tiled_tileset {
    use super::*;

    #[test]
    fn returns_none_for_invalid_xml() {
        let result = parse_tiled_tileset("not xml", None, None);
        assert!(result.is_none());
    }
}

mod parse_tiled_tmx {
    use super::*;

    #[test]
    fn returns_none_for_invalid_xml() {
        let result = parse_tiled_tmx("not xml", None, None);
        assert!(result.is_none());
    }

    #[test]
    fn returns_none_for_non_map_xml() {
        let result = parse_tiled_tmx("<root></root>", None, None);
        assert!(result.is_none());
    }
}
