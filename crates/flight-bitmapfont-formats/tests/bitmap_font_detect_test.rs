use std::sync::Arc;

use flight_bitmapfont_formats::*;
use flight_encoding::encode_utf8;

use crate::support::*;

fn binary() -> Vec<u8> {
    fn block(kind: u8, data: &[u8]) -> Vec<u8> {
        let mut out = vec![kind];
        out.extend((data.len() as u32).to_le_bytes());
        out.extend(data);
        return out;
    }
    let mut common = vec![0; 15];
    common[0..2].copy_from_slice(&32_u16.to_le_bytes());
    common[2..4].copy_from_slice(&26_u16.to_le_bytes());
    let mut character = vec![0; 20];
    character[0..4].copy_from_slice(&65_u32.to_le_bytes());
    character[8..10].copy_from_slice(&7_u16.to_le_bytes());
    character[10..12].copy_from_slice(&8_u16.to_le_bytes());
    character[16..18].copy_from_slice(&9_i16.to_le_bytes());
    let mut out = vec![66, 77, 70, 3];
    out.extend(block(2, &common));
    out.extend(block(3, b"test_0.png\0"));
    out.extend(block(4, &character));
    return out;
}

fn corpus() -> Vec<(BitmapFontFormatKind, Vec<u8>)> {
    return vec![
        (BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string(), binary()),
        (
            BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON.to_string(),
            encode_utf8(FNT_JSON).to_vec(),
        ),
        (
            BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string(),
            encode_utf8(FNT_TEXT).to_vec(),
        ),
        (
            BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string(),
            encode_utf8(FNT_XML).to_vec(),
        ),
    ];
}

fn kinds(registry: &BitmapFontFormatRegistry) -> Vec<BitmapFontFormatKind> {
    let mut out = Vec::new();
    get_bitmap_font_format_kinds(&mut out, registry);
    return out;
}

#[test]
fn import_options_install_named_formats_and_missing_formats_install_nothing() {
    let guard = guard_state();
    let mut registry = create_bitmap_font_format_registry(&guard);
    let kind = "acme.SeamFont".to_string();
    let entry = Arc::new(BitmapFontFormatEntry {
        detect: Arc::new(|_bytes| false),
        parse: Arc::new(|_bytes, _options, _diagnostics| None),
    });
    apply_bitmap_font_import_options(
        &mut registry,
        &BitmapFontImportOptions {
            formats: Some(vec![BitmapFontFormatDescriptor {
                entry: entry.clone(),
                kind: kind.clone(),
            }]),
        },
    );
    assert!(Arc::ptr_eq(
        &get_bitmap_font_format(&registry, &kind).unwrap(),
        &entry
    ));
    unregister_bitmap_font_format(
        &mut registry,
        &BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string(),
    );
    apply_bitmap_font_import_options(&mut registry, &BitmapFontImportOptions { formats: None });
    assert!(
        get_bitmap_font_format(&registry, &BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string())
            .is_none()
    );
}

#[test]
fn all_formats_cover_builtins_with_same_entry_identity_and_unique_names() {
    let guard = guard_state();
    let registry = create_bitmap_font_format_registry(&guard);
    let formats = bitmap_font_all_formats(&registry);
    assert_eq!(formats.len(), 4);
    assert_eq!(
        formats
            .iter()
            .map(|value| value.kind.as_str())
            .collect::<Vec<_>>(),
        vec![
            BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_XML,
        ]
    );
    assert_eq!(kinds(&registry).len(), 4);
    for descriptor in formats {
        assert!(Arc::ptr_eq(
            &descriptor.entry,
            &get_bitmap_font_format(&registry, &descriptor.kind).unwrap()
        ));
    }
}

#[test]
fn every_corpus_document_matches_exactly_one_builtin() {
    let guard = guard_state();
    let registry = create_bitmap_font_format_registry(&guard);
    for (expected, bytes) in corpus() {
        let accepting: Vec<&str> = bitmap_font_all_formats(&registry)
            .iter()
            .filter(|descriptor| (descriptor.entry.detect)(&bytes))
            .map(|descriptor| descriptor.kind.as_str())
            .collect();
        assert_eq!(accepting, vec![expected.as_str()]);
    }
}

#[test]
fn reverse_registration_order_does_not_change_builtin_detection() {
    let guard = guard_state();
    let mut registry = create_bitmap_font_format_registry(&guard);
    let forward: Vec<_> = corpus()
        .iter()
        .map(|(_, bytes)| detect_bitmap_font_format(&registry, bytes))
        .collect();
    let reversed: Vec<_> = bitmap_font_all_formats(&registry)
        .iter()
        .rev()
        .cloned()
        .collect();
    let names: Vec<_> = bitmap_font_all_formats(&registry)
        .iter()
        .map(|descriptor| descriptor.kind.clone())
        .collect();
    for kind in names {
        unregister_bitmap_font_format(&mut registry, &kind);
    }
    assert!(kinds(&registry).is_empty());
    apply_bitmap_font_import_options(
        &mut registry,
        &BitmapFontImportOptions {
            formats: Some(reversed),
        },
    );
    let actual: Vec<_> = corpus()
        .iter()
        .map(|(_, bytes)| detect_bitmap_font_format(&registry, bytes))
        .collect();
    assert_eq!(actual, forward);
}

