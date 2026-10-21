use flight_tilemap_formats::*;

mod build_tilemap_layers_from_tiled {
    use super::*;

    #[test]
    fn returns_none_for_empty_map() {
        let map = TiledMap {
            background_color: None,
            height: 0,
            hex_side_length: None,
            infinite: false,
            layers: vec![],
            orientation: TiledOrientation::Orthogonal,
            properties: vec![],
            render_order: TiledRenderOrder::RightDown,
            stagger_axis: None,
            stagger_index: None,
            tile_height: 32,
            tile_width: 32,
            tiled_version: None,
            tilesets: vec![],
            version: "1.0".to_string(),
            width: 0,
        };
        let result = build_tilemap_layers_from_tiled(&map, 0, &|_| None, None);
        assert!(result.is_none());
    }
}
