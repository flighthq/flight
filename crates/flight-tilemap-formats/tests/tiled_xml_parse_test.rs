//! flight-compiler: target-native

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
    fn parses_polyline_points_as_exact_doubles() {
        // 0.1 is not an f32 value; the parsed point keeps the text's double exactly.
        let text = r#"<map version="1.10" orientation="orthogonal" width="1" height="1" tilewidth="32" tileheight="32"><objectgroup id="1" name="paths"><object id="1" x="0" y="0"><polyline points="0.1,0.2 1,1"/></object></objectgroup></map>"#;
        let map = parse_tiled_tmx(text, None, None).expect("map");
        let polyline = map
            .layers
            .iter()
            .find_map(|layer| match layer {
                TiledLayer::ObjectGroup(group) => group.objects[0].polyline.clone(),
                _ => None,
            })
            .expect("polyline");
        assert_ne!(f64::from(0.1_f32), 0.1);
        assert_eq!((polyline[0].x, polyline[0].y), (0.1, 0.2));
    }

    #[test]
    fn returns_none_for_non_map_xml() {
        let result = parse_tiled_tmx("<root></root>", None, None);
        assert!(result.is_none());
    }
}