#[test]
fn descriptor_accessors_name_their_exact_kinds() {
    let guard = guard_state();
    let registry = create_bitmap_font_format_registry(&guard);
    assert_eq!(
        bm_font_binary_format(&registry).kind,
        BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY
    );
    assert_eq!(
        bm_font_json_format(&registry).kind,
        BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON
    );
    assert_eq!(
        bm_font_text_format(&registry).kind,
        BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT
    );
    assert_eq!(
        bm_font_xml_format(&registry).kind,
        BITMAP_FONT_FORMAT_KIND_BM_FONT_XML
    );
}

#[test]
fn detection_requires_exact_structural_discriminants() {
    let guard = guard_state();
    let registry = create_bitmap_font_format_registry(&guard);
    assert_eq!(
        detect_bitmap_font_format(&registry, &[66, 77, 70, 3]),
        Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string())
    );
    assert_eq!(detect_bitmap_font_format(&registry, &[66, 77, 70, 2]), None);
    assert_eq!(
        detect_bitmap_font_format(
            &registry,
            b"<?xml version=\"1.0\"?><TextureAtlas imagePath=\"a.png\"/>"
        ),
        None
    );
    assert_eq!(
        detect_bitmap_font_format(&registry, b"<?xml version=\"1.0\"?><!DOCTYPE font><font/>")
            .as_deref(),
        Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_XML)
    );
    assert_eq!(
        detect_bitmap_font_format(&registry, b"this is not a font\ncommon lineHeight=1"),
        None
    );
    assert_eq!(
        detect_bitmap_font_format(&registry, br#"{"frames":{},"meta":{}}"#),
        None
    );
    assert_eq!(detect_bitmap_font_format(&registry, b""), None);
}

#[test]
fn get_and_enumerate_reflect_registration_and_unregistration() {
    let guard = guard_state();
    let mut registry = create_bitmap_font_format_registry(&guard);
    let text = BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string();
    assert!(Arc::ptr_eq(
        &get_bitmap_font_format(&registry, &text).unwrap(),
        &bm_font_text_format(&registry).entry
    ));
    assert!(get_bitmap_font_format(&registry, &"acme.Absent".to_string()).is_none());
    let kind = "acme.Enumerated".to_string();
    register_bitmap_font_format(
        &mut registry,
        &kind,
        Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|_bytes| false),
            parse: Arc::new(|_bytes, _options, _diagnostics| None),
        }),
    );
    assert!(kinds(&registry).contains(&kind));
    unregister_bitmap_font_format(&mut registry, &kind);
    assert!(!kinds(&registry).contains(&kind));
}

#[test]
fn parse_auto_detects_all_builtins_and_honors_explicit_kind() {
    let guard = guard_state();
    let registry = create_bitmap_font_format_registry(&guard);
    for (_, bytes) in corpus() {
        assert!(parse_bitmap_font(&registry, &bytes, None, Some(&page_options()), None).is_some());
    }
    assert!(
        parse_bitmap_font(
            &registry,
            FNT_TEXT.as_bytes(),
            Some(&BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string()),
            Some(&page_options()),
            None,
        )
        .is_some()
    );
    assert!(parse_bitmap_font(&registry, &[0, 1, 2], None, None, None).is_none());
    assert!(
        parse_bitmap_font(
            &registry,
            FNT_TEXT.as_bytes(),
            Some(&"acme.Absent".to_string()),
            None,
            None,
        )
        .is_none()
    );
}

#[test]
fn custom_registration_is_detectable_parseable_last_write_wins_and_removable() {
    let guard = guard_state();
    let parser_guard = guard.clone();
    let mut registry = create_bitmap_font_format_registry(&guard);
    let kind = "acme.CustomFont".to_string();
    let first = Arc::new(BitmapFontFormatEntry {
        detect: Arc::new(|bytes| bytes.first() == Some(&0x7a)),
        parse: Arc::new(move |_bytes, options, diagnostics| {
            parse_bitmap_font_fnt(&parser_guard, FNT_TEXT, options, diagnostics)
        }),
    });
    register_bitmap_font_format(&mut registry, &kind, first);
    assert_eq!(
        detect_bitmap_font_format(&registry, &[0x7a]),
        Some(kind.clone())
    );
    assert!(parse_bitmap_font(&registry, &[0x7a], None, Some(&page_options()), None).is_some());
    let replacement = Arc::new(BitmapFontFormatEntry {
        detect: Arc::new(|bytes| bytes == [0x7b]),
        parse: Arc::new(|_bytes, _options, _diagnostics| None),
    });
    register_bitmap_font_format(&mut registry, &kind, replacement.clone());
    assert!(Arc::ptr_eq(
        &get_bitmap_font_format(&registry, &kind).unwrap(),
        &replacement
    ));
    unregister_bitmap_font_format(&mut registry, &kind);
    assert_eq!(detect_bitmap_font_format(&registry, &[0x7b]), None);
}

