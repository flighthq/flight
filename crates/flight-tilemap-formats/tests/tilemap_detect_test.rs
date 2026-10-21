use flight_registry::KindMap;
use flight_tilemap_formats::*;

fn make_tilemap_registry() -> KindMap<TilemapFormatEntry> {
    let mut tilemap_reg = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    let mut tileset_reg = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    apply_tilemap_import_options(
        &mut tilemap_reg,
        &mut tileset_reg,
        TilemapImportOptions {
            map_formats: Some(tilemap_all_map_formats()),
            tileset_formats: None,
        },
    );
    return tilemap_reg;
}

fn make_tileset_registry() -> KindMap<TilesetFormatEntry> {
    let mut tilemap_reg = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    let mut tileset_reg = KindMap {
        entries: std::collections::HashMap::new(),
        key_order: Vec::new(),
    };
    apply_tilemap_import_options(
        &mut tilemap_reg,
        &mut tileset_reg,
        TilemapImportOptions {
            map_formats: None,
            tileset_formats: Some(tilemap_all_tileset_formats()),
        },
    );
    return tileset_reg;
}

mod apply_tilemap_import_options {
    use super::*;

    #[test]
    fn adds_map_formats() {
        let mut tilemap_reg = make_tilemap_registry();
        let mut tileset_reg = make_tileset_registry();
        let before = get_tilemap_format_kinds(&tilemap_reg).len();
        apply_tilemap_import_options(
            &mut tilemap_reg,
            &mut tileset_reg,
            TilemapImportOptions {
                map_formats: Some(tilemap_all_map_formats()),
                tileset_formats: None,
            },
        );
        assert!(get_tilemap_format_kinds(&tilemap_reg).len() >= before);
    }
}

mod create_default_tilemap_registry {
    use super::*;

    #[test]
    fn is_not_empty() {
        let reg = create_default_tilemap_registry();
        assert!(!get_tilemap_format_kinds(&reg).is_empty());
    }
}

mod create_default_tileset_registry {
    use super::*;

    #[test]
    fn is_not_empty() {
        let reg = create_default_tileset_registry();
        assert!(!get_tileset_format_kinds(&reg).is_empty());
    }
}

mod detect_tilemap_format {
    use super::*;

    #[test]
    fn detects_tmj() {
        let tilemap_reg = make_tilemap_registry();
        let tileset_reg = make_tileset_registry();
        let json = r#"{"type":"map","version":"1.10","width":10,"height":10,"tilewidth":32,"tileheight":32,"layers":[],"tilesets":[]}"#;
        let kind = detect_tilemap_format(&tilemap_reg, &tileset_reg, json);
        assert_eq!(kind.as_deref(), Some(TILEMAP_FORMAT_KIND_TILED_TMJ));
    }

    #[test]
    fn detects_tmx() {
        let tilemap_reg = make_tilemap_registry();
        let tileset_reg = make_tileset_registry();
        let xml = r#"<?xml version="1.0"?><map version="1.0" width="10" height="10" tilewidth="32" tileheight="32"></map>"#;
        let kind = detect_tilemap_format(&tilemap_reg, &tileset_reg, xml);
        assert_eq!(kind.as_deref(), Some(TILEMAP_FORMAT_KIND_TILED_TMX));
    }

    #[test]
    fn returns_none_for_unknown() {
        let tilemap_reg = make_tilemap_registry();
        let tileset_reg = make_tileset_registry();
        let kind = detect_tilemap_format(&tilemap_reg, &tileset_reg, "hello world");
        assert!(kind.is_none());
    }
}

mod get_tilemap_format {
    use super::*;

    #[test]
    fn finds_tmj() {
        let reg = make_tilemap_registry();
        let entry = get_tilemap_format(&reg, &TILEMAP_FORMAT_KIND_TILED_TMJ.to_string());
        assert!(entry.is_some());
    }
}

mod get_tilemap_format_kinds {
    use super::*;

    #[test]
    fn returns_registered_kinds() {
        let reg = make_tilemap_registry();
        let kinds = get_tilemap_format_kinds(&reg);
        assert!(kinds.contains(&TILEMAP_FORMAT_KIND_TILED_TMJ.to_string()));
    }
}

mod get_tileset_format {
    use super::*;

    #[test]
    fn finds_tsj() {
        let reg = make_tileset_registry();
        let entry = get_tileset_format(&reg, &TILEMAP_FORMAT_KIND_TILED_TSJ.to_string());
        assert!(entry.is_some());
    }
}

