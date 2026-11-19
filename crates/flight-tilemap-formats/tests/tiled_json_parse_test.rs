//! flight-compiler: target-native

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
    fn parses_polygon_points_as_exact_doubles() {
        // Neither 0.1 nor 1e9 + 0.5 is an f32 value; the parsed point keeps the JSON double exactly.
        let text = r#"{"width":1,"height":1,"tilewidth":32,"tileheight":32,"orientation":"orthogonal","layers":[{"type":"objectgroup","id":1,"name":"shapes","objects":[{"id":1,"x":0,"y":0,"polygon":[{"x":0.1,"y":1000000000.5},{"x":1,"y":1}]}]}]}"#;
        let map = parse_tiled_tmj(text, None, None).expect("map");
        let polygon = map
            .layers
            .iter()
            .find_map(|layer| match layer {
                TiledLayer::ObjectGroup(group) => group.objects[0].polygon.clone(),
                _ => None,
            })
            .expect("polygon");
        assert_eq!((polygon[0].x, polygon[0].y), (0.1, 1_000_000_000.5));
    }

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
