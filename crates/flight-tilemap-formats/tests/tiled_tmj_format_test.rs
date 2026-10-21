use flight_tilemap_formats::*;

mod format_tiled_tileset_json {
    use super::*;

    #[test]
    fn formats_minimal_tileset() {
        let tileset = TiledTileset {
            columns: 4,
            image: Some("tiles.png".to_string()),
            image_height: 128,
            image_width: 128,
            margin: 0,
            name: "test".to_string(),
            object_alignment: TiledObjectAlignment::Unspecified,
            properties: vec![],
            spacing: 0,
            tile_offset_x: 0,
            tile_offset_y: 0,
            tile_count: 16,
            tile_height: 32,
            tile_width: 32,
            tiles: vec![],
        };
        let json = format_tiled_tileset_json(&tileset);
        assert!(json.contains("\"name\""));
        assert!(json.contains("test"));
    }
}

mod format_tiled_tmj {
    use super::*;

    #[test]
    fn formats_minimal_map() {
        let map = TiledMap {
            background_color: None,
            height: 10,
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
            width: 10,
        };
        let json = format_tiled_tmj(&map);
        assert!(json.contains("\"width\""));
        assert!(json.contains("\"height\""));
    }
}
