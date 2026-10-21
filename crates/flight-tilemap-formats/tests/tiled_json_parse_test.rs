use flight_tilemap_formats::*;

mod parse_tiled_tileset_json {
    use super::*;

    #[test]
    fn returns_none_for_invalid_json() {
        let result = parse_tiled_tileset_json("not json", None, None);
        assert!(result.is_none());
    }
}

mod parse_tiled_tmj {
    use super::*;

    #[test]
    fn returns_none_for_invalid_json() {
        let result = parse_tiled_tmj("not json", None, None);
        assert!(result.is_none());
    }

    #[test]
    fn parses_empty_object_with_defaults() {
        let result = parse_tiled_tmj("{}", None, None);
        if let Some(map) = result {
            assert_eq!(map.width, 0);
            assert_eq!(map.height, 0);
        }
    }
}