mod get_tileset_format_kinds {
    use super::*;

    #[test]
    fn returns_registered_kinds() {
        let reg = make_tileset_registry();
        let kinds = get_tileset_format_kinds(&reg);
        assert!(kinds.contains(&TILEMAP_FORMAT_KIND_TILED_TSJ.to_string()));
    }
}

mod parse_tilemap {
    use super::*;

    #[test]
    fn returns_none_for_garbage() {
        let tilemap_reg = make_tilemap_registry();
        let tileset_reg = make_tileset_registry();
        let result = parse_tilemap(&tilemap_reg, &tileset_reg, "not a map", None, None, None);
        assert!(result.is_none());
    }
}

mod parse_tileset {
    use super::*;

    #[test]
    fn returns_none_for_garbage() {
        let tilemap_reg = make_tilemap_registry();
        let tileset_reg = make_tileset_registry();
        let result = parse_tileset(
            &tilemap_reg,
            &tileset_reg,
            "not a tileset",
            None,
            None,
            None,
        );
        assert!(result.is_none());
    }
}

mod register_tilemap_format {
    use super::*;

    #[test]
    fn adds_format() {
        let mut reg = make_tilemap_registry();
        let before = get_tilemap_format_kinds(&reg).len();
        register_tilemap_format(
            &mut reg,
            "custom.test".to_string(),
            TilemapFormatEntry {
                detect: std::sync::Arc::new(|_| false),
                parse: std::sync::Arc::new(|_, _, _| None),
            },
        );
        assert_eq!(get_tilemap_format_kinds(&reg).len(), before + 1);
    }
}

mod register_tileset_format {
    use super::*;

    #[test]
    fn adds_format() {
        let mut reg = make_tileset_registry();
        let before = get_tileset_format_kinds(&reg).len();
        register_tileset_format(
            &mut reg,
            "custom.test".to_string(),
            TilesetFormatEntry {
                detect: std::sync::Arc::new(|_| false),
                parse: std::sync::Arc::new(|_, _, _| None),
            },
        );
        assert_eq!(get_tileset_format_kinds(&reg).len(), before + 1);
    }
}

mod tiled_tmj_tilemap_format {
    use super::*;

    #[test]
    fn returns_descriptor() {
        let desc = tiled_tmj_tilemap_format();
        assert_eq!(desc.kind, TILEMAP_FORMAT_KIND_TILED_TMJ);
    }
}

mod tiled_tmx_tilemap_format {
    use super::*;

    #[test]
    fn returns_descriptor() {
        let desc = tiled_tmx_tilemap_format();
        assert_eq!(desc.kind, TILEMAP_FORMAT_KIND_TILED_TMX);
    }
}

mod tiled_tsj_tileset_format {
    use super::*;

    #[test]
    fn returns_descriptor() {
        let desc = tiled_tsj_tileset_format();
        assert_eq!(desc.kind, TILEMAP_FORMAT_KIND_TILED_TSJ);
    }
}

mod tiled_tsx_tileset_format {
    use super::*;

    #[test]
    fn returns_descriptor() {
        let desc = tiled_tsx_tileset_format();
        assert_eq!(desc.kind, TILEMAP_FORMAT_KIND_TILED_TSX);
    }
}

mod tilemap_all_map_formats {
    use super::*;

    #[test]
    fn returns_two() {
        let fmts = tilemap_all_map_formats();
        assert_eq!(fmts.len(), 2);
    }
}

mod tilemap_all_tileset_formats {
    use super::*;

    #[test]
    fn returns_two() {
        let fmts = tilemap_all_tileset_formats();
        assert_eq!(fmts.len(), 2);
    }
}

mod unregister_tilemap_format {
    use super::*;

    #[test]
    fn removes_format() {
        let mut reg = make_tilemap_registry();
        let before = get_tilemap_format_kinds(&reg).len();
        unregister_tilemap_format(&mut reg, &TILEMAP_FORMAT_KIND_TILED_TMJ.to_string());
        assert_eq!(get_tilemap_format_kinds(&reg).len(), before - 1);
    }
}

mod unregister_tileset_format {
    use super::*;

    #[test]
    fn removes_format() {
        let mut reg = make_tileset_registry();
        let before = get_tileset_format_kinds(&reg).len();
        unregister_tileset_format(&mut reg, &TILEMAP_FORMAT_KIND_TILED_TSJ.to_string());
        assert_eq!(get_tileset_format_kinds(&reg).len(), before - 1);
    }
}