#[test]
fn unregistering_builtin_removes_it_until_explicitly_reapplied() {
    let guard = guard_state();
    let mut registry = create_bitmap_font_format_registry(&guard);
    let kind = BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY.to_string();
    let descriptor = bm_font_binary_format(&registry).clone();
    unregister_bitmap_font_format(&mut registry, &kind);
    assert_eq!(detect_bitmap_font_format(&registry, &binary()), None);
    apply_bitmap_font_import_options(
        &mut registry,
        &BitmapFontImportOptions {
            formats: Some(vec![descriptor]),
        },
    );
    assert_eq!(detect_bitmap_font_format(&registry, &binary()), Some(kind));
}

mod apply_bitmap_font_import_options {
    use super::*;

    #[test]
    fn installs_explicit_descriptors() {
        let guard = guard_state();
        let mut registry = create_bitmap_font_format_registry(&guard);
        let descriptor = bm_font_text_format(&registry).clone();
        let kind = descriptor.kind.clone();
        unregister_bitmap_font_format(&mut registry, &kind);
        apply_bitmap_font_import_options(
            &mut registry,
            &BitmapFontImportOptions {
                formats: Some(vec![descriptor]),
            },
        );
        assert!(get_bitmap_font_format(&registry, &kind).is_some());
    }
}

mod bitmap_font_all_formats {
    use super::*;

    #[test]
    fn returns_the_builtin_descriptors() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(bitmap_font_all_formats(&registry).len(), 4);
    }
}

mod bm_font_binary_format {
    use super::*;

    #[test]
    fn returns_the_binary_descriptor() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            bm_font_binary_format(&registry).kind,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_BINARY
        );
    }
}

mod bm_font_json_format {
    use super::*;

    #[test]
    fn returns_the_json_descriptor() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            bm_font_json_format(&registry).kind,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_JSON
        );
    }
}

mod bm_font_text_format {
    use super::*;

    #[test]
    fn returns_the_text_descriptor() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            bm_font_text_format(&registry).kind,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT
        );
    }
}

mod bm_font_xml_format {
    use super::*;

    #[test]
    fn returns_the_xml_descriptor() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            bm_font_xml_format(&registry).kind,
            BITMAP_FONT_FORMAT_KIND_BM_FONT_XML
        );
    }
}

mod create_bitmap_font_format_registry {
    use super::*;

    #[test]
    fn creates_a_registry_with_all_builtins() {
        let guard = guard_state();
        assert_eq!(kinds(&create_bitmap_font_format_registry(&guard)).len(), 4);
    }
}

mod detect_bitmap_font_format {
    use super::*;

    #[test]
    fn detects_a_text_document() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            detect_bitmap_font_format(&registry, FNT_TEXT.as_bytes()).as_deref(),
            Some(BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT)
        );
    }
}

mod get_bitmap_font_format {
    use super::*;

    #[test]
    fn returns_a_registered_entry() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(
            get_bitmap_font_format(&registry, &BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string())
                .is_some()
        );
    }
}

mod get_bitmap_font_format_kinds {
    use super::*;

    #[test]
    fn writes_the_registered_kinds() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(kinds(&registry).len(), 4);
    }
}

mod parse_bitmap_font {
    use super::*;

    #[test]
    fn parses_a_detected_text_document() {
        let guard = guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(
            parse_bitmap_font(
                &registry,
                FNT_TEXT.as_bytes(),
                None,
                Some(&page_options()),
                None
            )
            .is_some()
        );
    }
}

mod register_bitmap_font_format {
    use super::*;

    #[test]
    fn adds_a_custom_entry() {
        let guard = guard_state();
        let mut registry = create_bitmap_font_format_registry(&guard);
        let kind = "acme.Registered".to_string();
        register_bitmap_font_format(
            &mut registry,
            &kind,
            Arc::new(BitmapFontFormatEntry {
                detect: Arc::new(|_bytes| false),
                parse: Arc::new(|_bytes, _options, _diagnostics| None),
            }),
        );
        assert!(get_bitmap_font_format(&registry, &kind).is_some());
    }
}

mod unregister_bitmap_font_format {
    use super::*;

    #[test]
    fn removes_a_registered_entry() {
        let guard = guard_state();
        let mut registry = create_bitmap_font_format_registry(&guard);
        let kind = BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string();
        unregister_bitmap_font_format(&mut registry, &kind);
        assert!(get_bitmap_font_format(&registry, &kind).is_none());
    }
}
