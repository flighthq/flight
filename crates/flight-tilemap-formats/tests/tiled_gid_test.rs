use flight_tilemap_formats::*;

mod decode_tiled_gid {
    use super::*;

    #[test]
    fn decodes_zero() {
        let gid = decode_tiled_gid(0);
        assert_eq!(gid.tile_id, 0);
        assert!(!gid.flip_horizontal);
        assert!(!gid.flip_vertical);
        assert!(!gid.flip_diagonal);
    }

    #[test]
    fn decodes_simple_id() {
        let gid = decode_tiled_gid(42);
        assert_eq!(gid.tile_id, 42);
    }

    #[test]
    fn decodes_horizontal_flip() {
        let gid = decode_tiled_gid(0x80000000 | 42);
        assert_eq!(gid.tile_id, 42);
        assert!(gid.flip_horizontal);
    }
}

mod get_tiled_tileset_ref_for_gid {
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
        assert!(get_tiled_tileset_ref_for_gid(&map, 1).is_none());
    }
}
