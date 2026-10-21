use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const NESTED_ARTBOARD: u64 = 92;
const IMAGE: u64 = 100;
const FILE_ASSET: i32 = 103;
const NESTED_ARTBOARD_LAYOUT: i32 = 452;
const IMAGE_ASSET: u64 = 105;
const FONT_ASSET: u64 = 141;
const AUDIO_ASSET: u64 = 406;
const FILE_ASSET_CONTENTS: u64 = 106;
const SHAPE: u64 = 3;

const NAME: u64 = 203;
const HEIGHT: u64 = 207;
const WIDTH: u64 = 208;
const BYTES: u64 = 212;
const CDN_BASE_URL: u64 = 362;

mod create_rive_file_assets {
    use super::*;

    #[test]
    fn returns_nothing_for_a_file_that_declares_no_asset() {
        assert!(create_rive_file_assets(&[object(SHAPE, &[])], None).is_empty());
    }

    #[test]
    fn keeps_assets_in_the_order_the_file_declares_them() {
        let assets = create_rive_file_assets(
            &[
                text(IMAGE_ASSET, NAME, "first"),
                text(FONT_ASSET, NAME, "second"),
                text(AUDIO_ASSET, NAME, "third"),
            ],
            None,
        );
        assert_eq!(
            assets
                .iter()
                .map(|asset| asset.name.as_str())
                .collect::<Vec<_>>(),
            ["first", "second", "third"],
        );
    }

    #[test]
    fn names_each_asset_kind_so_a_caller_can_tell_them_apart() {
        let assets = create_rive_file_assets(
            &[
                object(IMAGE_ASSET, &[]),
                object(FONT_ASSET, &[]),
                object(AUDIO_ASSET, &[]),
            ],
            None,
        );
        assert_eq!(
            assets
                .iter()
                .map(|asset| asset.kind.as_str())
                .collect::<Vec<_>>(),
            ["ImageAsset", "FontAsset", "AudioAsset"],
        );
    }

    #[test]
    fn reads_the_dimensions_a_drawable_asset_states() {
        let assets = create_rive_file_assets(
            &[object(IMAGE_ASSET, &[(WIDTH, 128.0), (HEIGHT, 64.0)])],
            None,
        );
        assert_eq!((assets[0].height, assets[0].width), (64.0, 128.0));
    }

    #[test]
    fn carries_embedded_bytes_untouched_from_the_contents_that_follows_the_asset() {
        let payload = [0x89, 0x50, 0x4e, 0x47, 0x00, 0xff];
        let assets = create_rive_file_assets(
            &[
                object(IMAGE_ASSET, &[]),
                bytes(FILE_ASSET_CONTENTS, BYTES, &payload),
            ],
            None,
        );
        assert_eq!(assets[0].bytes.as_deref(), Some(payload.as_slice()));
    }

    #[test]
    fn attaches_contents_to_the_asset_it_follows_not_to_the_first_one() {
        let assets = create_rive_file_assets(
            &[
                object(IMAGE_ASSET, &[]),
                bytes(FILE_ASSET_CONTENTS, BYTES, &[1, 2]),
                object(FONT_ASSET, &[]),
                bytes(FILE_ASSET_CONTENTS, BYTES, &[3, 4]),
            ],
            None,
        );
        assert_eq!(assets[0].bytes.as_deref(), Some([1, 2].as_slice()));
        assert_eq!(assets[1].bytes.as_deref(), Some([3, 4].as_slice()));
    }

    #[test]
    fn leaves_bytes_none_for_an_asset_the_file_does_not_embed() {
        let assets = create_rive_file_assets(
            &[text(IMAGE_ASSET, CDN_BASE_URL, "https://example.test/")],
            None,
        );
        assert!(assets[0].bytes.is_none());
        assert_eq!(assets[0].cdn_base_url, "https://example.test/");
    }

    #[test]
    fn reports_contents_that_precede_any_asset_instead_of_discarding_the_payload_silently() {
        let mut diagnostics = Vec::new();
        let assets = create_rive_file_assets(
            &[bytes(FILE_ASSET_CONTENTS, BYTES, &[1, 2, 3])],
            Some(&mut diagnostics),
        );
        assert!(assets.is_empty());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "rive.asset-contents-unowned");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            diagnostics[0]
                .detail
                .as_ref()
                .unwrap()
                .get("bytes")
                .unwrap(),
            &flight_importdiagnostics::ImportDiagnosticDetailValue::Number(3.0),
        );
    }

    #[test]
    fn stays_silent_when_contents_follow_the_asset_that_owns_them() {
        let mut diagnostics = Vec::new();
        let assets = create_rive_file_assets(
            &[
                object(IMAGE_ASSET, &[]),
                bytes(FILE_ASSET_CONTENTS, BYTES, &[1, 2, 3]),
            ],
            Some(&mut diagnostics),
        );
        assert_eq!(assets[0].bytes.as_deref(), Some([1, 2, 3].as_slice()));
        assert!(diagnostics.is_empty());
    }
}

mod import_rive_image_component {
    use super::*;

    #[test]
    fn stands_up_a_sprite_named_by_the_drawable_waiting_on_the_asset_position_it_states() {
        let image = object_with_name(IMAGE, &[(206, 2.0)], "logo");
        let objects = [object(ARTBOARD, &[]), image];
        let mut context = context_of(&objects);
        let node = import_rive_image_component(&mut context, 1).unwrap();
        assert_eq!(
            node.read().unwrap().node_fields().name.as_deref(),
            Some("logo"),
        );
        assert_eq!(get_rive_image_asset_index(&node), 2);
    }
}

mod import_rive_nested_artboard_component {
    use super::*;

    #[test]
    fn marks_the_site_with_the_artboard_it_names_so_the_document_layer_can_make_a_slot() {
        let objects = [
            object(ARTBOARD, &[]),
            object(NESTED_ARTBOARD, &[(197, 1.0)]),
        ];
        let mut context = context_of(&objects);
        let node = import_rive_nested_artboard_component(&mut context, 1).unwrap();
        assert_eq!(get_rive_nested_artboard_index(&node), 1);
    }
}

mod register_rive_asset_handlers {
    use super::*;

    #[test]
    fn reads_the_asset_list_as_a_document_pass_because_an_asset_is_not_a_component() {
        let mut registry = create_rive_import_registry();
        register_rive_asset_handlers(&mut registry);
        let asset = get_rive_core_object_handler(&registry, FILE_ASSET).unwrap();
        assert!(asset.apply_document.is_some());
        assert!(asset.import_component.is_none());
    }

    #[test]
    fn claims_the_drawables_that_reference_content_declared_elsewhere_in_the_file() {
        let mut registry = create_rive_import_registry();
        register_rive_asset_handlers(&mut registry);
        assert!(
            get_rive_core_object_handler(&registry, IMAGE as i32)
                .unwrap()
                .import_component
                .is_some(),
        );
        assert!(
            get_rive_core_object_handler(&registry, NESTED_ARTBOARD_LAYOUT)
                .unwrap()
                .import_component
                .is_some(),
        );
    }

    #[test]
    fn collects_an_image_asset_through_the_document_pass_it_registers() {
        let mut registry = create_rive_import_registry();
        register_rive_asset_handlers(&mut registry);
        let objects = [text(IMAGE_ASSET, NAME, "logo")];
        let mut context = create_rive_document_import_context(&registry, &objects, None);
        get_rive_core_object_handler(&registry, FILE_ASSET)
            .unwrap()
            .apply_document
            .as_ref()
            .unwrap()(&mut context);
        assert_eq!(context.assets[0].name, "logo");
    }
}

fn bytes(type_key: u64, key: u64, value: &[u8]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![RiveProperty {
            key,
            r#type: RiveFieldType::String,
            value: RiveValue::Bytes(value.into()),
        }],
        type_key,
    };
}

fn context_of<'a>(objects: &'a [RiveCoreObject]) -> RiveArtboardImportContext<'a> {
    let graph = Box::leak(Box::new(RiveArtboardGraph {
        objects: objects.to_vec(),
        parent_indices: (0..objects.len())
            .map(|index| if index == 0 { -1 } else { 0 })
            .collect(),
        stream_end: objects.len(),
        stream_start: 0,
    }));
    let registry = Box::leak(Box::new(create_rive_import_registry()));
    let root: Node2DRef = create_display_object(None);
    return create_rive_artboard_import_context(registry, graph, objects, root, &[], None);
}

fn object(type_key: u64, properties: &[(u64, f32)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: properties
            .iter()
            .map(|(key, value)| RiveProperty {
                key: *key,
                r#type: RiveFieldType::Double,
                value: RiveValue::Double(*value),
            })
            .collect(),
        type_key,
    };
}

fn object_with_name(type_key: u64, properties: &[(u64, f32)], name: &str) -> RiveCoreObject {
    let mut object = object(type_key, properties);
    object.properties.push(RiveProperty {
        key: 4,
        r#type: RiveFieldType::String,
        value: RiveValue::String(name.to_string()),
    });
    return object;
}

fn text(type_key: u64, key: u64, value: &str) -> RiveCoreObject {
    return RiveCoreObject {
        properties: vec![RiveProperty {
            key,
            r#type: RiveFieldType::String,
            value: RiveValue::String(value.to_string()),
        }],
        type_key,
    };
}
